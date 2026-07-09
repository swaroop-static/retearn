# Retearn — Full Codebase Reference

Multiplayer recycling quiz kiosk. One laptop/TV acts as the **screen** (`screen.html`). Players scan a QR code on their phones and play at `player.html`. Only one player plays at a time; everyone else queues. Deployed on Railway with automatic deploys from GitHub.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express + Socket.IO 4 |
| Realtime | Socket.IO rooms (one room per machine) |
| Frontend | Vanilla HTML/CSS/JS — no build step, no framework |
| Hosting | Railway (auto-deploy from GitHub main branch) |
| QR codes | `qrcode` npm package |
| Tunneling (local) | ngrok or localtunnel |

---

## File Structure

```
ambraka/
├── server.js          # Express + Socket.IO entry point
├── config.js          # All tunable constants (reads from .env)
├── GameManager.js     # Per-machine state machine + queue + leaderboard
├── QuizGame.js        # 8-question recycling quiz
├── SortGame.js        # Slash! — Fruit Ninja falling-item slicer
├── ZipGame.js         # Hamiltonian path puzzle (4×4 grid)
├── MemoryGame.js      # 12-pair emoji memory match
├── questions.js       # Question bank for QuizGame
├── .env               # Local secrets (not committed)
├── .env.example       # Template
├── package.json       # Dependencies: express, socket.io, qrcode, dotenv
├── docs/
│   └── EVENTS.md      # Socket event reference (partially outdated — this file is authoritative)
└── public/
    ├── screen.html    # Laptop/TV display — served at /
    └── player.html    # Phone UI — served at /player
```

---

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `PUBLIC_URL` | auto-detected from `RAILWAY_PUBLIC_DOMAIN` | Base URL for QR links. Set to ngrok URL locally. |
| `MACHINE_ID` | `machine1` | Identifies which machine the screen/players connect to |
| `QUESTION_TIME` | `20` | Seconds per quiz question (also used for zip/memory timer) |
| `TOTAL_QUESTIONS` | `8` | How many quiz questions per game |
| `POINTS_PER_CORRECT` | `20` | Points per correct quiz answer |
| `ANSWER_DELAY` | `2000` | Milliseconds to show answer feedback before advancing |
| `NEXT_PLAYER_COUNTDOWN` | `3` | Countdown seconds between players |

Railway auto-detects `RAILWAY_PUBLIC_DOMAIN` and sets `PUBLIC_URL` accordingly — no manual config needed there.

---

## Running Locally

```bash
npm install
# Copy .env.example → .env and fill PUBLIC_URL (ngrok URL or localhost)
npm start
# Screen: http://localhost:3000
# Player: http://localhost:3000/player?machine=machine1
# QR API: http://localhost:3000/qr?machine=machine1
```

---

## HTTP Routes

| Route | Description |
|-------|-------------|
| `GET /` | Serves `public/screen.html` |
| `GET /player` | Serves `public/player.html` |
| `GET /qr?machine=X` | Returns `{ qr, url }` — QR code data URL + raw URL |
| `GET /stats?machine=X` | Returns `{ totalPlayed, currentPlayer, status, leaderboard }` |
| `GET /config` | Returns `{ QUESTION_TIME, TOTAL_QUESTIONS, MACHINE_ID, ANSWER_DELAY }` |

---

## Architecture

```
Phone (player.html) ──socket──► server.js ──► GameManager
                                    │
Screen (screen.html) ──socket──► socket joins two rooms:
                                  machine:{machineId}   ← player & screen both join
                                  screen:{machineId}    ← screen only
```

- **`machine:{machineId}`** room: receives all game events (timer ticks, questions, results)
- **`screen:{machineId}`** room: receives screen-only events (`screen_state`, `question_changed`, `answer_feedback`, `sort_item_feedback`, `zip_trace`)

`GameManager` holds all mutable state. There is one `GameManager` instance per machine ID, created at server startup.

