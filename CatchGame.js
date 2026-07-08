const ITEMS = [
  { name: 'Plastic Bottle',   emoji: '🍾', recyclable: true,  fact: 'Plastic bottles are 100% recyclable. Always rinse first!' },
  { name: 'Aluminium Can',    emoji: '🥤', recyclable: true,  fact: 'Aluminium is the most valuable recyclable material.' },
  { name: 'Newspaper',        emoji: '📰', recyclable: true,  fact: 'One tonne of recycled paper saves 17 trees.' },
  { name: 'Glass Bottle',     emoji: '🍶', recyclable: true,  fact: 'Glass is 100% recyclable and never degrades.' },
  { name: 'Cardboard Box',    emoji: '📦', recyclable: true,  fact: 'Flatten cardboard before recycling to save space.' },
  { name: 'Steel Tin',        emoji: '🥫', recyclable: true,  fact: 'Steel tins are magnetic and easy to sort at recycling plants.' },
  { name: 'Greasy Pizza Box', emoji: '🍕', recyclable: false, fact: 'Grease contamination makes pizza boxes unrecyclable.' },
  { name: 'Styrofoam Cup',    emoji: '🧊', recyclable: false, fact: 'Styrofoam takes 500 years to break down in landfills.' },
  { name: 'Dirty Diaper',     emoji: '🧷', recyclable: false, fact: 'Soiled diapers are biohazardous — never recycle.' },
  { name: 'Ceramic Mug',      emoji: '☕', recyclable: false, fact: 'Ceramics cannot be recycled in standard streams — donate instead.' },
  { name: 'Wet Tissue',       emoji: '🧻', recyclable: false, fact: 'Wet wipes contain plastic fibres and cannot be recycled.' },
  { name: 'Chip Packet',      emoji: '🍟', recyclable: false, fact: 'Multilayer plastic snack packets are extremely hard to recycle.' },
];

const ITEM_TIME   = 8;
const POINTS_EACH = 10;
const TOTAL_ITEMS = 10;
const TOTAL_LIVES = 3;

class CatchGame {
  constructor() {
    this.items = shuffle([...ITEMS]).slice(0, TOTAL_ITEMS);
    this.currentIndex = 0;
    this.score    = 0;
    this.lives    = TOTAL_LIVES;
    this.finished = false;
  }

  getGameType() { return 'catch'; }
  start()       { return this.getState(); }
  showNext()    { return this.getState(); }
  isFinished()  { return this.finished; }
  getScore()    { return this.score; }

  handleInput(value) {
    if (this.finished) return null;
    const item = this.items[this.currentIndex];
    if (!item) return null;

    // value: 'catch' | 'skip' | -1 (timeout = skip)
    const action      = value === 'catch' ? 'catch' : 'skip';
    const shouldCatch = item.recyclable;
    const correct     = (action === 'catch') === shouldCatch;

    if (correct) {
      this.score += POINTS_EACH;
    } else {
      this.lives = Math.max(0, this.lives - 1);
    }

    const result = {
      correct,
      correctValue: shouldCatch ? 'catch' : 'skip',
      points: correct ? POINTS_EACH : 0,
      lives:  this.lives,
      fact:   item.fact,
      state:  this.getState()
    };

    this.currentIndex++;
    if (this.currentIndex >= this.items.length || this.lives <= 0) {
      this.finished = true;
    }
    return result;
  }

  getState() {
    const item = this.items[this.currentIndex] || null;
    return {
      score:    this.score,
      timeLeft: ITEM_TIME,
      progress: this.currentIndex + 1,
      total:    this.items.length,
      gameType: this.getGameType(),
      payload:  item ? {
        item:     { name: item.name, emoji: item.emoji },
        lives:    this.lives,
        maxLives: TOTAL_LIVES
      } : null
    };
  }

  finish() {
    this.finished = true;
    return { score: this.score, total: this.items.length * POINTS_EACH };
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = CatchGame;
