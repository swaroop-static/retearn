require('dotenv').config();

module.exports = {
  PORT:                 parseInt(process.env.PORT)               || 3000,
  PUBLIC_URL:           process.env.PUBLIC_URL                   || null,
  MACHINE_ID:           process.env.MACHINE_ID                   || 'machine1',
  QUESTION_TIME:        parseInt(process.env.QUESTION_TIME)      || 30,
  TOTAL_QUESTIONS:      parseInt(process.env.TOTAL_QUESTIONS)    || 5,
  POINTS_PER_CORRECT:   parseInt(process.env.POINTS_PER_CORRECT) || 20,
  ANSWER_DELAY:         parseInt(process.env.ANSWER_DELAY)       || 2000,
  NEXT_PLAYER_COUNTDOWN:parseInt(process.env.NEXT_PLAYER_COUNTDOWN) || 3,
};