---

## GameManager State Machine

```
WAITING
  │  player joins + selects game
  ▼
PLAYING
  │  answer submitted or timer expires → handleInput()
  ▼
SHOWING_RESULT (ANSWER_DELAY ms)
  │
  ├─► PLAYING (if more questions/waves remain)
  │
  └─► FINISHED
        │  countdown (NEXT_PLAYER_COUNTDOWN s)
        ▼
      WAITING (or next queued player starts immediately)
```

**Status values** (GameManager.status): `WAITING`, `PLAYING`, `SHOWING_RESULT`, `FINISHED`, `MAINTENANCE`

### Key GameManager properties

| Property | Type | Description |
|----------|------|-------------|
| `machineId` | string | e.g. `'machine1'` |
| `status` | string | Current state machine status |
| `currentPlayer` | `{ id, name, gameType, joinedAt }` | Active player or `null` |
| `currentGame` | Game instance | `null` when idle |
| `queues` | `{ quiz:[], slash:[], zip:[], memory:[] }` | Per-game queues |
| `selecting` | `Map<socketId, { id, name }>` | Players on the game-picker screen |
| `leaderboard` | array | Top 20 scores (all games combined), sorted desc |
| `gameBests` | `{ quiz, slash, zip, memory }` | Best score per game type |
| `playerScores` | `{ [name]: { quiz:N, slash:N, ... } }` | Best per game per player |
| `totalPlayed` | number | Total games completed this session |
| `timerHandle` | setInterval ref | Server-side countdown |
| `timeLeft` | number | Seconds remaining |
| `maintenance` | boolean | If true, blocks new players |

### Queue behaviour

- Players join a **specific game queue** (not a general queue)
- `_startNextPlayer()` picks the player with the **earliest `joinedAt`** across all four queues — not FIFO per-game
- When a player disconnects from the active game, next player starts after 2 seconds
- Disconnecting from queue removes them and notifies everyone of updated positions

---

## Game Engine Interface

Every game class must implement:

```js
getGameType()  // → string: 'quiz' | 'slash' | 'zip' | 'memory'
showNext()     // → state object (called to advance to next question/wave)
handleInput(value) // → result object or null
isFinished()   // → boolean
getScore()     // → number
getState()     // → state object (snapshot of current state)
finish()       // → { score } (called by GameManager on game end)
```

### State Object Shape (returned by `showNext()` and `getState()`)

```js
{
  score:    number,
  timeLeft: number,    // seconds for this question/wave
  progress: number,    // current question/wave index (1-based)
  total:    number,    // total questions/waves
  gameType: string,    // MUST match getGameType() — used by client to route rendering
  payload:  object     // game-specific data (see per-game sections below)
}
```

**Critical**: `gameType` in the state object is what the client uses to decide which rendering path to take. It must exactly match the registered key in `GAME_MAP`.

### Result Object Shape (returned by `handleInput()`)

```js
{
  correct:      boolean,
  correctValue: any,       // game-specific (quiz: correct option index)
  points:       number,
  fact:         string,    // shown in fact strip
  state:        object,    // full state snapshot (same shape as above)
  // Optional extras copied to extraResult in GameManager:
  lives:        number,    // slash only
  pos1:         number,    // memory only
  pos2:         number,    // memory only
  emoji1:       string,    // memory only
  emoji2:       string,    // memory only
  // Slash-specific:
  wavePartial:  boolean    // true = mid-wave event, false = wave complete
}
```

---

## GAME_MAP (server.js → GameManager.js)

```js
const GAME_MAP = { quiz: QuizGame, slash: SortGame, zip: ZipGame, memory: MemoryGame };
```

`SortGame.js` is the file that implements the `slash` game — the filename is historical, the class is `SortGame`, but `getGameType()` returns `'slash'` and all state objects use `gameType: 'slash'`.

---

## QuizGame

