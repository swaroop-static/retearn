// Fruit-Ninja style: items fall from top, player slices the target category.
// Banner shows "CUT DRY / WET / E-WASTE". Wrong cuts or missed targets cost lives.

const ITEMS = {
  dry: [
    { name: 'Newspaper',      emoji: '📰' },
    { name: 'Cardboard Box',  emoji: '📦' },
    { name: 'Plastic Bottle', emoji: '🧴' },
    { name: 'Metal Tin',      emoji: '🥫' },
    { name: 'Glass Bottle',   emoji: '🍾' },
    { name: 'Plastic Cup',    emoji: '🥤' },
    { name: 'Glass Jar',      emoji: '🫙' },
    { name: 'Paper Bag',      emoji: '🛍️' },
  ],
  wet: [
    { name: 'Apple',          emoji: '🍎' },
    { name: 'Banana',         emoji: '🍌' },
    { name: 'Broccoli',       emoji: '🥦' },
    { name: 'Bread',          emoji: '🍞' },
    { name: 'Egg',            emoji: '🥚' },
    { name: 'Orange',         emoji: '🍊' },
    { name: 'Watermelon',     emoji: '🍉' },
    { name: 'Mushroom',       emoji: '🍄' },
  ],
  ewaste: [
    { name: 'Old Phone',      emoji: '📱' },
    { name: 'Battery',        emoji: '🔋' },
    { name: 'Charger',        emoji: '🔌' },
    { name: 'Light Bulb',     emoji: '💡' },
    { name: 'Old Monitor',    emoji: '🖥️' },
    { name: 'Keyboard',       emoji: '⌨️' },
    { name: 'Headphones',     emoji: '🎧' },
    { name: 'Camera',         emoji: '📷' },
  ]
};

// Each round: correct = target items to slice, total = all items (target + decoys)
// Target is assigned randomly each game (no hardcoded order).
// baseSpeed = initial upward throw speed (px/s); spawnDelay = ms between throws.
// Items arc upward then fall back — gravity applied client-side.
const ROUND_CONFIGS = [
  { correct: 3,  total: 3,  waveTime: 14, baseSpeed: 440, spawnDelay: 1100, pts: 5  },
  { correct: 4,  total: 5,  waveTime: 16, baseSpeed: 460, spawnDelay: 1000, pts: 6  },
  { correct: 5,  total: 7,  waveTime: 18, baseSpeed: 480, spawnDelay: 900,  pts: 7  },
  { correct: 5,  total: 8,  waveTime: 18, baseSpeed: 500, spawnDelay: 820,  pts: 7  },
  { correct: 6,  total: 9,  waveTime: 19, baseSpeed: 520, spawnDelay: 750,  pts: 8  },
  { correct: 6,  total: 9,  waveTime: 19, baseSpeed: 545, spawnDelay: 680,  pts: 8  },
  { correct: 7,  total: 10, waveTime: 20, baseSpeed: 570, spawnDelay: 610,  pts: 9  },
  { correct: 7,  total: 11, waveTime: 20, baseSpeed: 595, spawnDelay: 550,  pts: 10 },
  { correct: 8,  total: 11, waveTime: 21, baseSpeed: 620, spawnDelay: 490,  pts: 10 },
  { correct: 9,  total: 12, waveTime: 22, baseSpeed: 650, spawnDelay: 440,  pts: 12 },
];

