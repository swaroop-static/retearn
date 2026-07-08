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
const ROUNDS = [
  { target: 'dry',    correct: 4, total: 7,  waveTime: 20, baseSpeed: 85,  spawnDelay: 1800, pts: 5  },
  { target: 'wet',    correct: 4, total: 8,  waveTime: 18, baseSpeed: 105, spawnDelay: 1500, pts: 6  },
  { target: 'ewaste', correct: 5, total: 10, waveTime: 16, baseSpeed: 130, spawnDelay: 1200, pts: 7  },
  { target: 'dry',    correct: 6, total: 11, waveTime: 14, baseSpeed: 155, spawnDelay: 1000, pts: 8  },
  { target: 'ewaste', correct: 6, total: 12, waveTime: 12, baseSpeed: 175, spawnDelay: 850,  pts: 10 },
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
    this.roundIndex = 0;
    this.score      = 0;
    this.lives      = LIVES_START;
    this.idCounter  = 1;
    this.waveItems  = [];
    this.finished   = false;
    this._buildWave();
  }

  _buildWave() {
    const { target, correct, total } = ROUNDS[this.roundIndex];
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
    const round = ROUNDS[this.roundIndex];
    return {
      score:    this.score,
      lives:    this.lives,
      timeLeft: round.waveTime,
      progress: this.roundIndex + 1,
      total:    ROUNDS.length,
      gameType: 'sort',
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

    const round   = ROUNDS[this.roundIndex];
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

    const round     = ROUNDS[this.roundIndex];
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
    const round = ROUNDS[this.roundIndex];
    this.waveItems.forEach(item => {
      if (!item.processed && item.category === round.target) {
        item.processed = true;
        this.lives = Math.max(0, this.lives - 1);
      }
    });
    if (this.lives <= 0) this.finished = true;
    return this._advanceWave();
  }

  _advanceWave() {
    const prevRound = ROUNDS[this.roundIndex];
    this.roundIndex++;

    if (this.finished || this.roundIndex >= ROUNDS.length) {
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
    const next = ROUNDS[this.roundIndex];
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
    const ri    = Math.min(this.roundIndex, ROUNDS.length - 1);
    const round = ROUNDS[ri];
    return {
      score:    this.score,
      lives:    this.lives,
      progress: Math.min(this.roundIndex + 1, ROUNDS.length),
      total:    ROUNDS.length,
      gameType: 'sort',
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