- 8 questions selected randomly from `questions.js`
- `handleInput(value)` — `value` is the option index (0–3)
- `timeLeft` from config: `QUESTION_TIME` (default 20s)
- Points: `POINTS_PER_CORRECT` per correct answer (default 20)
- `payload`: `{ question: string, options: string[] }`
- Timer: server-side `setInterval` sends `timer_tick` every second
- When timer hits 0: server calls `submitAnswer(socket, -1)` internally → treated as wrong answer

## SortGame (Slash!)

Fruit Ninja-style: emoji items fall from top, player swipes to cut items of the target category. Wrong cuts or missed target items cost lives.

### Rounds config (5 waves, increasing difficulty)

| Wave | Target | Correct items | Total items | Wave time | Base speed | Spawn delay | Pts each |
|------|--------|---------------|-------------|-----------|------------|-------------|----------|
| 1 | dry | 4 | 7 | 20s | 85 | 1800ms | 5 |
| 2 | wet | 4 | 8 | 18s | 105 | 1500ms | 6 |
| 3 | ewaste | 5 | 10 | 16s | 130 | 1200ms | 7 |
| 4 | dry | 6 | 11 | 14s | 155 | 1000ms | 8 |
| 5 | ewaste | 6 | 12 | 12s | 175 | 850ms | 10 |

### Categories

- **dry**: 📰 Newspaper, 📦 Cardboard Box, 🧴 Plastic Bottle, 🥫 Metal Tin, 🍾 Glass Bottle, 🥤 Plastic Cup, 🫙 Glass Jar, 🛍️ Paper Bag
- **wet**: 🍎 Apple, 🍌 Banana, 🥦 Broccoli, 🍞 Bread, 🥚 Egg, 🍊 Orange, 🍉 Watermelon, 🍄 Mushroom
- **ewaste**: 📱 Old Phone, 🔋 Battery, 🔌 Charger, 💡 Light Bulb, 🖥️ Old Monitor, ⌨️ Keyboard, 🎧 Headphones, 📷 Camera

### Lives: 3 (LIVES_START)

### handleInput value types

```js
{ type: 'cut',  itemId: number }   // player swiped and hit an item
{ type: 'miss', itemId: number }   // item fell off screen without being cut
-1                                 // wave timer expired
```

### Result types

- **`wavePartial: true`**: mid-wave event (item cut or missed) — GameManager keeps timer running, sends `sort_item_result` to player and `sort_item_feedback` to screen
- **`wavePartial: false`**: wave complete or game over — GameManager clears timer, transitions state

### Wave completion logic

- Wave ends when all items are `processed: true` (all cut or missed)
- If lives reach 0 at any point → `_deathResult()` → game over
- Wave advance: `_advanceWave()` → if more waves, build next wave and return wave info; if done, return final result

### payload shape

```js
{
  target:      'dry' | 'wet' | 'ewaste',
  targetLabel: 'DRY' | 'WET' | 'E-WASTE',
  targetColor: '#3b82f6' | '#22c55e' | '#f59e0b',
  items: [{ id, name, emoji, category }],  // all items in wave
  baseSpeed:  number,   // px/s base falling speed
  spawnDelay: number,   // ms between item spawns
  pts:        number,   // points per correct cut this wave
  lives:      number    // current lives remaining
}
```

## ZipGame

Hamiltonian path puzzle. Player traces a path through every cell of a 4×4 grid, visiting 5 numbered anchor cells in order.

- Pre-generates 50 random puzzles at module load
- One puzzle per game session (chosen randomly)
- `timeLeft`: 60 seconds
- Score: 50–200 points based on time remaining: `50 + 150 * (remaining / 60)`
- `handleInput(value)`: `value` is `{ path: [[r,c], ...] }` — the full completed path
- Also handles `value === -1` (timeout) and invalid paths
- Path validation: every cell visited exactly once, adjacent steps only, anchors visited in order 1→2→3→4→5
- `payload`: `{ size: 4, grid: number[][], anchors: [{ r, c, num, emoji }] }`
- Grid cells: `0` = empty, `1–5` = anchor number