const LIVES_START = 3;
const CAT_LABELS  = { dry: 'DRY', wet: 'WET', ewaste: 'E-WASTE' };
const CAT_COLORS  = { dry: '#3b82f6', wet: '#22c55e', ewaste: '#f59e0b' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class SortGame {
  constructor() {
    // Assign a random target to each round — never the same category twice in a row
    const cats = ['dry', 'wet', 'ewaste'];
    let last   = null;
    const targets = ROUND_CONFIGS.map(() => {
      const pool = cats.filter(c => c !== last);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      last = pick;
      return pick;
    });
    this.rounds     = ROUND_CONFIGS.map((cfg, i) => ({ ...cfg, target: targets[i] }));
    this.roundIndex = 0;
    this.score      = 0;
    this.lives      = LIVES_START;
    this.idCounter  = 1;
    this.waveItems  = [];
    this.finished   = false;
    this._buildWave();
  }

  _buildWave() {
    const { target, correct, total } = this.rounds[this.roundIndex];
    const decoyCats = Object.keys(ITEMS).filter(c => c !== target);
    const items     = [];

    const correctPool = shuffle([...ITEMS[target]]);
    for (let i = 0; i < correct; i++) {
      items.push({ id: this.idCounter++, ...correctPool[i % correctPool.length], category: target, processed: false });
    }

    const decoyCount = total - correct;
    for (let i = 0; i < decoyCount; i++) {
      const cat  = decoyCats[i % decoyCats.length];
      const pool = shuffle([...ITEMS[cat]]);
      items.push({ id: this.idCounter++, ...pool[i % pool.length], category: cat, processed: false });
    }

    this.waveItems = shuffle(items);
  }

  showNext() {
    const round = this.rounds[this.roundIndex];
    return {
      score:    this.score,
      lives:    this.lives,
      timeLeft: round.waveTime,
      progress: this.roundIndex + 1,
      total:    this.rounds.length,
      gameType: 'slash',
      payload: {
        target:      round.target,
        targetLabel: CAT_LABELS[round.target],
        targetColor: CAT_COLORS[round.target],
        items:       this.waveItems.map(({ id, name, emoji, category }) => ({ id, name, emoji, category })),
        baseSpeed:   round.baseSpeed,
        spawnDelay:  round.spawnDelay,
        pts:         round.pts,
        lives:       this.lives,
      }
    };
  }

  handleInput(value) {
    if (value === -1)                        return this._waveTimeout();
    if (!value || typeof value !== 'object') return null;
    if (value.type === 'cut')                return this._handleCut(value.itemId);
    if (value.type === 'miss')               return this._handleMiss(value.itemId);
    return null;
  }

  _handleCut(itemId) {
    const item = this.waveItems.find(i => i.id === itemId);
    if (!item || item.processed) return null;
    item.processed = true;

    const round   = this.rounds[this.roundIndex];
    const correct = item.category === round.target;
    let   points  = 0;

    if (correct) {
      points = round.pts;
      this.score += points;
    } else {
      this.lives = Math.max(0, this.lives - 1);
    }

    if (this.lives <= 0) {
      this.finished = true;
      return this._deathResult(round.target);
    }

    if (this.waveItems.every(i => i.processed)) return this._advanceWave();
    return { wavePartial: true, itemId, correct, points, lives: this.lives, state: this.getState() };
  }

  _handleMiss(itemId) {
    const item = this.waveItems.find(i => i.id === itemId);
    if (!item || item.processed) return null;
    item.processed = true;

    const round     = this.rounds[this.roundIndex];
    const wasTarget = item.category === round.target;
    if (wasTarget) this.lives = Math.max(0, this.lives - 1);

    if (this.lives <= 0) {
      this.finished = true;
      return this._deathResult(round.target);
    }

    if (this.waveItems.every(i => i.processed)) return this._advanceWave();
    return { wavePartial: true, itemId, correct: false, points: 0, lives: this.lives, state: this.getState() };
  }

  _waveTimeout() {
    // Timer expired — just advance. Lives are already deducted when items fall
    // off screen via _handleMiss(), so we don't double-penalise here.
    this.waveItems.forEach(item => { item.processed = true; });
    if (this.lives <= 0) this.finished = true;
    return this._advanceWave();
  }

  _advanceWave() {
    const prevRound = this.rounds[this.roundIndex];
    this.roundIndex++;

    if (this.finished || this.roundIndex >= this.rounds.length) {
      this.finished = true;
      return {
        wavePartial:  false,
        correct:      this.lives > 0,
        correctValue: 'done',
        points:       0,
        fact: this.lives <= 0
          ? '💡 Dry = paper/glass/plastic · Wet = food/organic · E-waste = electronics'
          : '🎉 All waves complete! Amazing recycling skills!',
        state: this.getState()
      };
    }

    this._buildWave();
    const next = this.rounds[this.roundIndex];
    return {
      wavePartial:  false,
      correct:      true,
      correctValue: prevRound.target,
      points:       0,
      fact:         `Wave ${this.roundIndex + 1}: Now slice ${CAT_LABELS[next.target]} waste! ✂️`,
      state:        this.getState()
    };
  }

  _deathResult(target) {
    return {
      wavePartial:  false,
      correct:      false,
      correctValue: target,
      points:       0,
      fact:         '💡 Dry = paper/glass/plastic · Wet = food/organic · E-waste = electronics',
      state:        this.getState()
    };
  }

  getState() {
    const ri    = Math.min(this.roundIndex, this.rounds.length - 1);
    const round = this.rounds[ri];
    return {
      score:    this.score,
      lives:    this.lives,
      progress: Math.min(this.roundIndex + 1, this.rounds.length),
      total:    this.rounds.length,
      gameType: 'slash',
      payload: {
        target:      round.target,
        targetLabel: CAT_LABELS[round.target],
        targetColor: CAT_COLORS[round.target],
        items:       this.waveItems.map(({ id, name, emoji, category }) => ({ id, name, emoji, category })),
        baseSpeed:   round.baseSpeed,
        spawnDelay:  round.spawnDelay,
        pts:         round.pts,
        lives:       this.lives,
      }
    };
  }

  getScore()    { return this.score; }
  getGameType() { return 'slash'; }
  isFinished()  { return this.finished; }
  finish()      { return { score: this.score }; }
}

module.exports = SortGame;
