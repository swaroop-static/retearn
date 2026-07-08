// Wave mechanic: 3 items appear simultaneously per wave.
// Player drags each one to a bin within 30s for the whole wave.

const ITEMS = [
  { name: 'Banana Peel',     emoji: '🍌', bin: 'wet',       fact: 'Banana peels decompose fast — great for composting.' },
  { name: 'Plastic Bottle',  emoji: '🍾', bin: 'dry',       fact: 'Plastic bottles are 100% recyclable — rinse first!' },
  { name: 'Old Phone',       emoji: '📱', bin: 'ewaste',    fact: 'Phones contain toxic metals — use e-waste centres.' },
  { name: 'Battery',         emoji: '🔋', bin: 'hazardous', fact: 'Batteries leak acid — never put in regular bins.' },
  { name: 'Newspaper',       emoji: '📰', bin: 'dry',       fact: 'Newspapers can be recycled up to 7 times!' },
  { name: 'Food Scraps',     emoji: '🥗', bin: 'wet',       fact: 'Food waste makes excellent compost for plants.' },
  { name: 'Aluminium Can',   emoji: '🥤', bin: 'dry',       fact: 'Aluminium can be recycled infinitely without quality loss.' },
  { name: 'Old Laptop',      emoji: '💻', bin: 'ewaste',    fact: 'Laptops contain recoverable gold, silver, and copper.' },
  { name: 'Paint Tin',       emoji: '🪣', bin: 'hazardous', fact: 'Paint has harmful chemicals — use hazardous waste sites.' },
  { name: 'Cardboard Box',   emoji: '📦', bin: 'dry',       fact: 'Flatten cardboard before recycling to save space.' },
  { name: 'Apple Core',      emoji: '🍎', bin: 'wet',       fact: 'Apple cores are biodegradable — perfect for composting.' },
  { name: 'Glass Bottle',    emoji: '🍶', bin: 'dry',       fact: 'Glass can be recycled endlessly with zero quality loss.' },
  { name: 'Dead Plant',      emoji: '🌿', bin: 'wet',       fact: 'Dead plants and leaves are excellent wet/compost waste.' },
  { name: 'Old Charger',     emoji: '🔌', bin: 'ewaste',    fact: 'Chargers contain copper and plastics — recycle as e-waste.' },
  { name: 'CFL Bulb',        emoji: '💡', bin: 'hazardous', fact: 'CFL bulbs contain mercury — handle as hazardous waste.' },
  { name: 'Steel Tin',       emoji: '🥫', bin: 'dry',       fact: 'Steel tins are magnetic and easily sorted at recycling plants.' },
  { name: 'Egg Shells',      emoji: '🥚', bin: 'wet',       fact: 'Egg shells add calcium to compost — always wet waste.' },
  { name: 'Printer Ink',     emoji: '🖨️', bin: 'hazardous', fact: 'Printer ink cartridges contain chemicals — take to collection points.' },
  { name: 'Milk Carton',     emoji: '🥛', bin: 'dry',       fact: 'Rinse tetra paks flat — most facilities recycle them.' },
  { name: 'Keyboard',        emoji: '⌨️', bin: 'ewaste',    fact: 'Old keyboards have circuit boards with recoverable metals.' },
  { name: 'Tea Bags',        emoji: '🍵', bin: 'wet',       fact: 'Most paper tea bags are fully compostable in wet waste.' },
  { name: 'Bubble Wrap',     emoji: '📬', bin: 'hazardous', fact: 'Soft plastics jam recycling machines — drop off separately.' },
];

const BINS = {
  wet:       { label: 'Wet Waste',  emoji: '🟢', description: 'Food & organic' },
  dry:       { label: 'Dry Waste',  emoji: '🔵', description: 'Paper, plastic, metal' },
  ewaste:    { label: 'E-Waste',    emoji: '🟡', description: 'Electronics' },
  hazardous: { label: 'Hazardous',  emoji: '🔴', description: 'Chemicals & batteries' },
};

const WAVE_SIZE    = 3;  // items visible per wave
const TOTAL_WAVES  = 4;  // waves per game
const WAVE_TIME    = 30; // seconds for the whole wave
const POINTS_EACH  = 15;

class SortGame {
  constructor() {
    this.items      = shuffle([...ITEMS]).slice(0, WAVE_SIZE * TOTAL_WAVES);
    this.waveIndex  = 0; // which wave (0-3)
    this.itemIndex  = 0; // which item within wave (0-2)
    this.score      = 0;
    this.finished   = false;
  }

  getGameType() { return 'sort'; }
  isFinished()  { return this.finished; }
  getScore()    { return this.score; }

  start() { return this.getState(); }

  showNext() {
    this.itemIndex = 0;
    return this.getState();
  }

  handleInput(value) {
    if (this.finished) return null;

    // Timer expired mid-wave — fail remaining items and end wave
    if (value === -1 || value === null) {
      this.itemIndex = WAVE_SIZE; // skip rest
      this.waveIndex++;
      if (this.waveIndex >= TOTAL_WAVES) this.finished = true;
      return {
        waveComplete:  true,
        correct:       false,
        correctValue:  null,
        points:        0,
        fact:          'Time ran out!',
        state:         this.getState()
      };
    }

    const globalIdx = this.waveIndex * WAVE_SIZE + this.itemIndex;
    const item = this.items[globalIdx];
    if (!item) return null;

    const correct = value === item.bin;
    if (correct) this.score += POINTS_EACH;

    const itemResult = {
      itemIndex:  this.itemIndex,
      correct,
      correctBin: item.bin,
      points:     correct ? POINTS_EACH : 0,
      fact:       item.fact,
    };

    this.itemIndex++;

    // Wave not yet complete — return partial so timer keeps running
    if (this.itemIndex < WAVE_SIZE) {
      return {
        wavePartial: true,
        ...itemResult,
        state: this.getState(),
      };
    }

    // Wave complete
    this.waveIndex++;
    if (this.waveIndex >= TOTAL_WAVES) this.finished = true;

    return {
      waveComplete:  true,
      correct:       itemResult.correct,
      correctValue:  item.bin,
      points:        itemResult.points,
      fact:          itemResult.fact,
      state:         this.getState(),
    };
  }

  getState() {
    const waveStart = this.waveIndex * WAVE_SIZE;
    const waveItems = this.items.slice(waveStart, waveStart + WAVE_SIZE).map(i => ({
      name: i.name, emoji: i.emoji
    }));
    return {
      score:    this.score,
      timeLeft: WAVE_TIME,
      progress: this.waveIndex + 1,
      total:    TOTAL_WAVES,
      gameType: this.getGameType(),
      payload:  {
        waveItems,
        currentItemIndex: this.itemIndex,
        waveSize:         WAVE_SIZE,
        bins:             BINS,
      }
    };
  }

  finish() {
    this.finished = true;
    return { score: this.score, total: WAVE_SIZE * TOTAL_WAVES * POINTS_EACH };
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
