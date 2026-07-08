const config     = require('./config');
const QuizGame   = require('./QuizGame');
const SortGame   = require('./SortGame');
const CatchGame  = require('./CatchGame');
const MemoryGame = require('./MemoryGame');

const GAME_MAP = { quiz: QuizGame, sort: SortGame, catch: CatchGame, memory: MemoryGame };

const GAME_INFO = {
  quiz:   { label: 'Recycling Quiz',   emoji: '🧠', description: 'Answer 5 questions about recycling',  color: '#8B2FC9' },
  sort:   { label: 'Sort the Waste',   emoji: '🗑️',  description: 'Sort items into the correct bin',    color: '#3b82f6' },
  catch:  { label: 'Catch It!',        emoji: '🎯', description: 'Catch recyclables, skip the rest',   color: '#f59e0b' },
  memory: { label: 'Memory Match',     emoji: '🃏', description: 'Match recycling pairs from memory',  color: '#22c55e' },
};

const STATUS = {
  WAITING:        'WAITING',
  PLAYING:        'PLAYING',
  SHOWING_RESULT: 'SHOWING_RESULT',
  FINISHED:       'FINISHED',
  MAINTENANCE:    'MAINTENANCE'
};

class GameManager {
  constructor(machineId, io) {
    this.machineId      = machineId;
    this.io             = io;
    this.room           = `machine:${machineId}`;
    this.status         = STATUS.WAITING;
    this.currentPlayer  = null;
    this.currentGame    = null;
    this.queues         = { quiz: [], sort: [], catch: [], memory: [] };
    this.selecting      = new Map(); // socketId → { id, name } — entered name, picking game
    this.leaderboard    = [];
    this.timerHandle    = null;
    this.timeLeft       = 0;
    this.maintenance    = false;
  }

  // ── Public API ──────────────────────────────────────────────

  joinPlayer(socket, name) {
    if (this.maintenance) {
      socket.emit('maintenance', { message: 'Game is temporarily unavailable. Please try again soon.' });
      return;
    }

    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) { socket.emit('error', { message: 'Please enter a valid name.' }); return; }

    if (this._isAlreadyInSession(socket.id)) {
      socket.emit('error', { message: 'You are already in the game or queue.' });
      return;
    }

    this.selecting.set(socket.id, { id: socket.id, name: trimmed });
    this._log(`${trimmed} is choosing a game`);

    // Send them the game picker with live queue counts
    socket.emit('choose_game', {
      playerName: trimmed,
      gameInfo:   GAME_INFO,
      counts:     this._getQueueCounts()
    });