## MemoryGame

12-pair emoji card matching game.

- 24 cards total (12 pairs), shuffled
- Max 26 attempts (`MAX_ATTEMPTS`)
- 15 points per matched pair (`POINTS_MATCH`)
- `timeLeft`: 12 seconds per attempt (`PAIR_TIME`)
- `handleInput(value)`: `value` is `{ pos1, pos2 }` — indices of two selected cards
- Returns `pos1, pos2, emoji1, emoji2` in result (used by both player and screen)
- Game ends when all 12 pairs matched OR 26 attempts reached
- `payload`: `{ cards: [{ pos, matched, emoji, name }], attempts, maxAttempts: 26, totalPairs: 12 }`
- Cards always have `matched: false` until correctly paired

### Pairs

🍾 Glass Bottle, 📰 Newspaper, 🥤 Aluminium Can, 🔋 Battery, 💻 Laptop, 🍌 Banana Peel, ♻️ Recycle Symbol, 🌿 Organic Waste, 📦 Cardboard Box, 🥫 Metal Tin, 🧴 PET Bottle, 🔌 Old Charger

---

## Socket.IO Events — Complete Reference

### Phone → Server

| Event | Payload | Notes |
|-------|---------|-------|
| `join_game` | `{ machineId, name }` | Triggers name validation, puts player in `selecting` map, emits `choose_game` back |
| `select_game` | `{ gameType }` | Player picks quiz/slash/zip/memory. If machine WAITING → starts immediately; else queues |
| `submit_answer` | `{ value }` | Routed to `currentGame.handleInput(value)`. For slash: `value = { type:'cut'|'miss', itemId }`. For zip: `value = { path:[[r,c],...] }`. For memory: `value = { pos1, pos2 }`. For quiz: `value = 0|1|2|3`. Timer timeout: `value = -1` |
| `reconnect_player` | `{ machineId, playerId }` | Tries to restore state if player is still active |
| `zip_trace` | `{ cells: [[r,c],...] }` | Sent on every new cell touched during zip drawing; server relays to screen room |

### Server → Phone

| Event | Payload | Notes |
|-------|---------|-------|
| `choose_game` | `{ playerName, gameInfo, counts }` | Shows game picker. `counts` = per-game queue lengths |
| `queue_counts` | `{ quiz:N, slash:N, zip:N, memory:N }` | Live queue count updates while on picker screen |
| `joined_queue` | `{ position, gameType, gameInfo }` | Confirmed in queue |
| `queue_updated` | `{ position }` | Player's queue position changed |
| `next_player_soon` | `{ countdown }` | It's this player's turn, countdown 3→0 |
| `game_started` | `{ gameType, gameInfo, playerName }` | Game begins for this player |
| `question` | `{ state }` | Full state snapshot including payload. Player checks `state.playerName === myName` before rendering |
| `sort_item_result` | `{ itemId, correct, points, lives, score, state }` | Slash mid-wave partial result (wavePartial:true). Updates score/lives without ending the wave |
| `answer_result` | `{ correct, correctValue, points, fact, state, [lives], [pos1], [pos2], [emoji1], [emoji2] }` | Final result for a question/wave |
| `timer_tick` | `{ timeLeft }` | Every second during active play |
| `timer_expired` | `{}` | Time ran out |
| `game_finished` | `{ score, leaderboard }` | Game over |
| `next_player_soon` | `{ countdown }` | Also sent to active player during end-of-game countdown |
| `reconnect_ok` | `{ state }` | Restored state |
| `error` | `{ message }` | Rejected join, invalid input, unknown machine |
| `maintenance` | `{ message }` | Machine in maintenance mode |

### Server → Screen

