const config = require('./config');
const allQuestions = require('./questions');

class QuizGame {
  constructor() {
    this.questions = this._shuffle([...allQuestions]).slice(0, config.TOTAL_QUESTIONS);
    this.currentIndex = 0;
    this.score = 0;
    this.finished = false;
  }

  getGameType() {
    return 'quiz';
  }

  start() {
    return this.getState();
  }

  handleInput(value) {
    if (this.finished) return null;

    const q = this.questions[this.currentIndex];
    const correct = parseInt(value) === q.answer;
    if (correct) this.score += config.POINTS_PER_CORRECT;

    const result = {
      correct,
      correctValue: q.answer,
      points: correct ? config.POINTS_PER_CORRECT : 0,
      fact: q.fact,
      state: this.getState()
    };

    this.currentIndex++;
    if (this.currentIndex >= this.questions.length) {
      this.finished = true;
    }

    return result;
  }

  showNext() {
    return this.getState();
  }

  isFinished() {
    return this.finished;
  }

  getScore() {
    return this.score;
  }

  getState() {
    const q = this.questions[this.currentIndex] || null;
    return {
      score: this.score,
      timeLeft: config.QUESTION_TIME,
      progress: this.currentIndex + 1,
      total: this.questions.length,
      gameType: this.getGameType(),
      payload: q ? {
        question: q.question,
        options: q.options
      } : null
    };
  }

  finish() {
    this.finished = true;
    return { score: this.score, total: this.questions.length * config.POINTS_PER_CORRECT };
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

module.exports = QuizGame;
