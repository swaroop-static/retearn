// Zip puzzle game — player traces a Hamiltonian path through a 4×4 grid,
// connecting numbered recycling containers in order (1→2→3→4→5).
// All 16 cells must be visited. Score = speed bonus (faster = more points).

const CONTAINERS = ['🍾', '🧴', '🥫', '🥤', '🍶', '🫙'];
const GRID_SIZE  = 4;
const NUM_ANCHORS = 5;
const ZIP_TIME   = 60; // seconds per puzzle
const MAX_SCORE  = 200;
const MIN_SCORE  = 50;
const TOTAL_PUZZLES = 50;

// ── Puzzle generator ──────────────────────────────────────────────────────────

function rng(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generatePath(size) {
  const visited = Array.from({ length: size }, () => new Array(size).fill(false));
  const path = [];
  const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];

  function bt(r, c) {
    if (r < 0 || r >= size || c < 0 || c >= size || visited[r][c]) return false;
    visited[r][c] = true;
    path.push([r, c]);
    if (path.length === size * size) return true;
    for (const [dr, dc] of rng([...DIRS])) {
      if (bt(r + dr, c + dc)) return true;
    }
    visited[r][c] = false;
    path.pop();
    return false;
  }

  // Try all four corners as starting points (corners always have Hamiltonian paths on 4×4)
  const starts = rng([[0,0],[0,size-1],[size-1,0],[size-1,size-1]]);
  for (const [sr, sc] of starts) {
    if (bt(sr, sc)) return path;
    path.length = 0;
    for (let r = 0; r < size; r++) visited[r].fill(false);
  }
  return null;
}

function makePuzzle() {
  const path = generatePath(GRID_SIZE);
  if (!path || path.length < GRID_SIZE * GRID_SIZE) return null;

  // Distribute anchors evenly along the solution path
  const indices = [];
  const step = (path.length - 1) / (NUM_ANCHORS - 1);
  for (let i = 0; i < NUM_ANCHORS; i++) {
    indices.push(Math.round(i * step));
  }

  const grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
  const anchors = [];
  indices.forEach((idx, i) => {
    const [r, c] = path[idx];
    grid[r][c] = i + 1;
    anchors.push({ r, c, num: i + 1, emoji: CONTAINERS[i % CONTAINERS.length] });
  });

  return { size: GRID_SIZE, grid, path, anchors };
}

// Pre-generate 50 unique puzzles at module load
const PUZZLES = [];
let _attempts = 0;
while (PUZZLES.length < TOTAL_PUZZLES && _attempts < 1000) {
  _attempts++;
  const p = makePuzzle();
  if (p) PUZZLES.push(p);
}

// ── Game class ────────────────────────────────────────────────────────────────

class ZipGame {
  constructor() {
    this.puzzle    = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    this.startedAt = null;
    this.finished  = false;
    this.score     = 0;
  }

  getGameType() { return 'zip'; }
  isFinished()  { return this.finished; }
  getScore()    { return this.score; }
  start()       { return this.showNext(); }

  showNext() {
    this.startedAt = Date.now();
    return this.getState();
  }

  handleInput(value) {
    if (this.finished) return null;

    // Timer expired
    if (value === -1 || value === null) {
      this.finished = true;
      return {
        correct: false, correctValue: null, points: 0,
        fact:    'Time ran out! Trace faster next time ♻️',
        state:   this.getState()
      };
    }

    const { path } = value;
    if (!this._validatePath(path)) {
      this.finished = true;
      return {
        correct: false, correctValue: null, points: 0,
        fact:    'Path incomplete — all cells must be visited in order!',
        state:   this.getState()
      };
    }

    const elapsedSec   = (Date.now() - (this.startedAt || Date.now())) / 1000;
    const remainingSec = Math.max(0, ZIP_TIME - elapsedSec);
    this.score = Math.round(MIN_SCORE + (MAX_SCORE - MIN_SCORE) * (remainingSec / ZIP_TIME));
    this.finished = true;

    return {
      correct: true, correctValue: null, points: this.score,
      fact:    `✓ Zip complete in ${Math.round(elapsedSec)}s — brilliant recycling route!`,
      state:   this.getState()
    };
  }

  _validatePath(path) {
    if (!path || !Array.isArray(path)) return false;
    const { size, grid, anchors } = this.puzzle;
    if (path.length !== size * size) return false;

    const seen = new Set();
    let anchorIdx = 0;

    for (let step = 0; step < path.length; step++) {
      const [r, c] = path[step];
      if (r < 0 || r >= size || c < 0 || c >= size) return false;
      const key = r * size + c;
      if (seen.has(key)) return false;
      seen.add(key);

      if (step > 0) {
        const [pr, pc] = path[step - 1];
        if (Math.abs(r - pr) + Math.abs(c - pc) !== 1) return false;
      }

      if (grid[r][c] !== 0) {
        if (grid[r][c] !== anchorIdx + 1) return false;
        anchorIdx++;
      }
    }

    return anchorIdx === anchors.length;
  }

  getState() {
    return {
      score:    this.score,
      timeLeft: ZIP_TIME,
      progress: this.finished ? 1 : 0,
      total:    1,
      gameType: this.getGameType(),
      payload:  {
        size:    this.puzzle.size,
        grid:    this.puzzle.grid,
        anchors: this.puzzle.anchors,
      }
    };
  }

  finish() {
    this.finished = true;
    return { score: this.score, total: MAX_SCORE };
  }
}

module.exports = ZipGame;