| Event | Payload | Notes |
|-------|---------|-------|
| `screen_state` | `{ machine }` | Full snapshot on screen connect. `machine` = `_getMachineSnapshot()` |
| `screen_waiting` | `{}` | All queues empty, show QR |
| `game_started` | `{ playerName, gameType, gameInfo }` | New game started |
| `question_changed` | `{ state }` | New question or wave. `state` includes `playerName` |
| `answer_feedback` | `{ correct, correctValue, playerName, score, fact, gameType, [lives], [pos1], [pos2], [emoji1], [emoji2] }` | Answer result for screen display. Memory includes pos1/pos2/emoji1/emoji2. Slash fact shown in fact strip |
| `sort_item_feedback` | `{ itemId, correct, lives, playerName, score }` | Slash mid-wave cut event → screen animates the cut |
| `zip_trace` | `{ cells }` | Relayed from player; screen highlights traced cells |
| `queue_updated` | `{ queue, counts }` | `queue` = `[{ name, gameType }]` for all queued players |
| `timer_tick` | `{ timeLeft }` | Screen timer display |
| `game_finished` | `{ playerName, score, gameType, leaderboard }` | Game over panel |
| `next_player_soon` | `{ countdown }` | Countdown on game over panel |
| `player_choosing` | `{ playerName }` | Someone is on the game picker screen (screen can show "Player is choosing...") |
| `maintenance` | `{ message }` | Show maintenance screen |

---

## player.html — Views & Flow

Single-page app. Only one `<div class="view">` has `display:flex` at a time (class `active`). `showView(id)` switches between them.

### Views

| ID | Shown when |
|----|-----------|
| `view-join` | Initial load |
| `view-pick` | After `choose_game` event — game selection |
| `view-queue` | After `joined_queue` — waiting in queue |
| `view-yourturn` | After `next_player_soon` while in queue |
| `view-game` | After first `question` event |
| `view-final` | After `game_finished` |

### Global JS state

```js
let myName     = '';       // player's name
let myGameType = '';       // 'quiz' | 'slash' | 'zip' | 'memory'
let maxTime    = 20;       // from /config
let answered   = false;    // prevents double-submit
let memWaiting = false;    // memory: waiting for answer_result before allowing next flip
```

### view-game layout

```
.game-header            → g-type-badge, g-round-label, g-prog/g-total, g-score
.timer-bar-wrap         → timer-fill (width%), timer-sec (text)
.game-content-area
  #gc-quiz              → question + answer buttons (display:none when not active)
  #gc-zip               → grid (display:none when not active)
  #gc-memory            → card grid (display:none when not active)
  #fact-box             → feedback text (shown after answer)
#slash-overlay          → FIXED position, z-index:100, outside .view-game entirely
```

### Slash overlay structure (position:fixed, fullscreen)

```
#slash-overlay (display:none → display:flex when .active)
  #slash-hud             → lives ❤️, score, timer
  #slash-banner          → "✂️ CUT DRY" target text + sub text
  #slash-arena           → items fall here, canvas overlay for trail
    #slash-canvas        → 2D canvas for slash trail drawing
  #slash-wave-bar        → "WAVE 1 / 5"
```

The overlay is a direct child of `<body>`, NOT inside `#view-game`. This ensures it always has real viewport dimensions regardless of flex layout chain.

### SL object (Slash state)

```js
let SL = {
  active: false,      // whether slash game is running
  items: [],          // active falling items
  target: null,       // current target category string
  arenaEl: null,      // #slash-arena DOM element
  canvasEl: null,     // #slash-canvas
  ctx: null,          // canvas 2D context
  arenaW: 0,          // arena width (from getBoundingClientRect or window fallback)
  arenaH: 0,          // arena height
  rafId: null,        // requestAnimationFrame handle
  lastTime: 0,        // performance.now() of last frame
  drawing: false,     // whether user is currently swiping
  trail: [],          // recent touch/mouse points [{x,y}] — max 20 points
  spawnTimers: [],    // setTimeout handles for item spawning
  resizeObs: null     // ResizeObserver handle
};
```

