const PAIRS = [
  { id:  1, emoji: '🍾', name: 'Glass Bottle' },
  { id:  2, emoji: '📰', name: 'Newspaper' },
  { id:  3, emoji: '🥤', name: 'Aluminium Can' },
  { id:  4, emoji: '🔋', name: 'Battery' },
  { id:  5, emoji: '💻', name: 'Laptop' },
  { id:  6, emoji: '🍌', name: 'Banana Peel' },
  { id:  7, emoji: '♻️', name: 'Recycle Symbol' },
  { id:  8, emoji: '🌿', name: 'Organic Waste' },
  { id:  9, emoji: '📦', name: 'Cardboard Box' },
  { id: 10, emoji: '🥫', name: 'Metal Tin' },
  { id: 11, emoji: '🧴', name: 'PET Bottle' },
  { id: 12, emoji: '🔌', name: 'Old Charger' },
];

const PAIR_TIME    = 12;   // seconds per attempt
const POINTS_MATCH = 15;
const MAX_ATTEMPTS = 26;   // 12 pairs × ~2.2 attempts average allowance

class MemoryGame {
  constructor() {
    const pairs = shuffle([...PAIRS]);
    const all = pairs.flatMap(p => [
      { id: p.id, emoji: p.emoji, name: p.name },
      { id: p.id, emoji: p.emoji, name: p.name }
    ]);
    this.cards    = shuffle(all).map((c, i) => ({ ...c, pos: i, matched: false }));
    this.matched  = new Set();
    this.attempts = 0;
    this.score    = 0;
    this.finished = false;
  }

  getGameType() { return 'memory'; }
  start()       { return this.getState(); }
  showNext()    { return this.getState(); }
  isFinished()  { return this.finished; }
  getScore()    { return this.score; }

  handleInput(value) {
    if (value === -1 || value === null) {
      this.attempts++;
      if (this.attempts >= MAX_ATTEMPTS) this.finished = true;
      return { correct: false, correctValue: null, points: 0, fact: 'Time ran out!', state: this.getState() };
    }

    const { pos1, pos2 } = value;
    if (pos1 === undefined || pos2 === undefined || pos1 === pos2) return null;

    const c1 = this.cards[pos1];
    const c2 = this.cards[pos2];
    if (!c1 || !c2 || c1.matched || c2.matched) return null;

    this.attempts++;
    const matched = c1.id === c2.id;

    if (matched) {
      this.cards[pos1].matched = true;
      this.cards[pos2].matched = true;
      this.matched.add(c1.id);
      this.score += POINTS_MATCH;
    }

    if (this.matched.size >= PAIRS.length || this.attempts >= MAX_ATTEMPTS) {
      this.finished = true;
    }

    return {
      correct:      matched,
      correctValue: null,
      pos1, pos2,
      emoji1: c1.emoji,
      emoji2: c2.emoji,
      points: matched ? POINTS_MATCH : 0,
      fact:   matched ? `✓ ${c1.name} matched!` : `✗ Not a match — keep going!`,
      state:  this.getState()
    };
  }

  getState() {
    return {
      score:    this.score,
      timeLeft: PAIR_TIME,
      progress: this.matched.size,
      total:    PAIRS.length,
      gameType: this.getGameType(),
      payload: {
        cards:       this.cards.map(c => ({ pos: c.pos, matched: c.matched, emoji: c.emoji, name: c.name })),
        attempts:    this.attempts,
        maxAttempts: MAX_ATTEMPTS,
        totalPairs:  PAIRS.length
      }
    };
  }

  finish() {
    this.finished = true;
    return { score: this.score, total: PAIRS.length * POINTS_MATCH };
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = MemoryGame;