    // Tell screen someone is choosing
    this._broadcastToScreen('player_choosing', { playerName: trimmed });
  }

  selectGame(socket, gameType) {
    const player = this.selecting.get(socket.id);
    if (!player || !GAME_MAP[gameType]) {
      socket.emit('error', { message: 'Invalid selection.' });
      return;
    }

    this.selecting.delete(socket.id);
    const fullPlayer = { ...player, gameType, joinedAt: Date.now() };

    if (this.status === STATUS.WAITING) {
      this._startGame(fullPlayer);
    } else {
      this.queues[gameType].push(fullPlayer);
      const position = this._getPlayerQueuePosition(socket.id);
      socket.emit('joined_queue', { position, gameType, gameInfo: GAME_INFO[gameType] });
      this._broadcastQueueCounts();
      this._log(`${player.name} joined ${gameType} queue (pos ${position})`);
    }
  }

  submitAnswer(socket, value) {
    if (!this.currentPlayer || this.currentPlayer.id !== socket.id) return;
    if (this.status !== STATUS.PLAYING) return;

    this._clearTimer();
    this.status = STATUS.SHOWING_RESULT;

    const result = this.currentGame.handleInput(value);
    if (!result) return;

    const extraResult = {};
    // Carry game-specific result fields (lives, pos1/pos2 for memory etc.)
    if (result.lives  !== undefined) extraResult.lives  = result.lives;
    if (result.pos1   !== undefined) extraResult.pos1   = result.pos1;
    if (result.pos2   !== undefined) extraResult.pos2   = result.pos2;
    if (result.emoji1 !== undefined) extraResult.emoji1 = result.emoji1;
    if (result.emoji2 !== undefined) extraResult.emoji2 = result.emoji2;

    this._broadcastToRoom('answer_result', {
      correct:      result.correct,
      correctValue: result.correctValue,
      points:       result.points,
      ...extraResult,
      state: { ...result.state, playerName: this.currentPlayer.name }
    });

    this._broadcastToScreen('answer_feedback', {
      correct:      result.correct,
      correctValue: result.correctValue,
      playerName:   this.currentPlayer.name,
      score:        this.currentGame.getScore(),
      fact:         result.fact,
      gameType:     this.currentGame.getGameType(),
      ...extraResult
    });

    this._log(`${this.currentPlayer.name} — ${result.correct ? 'CORRECT' : 'WRONG'} | Score: ${this.currentGame.getScore()}`);

    setTimeout(() => {
      if (this.currentGame.isFinished()) {
        this._finishGame();
      } else {
        this._nextQuestion();
      }
    }, config.ANSWER_DELAY);
  }

  reconnectPlayer(socket, playerId) {
    if (this.currentPlayer && this.currentPlayer.id === playerId && this.currentGame) {
      const state = { ...this.currentGame.getState(), playerName: this.currentPlayer.name, timeLeft: this.timeLeft };
      socket.emit('reconnect_ok', { state });
    }
  }

  playerDisconnected(socketId) {
    this.selecting.delete(socketId);

    let queueChanged = false;
    for (const gt of Object.keys(this.queues)) {
      const before = this.queues[gt].length;
      this.queues[gt] = this.queues[gt].filter(p => p.id !== socketId);
      if (this.queues[gt].length !== before) queueChanged = true;
    }

    if (queueChanged) {
      this._notifyAllQueuePositions();
      this._broadcastQueueCounts();
    }

    if (this.currentPlayer && this.currentPlayer.id === socketId) {
      this._log(`Active player ${this.currentPlayer.name} disconnected`);
      this._clearTimer();
      setTimeout(() => this._startNextPlayer(), 2000);
    }
  }

  screenConnected(socket) {
    socket.emit('screen_state', { machine: this._getMachineSnapshot() });
  }

  setMaintenance(on) {
    this.maintenance = on;
    this.status = on ? STATUS.MAINTENANCE : STATUS.WAITING;
    this._broadcastToRoom('maintenance', { message: 'Game is temporarily unavailable.' });
  }

  // ── Private ──────────────────────────────────────────────────

  _startGame(player) {
    this.currentPlayer = player;
    const GameClass    = GAME_MAP[player.gameType];
    this.currentGame   = new GameClass();
    this.status        = STATUS.PLAYING;

    this._log(`${player.name} started ${player.gameType}`);

    this._broadcastToRoom('game_started', {
      gameType:   player.gameType,
      gameInfo:   GAME_INFO[player.gameType],
      playerName: player.name
    });
    this._broadcastQueueCounts();

    setTimeout(() => this._nextQuestion(), 600);
  }

  _nextQuestion() {
    this.status = STATUS.PLAYING;
    const state = { ...this.currentGame.showNext(), playerName: this.currentPlayer.name };

    this._broadcastToRoom('question', { state });
    this._broadcastToScreen('question_changed', { state });

    this._log(`Round ${state.progress}/${state.total} [${state.gameType}]`);
    this._startTimer(state.timeLeft);
  }

  _startTimer(duration) {
    this._clearTimer();
    this.timeLeft = duration || config.QUESTION_TIME;

    this.timerHandle = setInterval(() => {
      this.timeLeft--;
      this._broadcastToRoom('timer_tick', { timeLeft: this.timeLeft });

      if (this.timeLeft <= 0) {
        this._clearTimer();
        this._broadcastToRoom('timer_expired', {});
        this.submitAnswer({ id: this.currentPlayer.id }, -1);
      }
    }, 1000);
  }

  _clearTimer() {
    if (this.timerHandle) { clearInterval(this.timerHandle); this.timerHandle = null; }
  }

  _finishGame() {
    this.status = STATUS.FINISHED;
    this._clearTimer();

    const { score } = this.currentGame.finish();
    const { name, gameType } = this.currentPlayer;

    this.leaderboard.push({ name, score, gameType });
    this.leaderboard.sort((a, b) => b.score - a.score);
    if (this.leaderboard.length > 10) this.leaderboard.pop();

    this._log(`${name} finished ${gameType} — score ${score}`);

    this._broadcastToRoom('game_finished', { score, leaderboard: this.leaderboard });
    this._broadcastToScreen('game_finished', { playerName: name, score, gameType, leaderboard: this.leaderboard });

    setTimeout(() => this._countdownNextPlayer(), 3000);
  }

  _countdownNextPlayer() {
    let count = config.NEXT_PLAYER_COUNTDOWN;
    this._broadcastToRoom('next_player_soon', { countdown: count });

    const tick = setInterval(() => {
      count--;
      this._broadcastToRoom('next_player_soon', { countdown: count });
      if (count <= 0) { clearInterval(tick); this._startNextPlayer(); }
    }, 1000);
  }

  _startNextPlayer() {
    this.currentPlayer = null;
    this.currentGame   = null;

    // Pick whoever has waited longest across all queues
    let next = null;
    let nextGameType = null;
    let earliestTime = Infinity;

    for (const [gt, queue] of Object.entries(this.queues)) {
      if (queue.length > 0 && queue[0].joinedAt < earliestTime) {
        earliestTime = queue[0].joinedAt;
        next         = queue[0];
        nextGameType = gt;
      }
    }

    if (!next) {
      this.status = STATUS.WAITING;
      this._broadcastToScreen('screen_waiting', {});
      this._log('All queues empty — waiting');
      return;
    }

    this.queues[nextGameType].shift();
    this._notifyAllQueuePositions();
    this._broadcastQueueCounts();
    this._startGame(next);
  }

  _getQueueCounts() {
    return Object.fromEntries(
      Object.entries(this.queues).map(([gt, q]) => [gt, q.length])
    );
  }

  _getPlayerQueuePosition(socketId) {
    for (const queue of Object.values(this.queues)) {
      const idx = queue.findIndex(p => p.id === socketId);
      if (idx !== -1) return idx + 1;
    }
    return 1;
  }

  _notifyAllQueuePositions() {
    for (const queue of Object.values(this.queues)) {
      queue.forEach((p, i) => {
        this.io.to(p.id).emit('queue_updated', { position: i + 1 });
      });
    }
  }

  _broadcastQueueCounts() {
    const counts = this._getQueueCounts();
    // Notify selecting players so their game picker updates live
    for (const [sid] of this.selecting) {
      this.io.to(sid).emit('queue_counts', counts);
    }
    // Notify queued players
    for (const queue of Object.values(this.queues)) {
      queue.forEach(p => this.io.to(p.id).emit('queue_counts', counts));
    }
    // Update screen sidebar
    const allQueued = Object.entries(this.queues).flatMap(([gt, q]) =>
      q.map(p => ({ name: p.name, gameType: gt }))
    );
    this._broadcastToScreen('queue_updated', { queue: allQueued, counts });
  }

  _broadcastToRoom(event, data)   { this.io.to(this.room).emit(event, data); }
  _broadcastToScreen(event, data) { this.io.to(`screen:${this.machineId}`).emit(event, data); }

  _isAlreadyInSession(socketId) {
    if (this.selecting.has(socketId)) return true;
    if (this.currentPlayer?.id === socketId) return true;
    return Object.values(this.queues).some(q => q.some(p => p.id === socketId));
  }

  _getMachineSnapshot() {
    return {
      machineId:     this.machineId,
      status:        this.status,
      currentPlayer: this.currentPlayer,
      counts:        this._getQueueCounts(),
      queue:         Object.entries(this.queues).flatMap(([gt, q]) => q.map(p => ({ name: p.name, gameType: gt }))),
      leaderboard:   this.leaderboard,
      gameState:     this.currentGame
        ? { ...this.currentGame.getState(), playerName: this.currentPlayer?.name, timeLeft: this.timeLeft }
        : null
    };
  }

  _log(msg) {
    const t = new Date().toLocaleTimeString('en-IN', { hour12: false });
    console.log(`[${t}] [${this.machineId}] ${msg}`);
  }
}

module.exports = GameManager;