### Slash item object

```js
{
  id: number,        // from server payload
  emoji: string,
  category: string,  // 'dry' | 'wet' | 'ewaste'
  x: number,         // current x position (center)
  y: number,         // current y position (center)
  vx: number,        // horizontal velocity (px/s, can be negative, bounces off walls)
  vy: number,        // vertical velocity (px/s, always positive = falling)
  rot: number,       // current rotation (degrees)
  rs: number,        // rotation speed (deg/s)
  el: HTMLElement,   // DOM element (null after removal)
  active: boolean,   // false when cut or fell off screen
  hit: boolean       // prevents double-cut
}
```

### Slash animation constants

- `SL_SIZE = 56` — item hitbox size (px)
- `SL_HIT = 48` — cut detection radius (px from center)
- Items bounce off left/right walls (vx reverses sign)
- Items despawn when `y > arenaH + 80`
- Canvas trail: max 20 points, gradient white→purple glow, lineWidth 7, shadowBlur 28

### Slash cut detection

In `slashCheck(px, py)`: for each active unhit item, if `dx²+dy² < SL_HIT²` → `slashCut(item, px, py)`.

On cut:
1. Sets `item.hit = true`, `item.active = false`, removes DOM element
2. Creates two `.slash-half-l` and `.slash-half-r` divs at cut position (CSS animated, auto-removed after 420ms)
3. Calls `slashParticles(x, y, correct)` — 18 particles, multi-color, variable size, CSS animated
4. Calls `slashFlash(x, y, text, color)` — floating text animation
5. If wrong cut: `slashRedFlash()` — full-arena red overlay
6. Emits `submit_answer` with `{ value: { type: 'cut', itemId } }`

On fell (item hits bottom):
- Emits `submit_answer` with `{ value: { type: 'miss', itemId } }`
- If it was the target category: `slashFlash()` + `slashRedFlash()`

### showGameContent(type)

Handles the `'sort'` → `'slash'` fallback: both `'sort'` and `'slash'` are treated as slash. This prevents breakage if old server code sends `gameType: 'sort'`.

```js
const isSlash = (type === 'slash' || type === 'sort');
```

Same fallback pattern exists in `applyState`, `answer_result` handler, and `timer_expired` handler.

### Memory game on player

Cards rendered in a 4×4 grid. Each card has id `mc-{pos}`. States: default (face down), `flipped` (selected, waiting), `matched` (green), `wrong-flash` (red, briefly). `memWaiting = true` while waiting for server to confirm a flip — prevents a third card being selected.

### Zip game on player

Grid rendered as `zc-{r}-{c}` cells. Touch/mouse drag traces path. `startZipDraw` requires starting on anchor #1. `continueZipDraw` validates adjacency and anchor order. Emits `zip_trace` on every new cell. `submitZipPath` emits complete path. `resetZipPath` clears and emits empty trace.

---

## screen.html — Sections & Logic

### Layout structure

```
#waiting (position:fixed, z-index:10)
  .waiting-left    → logo, QR code, scan label
  .waiting-right   → leaderboard (game bests + all-king)

#playing (opacity transition)
  .top-bar (72px)  → player avatar/name/score, round progress, timer circle
  .body-row
    .main-area      → game content (quiz/zip/memory)
    .qr-sidebar (200px) → small QR + queue list

#gameover-panel (position:fixed, z-index:5)
  .go-card         → name reveal animation, score, per-game leaderboard
  .go-qr-corner    → scan-to-play QR in corner

#sc-slash (position:fixed, top:72px, left:0, right:200px, bottom:0, z-index:5)
  .scsl-hud        → lives, "✂️ CUT DRY" target, score, wave
  #scsl-arena      → falling items + starfield ::before
    #scsl-canvas   → particle/flash effects canvas (unused currently — effects use DOM elements)
```

