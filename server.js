const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const QRCode     = require('qrcode');
const config     = require('./config');
const GameManager = require('./GameManager');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// One GameManager per machine
const managers = {
  [config.MACHINE_ID]: new GameManager(config.MACHINE_ID, io)
};

function getManager(machineId) {
  return managers[machineId] || null;
}

// ── Static + Routes ──────────────────────────────────────────

app.use(express.static('public'));

app.get('/', (req, res) => res.sendFile(__dirname + '/public/screen.html'));
app.get('/player', (req, res) => res.sendFile(__dirname + '/public/player.html'));

app.get('/qr', async (req, res) => {
  const machineId = req.query.machine || config.MACHINE_ID;
  const base = config.PUBLIC_URL || `http://localhost:${config.PORT}`;
  const url  = `${base}/player?machine=${machineId}`;
  try {
    const qr = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#ffffff', light: '#0d0d0d' } });
    res.json({ qr, url });
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.get('/stats', (req, res) => {
  const machineId = req.query.machine || config.MACHINE_ID;
  const mgr = getManager(machineId);
  if (!mgr) return res.status(404).json({ error: 'Unknown machine' });
  res.json({
    totalPlayed:   mgr.totalPlayed,
    currentPlayer: mgr.currentPlayer?.name || null,
    status:        mgr.status,
    leaderboard:   mgr._getLeaderboardPayload()
  });
});

app.get('/config', (req, res) => {
  res.json({
    QUESTION_TIME:   config.QUESTION_TIME,
    TOTAL_QUESTIONS: config.TOTAL_QUESTIONS,
    MACHINE_ID:      config.MACHINE_ID,
    ANSWER_DELAY:    config.ANSWER_DELAY
  });
});

// ── Socket.IO ────────────────────────────────────────────────

io.on('connection', (socket) => {

  socket.on('screen_connect', ({ machineId }) => {
    const mgr = getManager(machineId);
    if (!mgr) { socket.emit('error', { message: 'Unknown machine' }); return; }

    socket.join(`machine:${machineId}`);
    socket.join(`screen:${machineId}`);
    mgr.screenConnected(socket);
    console.log(`[screen] connected to ${machineId}`);
  });

  socket.on('join_game', ({ machineId, name }) => {
    const mgr = getManager(machineId);
    if (!mgr) { socket.emit('error', { message: 'Unknown machine' }); return; }
    socket.join(`machine:${machineId}`);
    socket.data.machineId = machineId;
    mgr.joinPlayer(socket, name);
  });

  socket.on('select_game', ({ gameType }) => {
    const machineId = socket.data.machineId;
    if (!machineId) return;
    const mgr = getManager(machineId);
    if (mgr) mgr.selectGame(socket, gameType);
  });

  socket.on('submit_answer', ({ value }) => {
    const machineId = socket.data.machineId;
    if (!machineId) return;
    const mgr = getManager(machineId);
    if (mgr) mgr.submitAnswer(socket, value);
  });

  socket.on('reconnect_player', ({ machineId, playerId }) => {
    const mgr = getManager(machineId);
    if (!mgr) return;
    socket.join(`machine:${machineId}`);
    socket.data.machineId = machineId;
    mgr.reconnectPlayer(socket, playerId);
  });

  socket.on('disconnect', () => {
    const machineId = socket.data.machineId;
    if (!machineId) return;
    const mgr = getManager(machineId);
    if (mgr) mgr.playerDisconnected(socket.id);
  });
});

// ── Start ────────────────────────────────────────────────────

server.listen(config.PORT, '0.0.0.0', () => {
  const base = config.PUBLIC_URL || `http://localhost:${config.PORT}`;
  console.log('\n🌱 Retearn Quiz Server');
  console.log(`📺 Screen  : http://localhost:${config.PORT}`);
  console.log(`📱 Player  : ${base}/player?machine=${config.MACHINE_ID}`);
  console.log(`🔗 QR API  : http://localhost:${config.PORT}/qr`);
  if (!config.PUBLIC_URL) {
    console.log('\n⚠️  PUBLIC_URL not set in .env');
    console.log('   Run: ngrok http 3000');
    console.log('   Then set PUBLIC_URL=https://xxxx.ngrok.io in .env\n');
  }
});
