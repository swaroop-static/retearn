const ITEMS = [
  { name: 'Banana Peel',    emoji: '🍌', bin: 'wet',       fact: 'Banana peels decompose quickly — perfect for composting.' },
  { name: 'Plastic Bottle', emoji: '🍾', bin: 'dry',       fact: 'Plastic bottles are 100% recyclable. Always rinse first!' },
  { name: 'Old Phone',      emoji: '📱', bin: 'ewaste',    fact: 'Phones contain toxic metals — recycle at e-waste centres.' },
  { name: 'Battery',        emoji: '🔋', bin: 'hazardous', fact: 'Batteries leak acid — never throw in regular bins.' },
  { name: 'Newspaper',      emoji: '📰', bin: 'dry',       fact: 'Newspapers can be recycled up to 7 times!' },
  { name: 'Food Scraps',    emoji: '🥗', bin: 'wet',       fact: 'Food waste makes excellent compost for plants.' },
  { name: 'Aluminium Can',  emoji: '🥤', bin: 'dry',       fact: 'Aluminium can be recycled infinitely without quality loss.' },
  { name: 'Old Laptop',     emoji: '💻', bin: 'ewaste',    fact: 'Laptops have recoverable gold, silver and copper inside.' },
  { name: 'Paint Tin',      emoji: '🪣', bin: 'hazardous', fact: 'Paint contains harmful chemicals — use hazardous waste facilities.' },
  { name: 'Cardboard Box',  emoji: '📦', bin: 'dry',       fact: 'Cardboard can be recycled into new boxes and paper.' },
  { name: 'Apple Core',     emoji: '🍎', bin: 'wet',       fact: 'Apple cores are biodegradable and great for composting.' },
  { name: 'Glass Bottle',   emoji: '🍶', bin: 'dry',       fact: 'Glass can be recycled endlessly without any loss of quality.' },
];

const BINS = {
  wet:       { label: 'Wet Waste',  emoji: '🟢', description: 'Food & organic' },
  dry:       { label: 'Dry Waste',  emoji: '🔵', description: 'Paper, plastic, metal' },
  ewaste:    { label: 'E-Waste',    emoji: '🟡', description: 'Electronics' },
  hazardous: { label: 'Hazardous',  emoji: '🔴', description: 'Chemicals & batteries' },
};

const ITEM_TIME   = 12;
const POINTS_EACH = 15;
const TOTAL_ITEMS = 8;

class SortGame {
  constructor() {
    this.items = shuffle([...ITEMS]).slice(0, TOTAL_ITEMS);
    this.currentIndex = 0;
    this.score  = 0;
    this.finished = false;
  }

  getGameType() { return 'sort'; }
  start()       { return this.getState(); }
  showNext()    { return this.getState(); }
  isFinished()  { return this.finished; }
  getScore()    { return this.score; }

  handleInput(value) {
    if (this.finished) return null;
    const item = this.items[this.currentIndex];
    if (!item) return null;

    const correct = value === item.bin;
    if (correct) this.score += POINTS_EACH;

    const result = {
      correct,
      correctValue: item.bin,
      points:  correct ? POINTS_EACH : 0,
      fact:    item.fact,
      state:   this.getState()
    };

    this.currentIndex++;
    if (this.currentIndex >= this.items.length) this.finished = true;
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
      payload:  item ? { item: { name: item.name, emoji: item.emoji }, bins: BINS } : null
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

module.exports = SortGame;