`#sc-slash` is a fixed overlay covering the game area (below top bar, left of QR sidebar). Shown by adding class `show`. Hidden by removing class `show` + calling `scslStop()`.

### SCSL object (screen slash animation state)

```js
let SCSL = {
  active: false,
  items: [],          // same structure as player SL items
  spawnTimers: [],
  rafId: null,
  lastTime: 0,
  arenaEl: null,      // #scsl-arena
  canvasEl: null,     // #scsl-canvas
  ctx: null,
  arenaW: 0,
  arenaH: 0,
  target: null
};
```

Screen runs its own independent animation loop with the same items, baseSpeed, and spawnDelay from the wave payload. Item positions differ from the player's phone (different screen size, independent randomization) — but the same emoji set falls with the same timing.

### Screen slash sync mechanism

When `sort_item_feedback` fires (player cut something):
1. `scslCutEffect(itemId, correct, lives, score)` is called
2. Finds the item in `SCSL.items` by `itemId`
3. Removes it, animates two halves (`.scsl-half-l`, `.scsl-half-r`)
4. Spawns 16 particles
5. Shows score flash text
6. Red screen flash if wrong cut
7. Updates lives hearts and score display

### `showScreenContent(gt)`

```js
// Manages which content section is visible
// For slash: adds 'show' class to #sc-slash, calls scslStop() for all other games
// For quiz/zip/memory: sets style.display on the relevant section
```

### `applyState(playerName, state)`

Called from `question_changed` and `screen_state` events. Updates top bar (name, avatar, score, progress), routes to game-specific rendering:
- `quiz` → renders question text + 4 option divs
- `slash` → calls `scslStart(state.payload, state.progress, state.total)` which stops previous wave first
- `zip` → calls `renderZipGrid(payload)` — draws the 4×4 grid with anchor cells
- `memory` → calls `renderMemGrid(cards)` — renders 24 face-down/matched cards

### Memory card flip on screen

`answer_feedback` handler: when `gameType === 'memory'` and `pos1/pos2/emoji1/emoji2` are present:
- Flips cards at `pos1` and `pos2` to show emoji
- If correct: adds `matched` class (green), permanent
- If wrong: adds `flipped` class (purple), reverts after 1200ms
- After 2000ms (ANSWER_DELAY) the full grid is re-rendered via `question_changed` → `applyState`

### Zip path trace on screen

`zip_trace` event handler:
- Clears all `.traced` class from cells
- Adds `.traced` to each `[r,c]` in `cells` array
- Updates status text: "Tracing path... N cells covered"
- Empty `cells: []` → "Waiting for player to start tracing..."

### Leaderboard payload shape

```js
{
  gameBests: { quiz: {name, score}|null, slash: ..., zip: ..., memory: ... },
  allKing:   { name, total, games }|null,   // player with highest sum across all games
  recent:    [{ name, score, gameType }]    // top 10 recent scores
}
```

`allKing` is recalculated every time a game finishes: sums each player's best score per game type.

---

## Leaderboard Logic

Three independent structures in GameManager:

1. **`leaderboard`**: simple sorted array of `{ name, score, gameType }` — top 20 across all games combined
2. **`gameBests`**: per-game best: `{ quiz: {name,score}, slash: ..., zip: ..., memory: ... }`
3. **`playerScores`**: `{ [playerName]: { quiz: N, slash: N, ... } }` — best score per player per game, used for `allKing` calculation

All three are in-memory only — reset when server restarts.

---

## Timer Architecture

Server-authoritative timer:
1. `_startTimer(duration)` — starts `setInterval` every 1 second
2. Each tick: decrements `timeLeft`, broadcasts `timer_tick` to room
3. At 0: clears interval, broadcasts `timer_expired`, calls `submitAnswer(socket, -1)` to fake a timeout submission
4. Both player and screen display the timer (player: horizontal bar; screen: SVG circle)
5. `_clearTimer()` called before every state transition to prevent double-firing

