const config = require('./config');
const QuizGame = require('./QuizGame');

const STATUS = {
  WAITING:        'WAITING',
  PLAYING:        'PLAYING',
  SHOWING_RESULT: 'SHOWING_RESULT',
  FINISHED:       'FINISHED',
  MAINTENANCE:    'MAINTENANCE'
};

class GameManager {
  constructor(machineId, io) {
    this.machineId    = machineId;
    this.io           = io;
    this.room         = `machine:${machineId}`;
    this.status       = STATUS.WAITING;
    this.currentPlayer = null;
    this.currentGame  = null;
    this.queue        = [];
    this.leaderboard  = [];
    this.timerHandle  = null;
    this.timeLeft     = 0;
    this.maintenance  = false;
  }

  // ── Public API ──────────────────────────────────────────────

  joinPlayer(socket, name) {
    if (this.maintenance) {
      socket.emit('maintenance', { message: 'Game is temporarily unavailable. Please try again soon.' });
      return;
    }

    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) { socket.emit('error', { message: 'Please enter a valid name.' }); return; }

    // Prevent duplicate socket in queue/game
    if (this._isAlreadyInSession(socket.id)) {
      socket.emit('error', { message: 'You are already in the game or queue.' });
      return;
    }

    const player = { id: socket.id, name: trimmed };

    if (this.status === STATUS.WAITING) {
      this._startGame(player);
    } else {
      this.queue.push(player);
      const position = this.queue.length;
      socket.emit('joined_queue', { position, playerId: socket.id });
      this._broadcastQueueToScreen();
      this._log(`${trimmed} joined queue at position ${position}`);
    }
  }

  submitAnswer(socket, value) {
    if (!this.currentPlayer || this.currentPlayer.id !== socket.id) return;
    if (this.status !== STATUS.PLAYING) return;

    this._clearTimer();
    this.status = STATUS.SHOWING_RESULT;

    const result = this.currentGame.handleInput(value);

    this._broadcastToRoom('answer_result', {
      correct:      result.correct,
      correctValue: result.correctValue,
      points:       result.points,
      state:        { ...result.state, playerName: this.currentPlayer.name }
    });

    this._broadcastToScreen('answer_feedback', {
      correct:      result.correct,
      correctValue: result.correctValue,
      playerName:   this.currentPlayer.name,
      score:        this.currentGame.getScore(),
      fact:         result.fact
    });

    this._log(`${this.currentPlayer.name} answered — ${result.correct ? 'CORRECT' : 'WRONG'} | Score: ${this.currentGame.getScore()}`);

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
    // Remove from queue
    const wasInQueue = this.queue.some(p => p.id === socketId);
    this.queue = this.queue.filter(p => p.id !== socketId);

    if (wasInQueue) {
      this._notifyQueuePositions();
      this._broadcastQueueToScreen();
    }

    // If active player left
    if (this.currentPlayer && this.currentPlayer.id === socketId) {
      this._log(`Active player ${this.currentPlayer.name} disconnected`);
      this._clearTimer();
      this.io.to(this.room).emit('screen_waiting', {});
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
    this.currentGame   = new QuizGame();
    this.status        = STATUS.PLAYING;

    this._log(`Game started for ${player.name}`);

    this._broadcastToRoom('game_started', { gameType: this.currentGame.getGameType(), playerName: player.name });
    this._broadcastQueueToScreen();

    setTimeout(() => this._nextQuestion(), 500);
  }

  _nextQuestion() {
    this.status = STATUS.PLAYING;
    const state = { ...this.currentGame.showNext(), playerName: this.currentPlayer.name };

    this._broadcastToRoom('question', { state });
    this._broadcastToScreen('question_changed', { state });

    this._log(`Question ${state.progress}/${state.total}`);
    this._startTimer();
  }

  _startTimer() {
    this._clearTimer();
    this.timeLeft = config.QUESTION_TIME;

    this.timerHandle = setInterval(() => {
      this.timeLeft--;
      this._broadcastToRoom('timer_tick', { timeLeft: this.timeLeft });

      if (this.timeLeft <= 0) {
        this._clearTimer();
        this._log(`Timer expired for ${this.currentPlayer.name}`);
        this._broadcastToRoom('timer_expired', {});

        // Auto-submit wrong
        this.submitAnswer({ id: this.currentPlayer.id }, -1);
      }
    }, 1000);
  }

  _clearTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  _finishGame() {
    this.status = STATUS.FINISHED;
    this._clearTimer();

    const { score } = this.currentGame.finish();
    const playerName = this.currentPlayer.name;

    this.leaderboard.push({ name: playerName, score });
    this.leaderboard.sort((a, b) => b.score - a.score);
    if (this.leaderboard.length > 10) this.leaderboard.pop();

    this._log(`Game finished — ${playerName} scored ${score}`);

    this._broadcastToRoom('game_finished', { score, leaderboard: this.leaderboard });
    this._broadcastToScreen('game_finished', { playerName, score, leaderboard: this.leaderboard });

    setTimeout(() => this._countdownNextPlayer(), 3000);
  }

  _countdownNextPlayer() {
    let count = config.NEXT_PLAYER_COUNTDOWN;
    this._broadcastToRoom('next_player_soon', { countdown: count });

    const tick = setInterval(() => {
      count--;
      this._broadcastToRoom('next_player_soon', { countdown: count });
      if (count <= 0) {
        clearInterval(tick);
        this._startNextPlayer();
      }
    }, 1000);
  }

  _startNextPlayer() {
    this.currentPlayer = null;
    this.currentGame   = null;

    if (this.queue.length === 0) {
      this.status = STATUS.WAITING;
      this._broadcastToScreen('screen_waiting', {});
      this._log('Queue empty — waiting for players');
      return;
    }

    const next = this.queue.shift();
    this._notifyQueuePositions();
    this._startGame(next);
  }

  _notifyQueuePositions() {
    this.queue.forEach((p, i) => {
      this.io.to(p.id).emit('queue_updated', { position: i + 1 });
    });
  }

  _broadcastQueueToScreen() {
    this._broadcastToScreen('queue_updated', {
      queue: this.queue.map(p => ({ name: p.name }))
    });
  }

  _broadcastToRoom(event, data) {
    this.io.to(this.room).emit(event, data);
  }

  _broadcastToScreen(event, data) {
    this.io.to(`screen:${this.machineId}`).emit(event, data);
  }

  _isAlreadyInSession(socketId) {
    if (this.currentPlayer && this.currentPlayer.id === socketId) return true;
    return this.queue.some(p => p.id === socketId);
  }

  _getMachineSnapshot() {
    return {
      machineId:     this.machineId,
      status:        this.status,
      currentPlayer: this.currentPlayer,
      queue:         this.queue.map(p => ({ name: p.name })),
      leaderboard:   this.leaderboard,
      gameState:     this.currentGame ? { ...this.currentGame.getState(), playerName: this.currentPlayer?.name, timeLeft: this.timeLeft } : null
    };
  }

  _log(msg) {
    const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
    console.log(`[${time}] [${this.machineId}] ${msg}`);
  }
}

module.exports = GameManager;