Slash waves use their own `waveTime` from the round config instead of `QUESTION_TIME`.

---

## Deployment (Railway)

- Auto-deploys from `main` branch on push
- `npm start` → `node server.js`
- `RAILWAY_PUBLIC_DOMAIN` env var set automatically by Railway → `config.js` builds `PUBLIC_URL` from it
- No build step — static files served directly from `public/`
- Screen URL: `https://{railway-domain}/`
- Player URL: `https://{railway-domain}/player?machine=machine1`

---

## Known Quirks & Gotchas

1. **`SortGame.js` vs `'slash'` game type**: The file is named `SortGame.js`, the class is `SortGame`, but `getGameType()` returns `'slash'` and all state objects emit `gameType: 'slash'`. Both `showNext()` and `getState()` must return `gameType: 'slash'` — if either reverts to `'sort'`, the client won't show the slash overlay.

2. **`'sort'` fallback in client**: `applyState`, `showGameContent`, `answer_result` handler, and `timer_expired` handler all check `gt === 'slash' || gt === 'sort'` as backward-compat insurance.

3. **`#slash-overlay` is outside `#view-game`**: It's a direct child of `<body>` with `position:fixed`. This is intentional — when it was inside the flex chain, it had 0 height on mobile. Never move it back inside a flex container.

4. **Screen slash overlay dimensions**: `position:fixed; top:72px; left:0; right:200px; bottom:0` — these numbers must match the actual `.top-bar` height (72px) and `.qr-sidebar` width (200px). If those change, update the slash overlay dimensions.

5. **`slashShow` / `scslStart` 80ms delay**: Both wait 80ms after being called before sizing the canvas and spawning items. This ensures the DOM has laid out and `getBoundingClientRect()` returns real values.

6. **Memory `memWaiting` flag**: Prevents the player from selecting a third card before the server responds to the first pair. Must be reset to `false` on wrong match timeout (900ms) and on correct match.

7. **Queue position is 1-indexed**: `_getPlayerQueuePosition` returns `idx + 1`.

8. **`GAME_MAP` key must match `getGameType()`**: The key used in `GAME_MAP` and `queues`/`gameBests` is the game's canonical type string. Adding a new game requires updating both `GAME_MAP`, `queues`, `gameBests` in GameManager, `GAME_INFO`, and `GAME_LABELS`/`ROUND_LABELS`/`ICONS` in both HTML files.

9. **Zip puzzle pre-generation**: 50 puzzles are generated at module load via recursive backtracking. If backtracking fails (rare), `PUZZLES` may have fewer than 50. The game picks randomly from whatever is in the array.

10. **Slash screen items are independent**: The screen's `SCSL` items are spawned with independent random positions — they won't match the player's phone positions. Only the item set, baseSpeed, and spawnDelay are synchronized. When the player cuts item `#7`, the screen finds `#7` in SCSL.items by id and animates it there.

11. **`answer_feedback` vs `answer_result`**: The screen receives `answer_feedback`; the player receives `answer_result`. They carry the same base data but are separate events — don't confuse them.

12. **`sort_item_result` vs `sort_item_feedback`**: Player receives `sort_item_result` for mid-wave slash updates; screen receives `sort_item_feedback`. Both are emitted in `GameManager.submitAnswer` when `result.wavePartial === true`.

---

## Adding a New Game

1. Create `NewGame.js` implementing the game engine interface
2. Add to `GAME_MAP` and `GAME_INFO` in `GameManager.js`
3. Add to `queues` and `gameBests` initial values in `GameManager` constructor
4. Add game content section in `player.html` (`#gc-newgame`) and handle in `applyState`, `showGameContent`, `answer_result`
5. Add section in `screen.html` (`#sc-newgame`) and handle in `applyState`, `showScreenContent`, `answer_feedback`
6. Add to `GAME_LABELS`, `ROUND_LABELS`, `ICONS` in both HTML files
7. Add card to game picker in `player.html`
