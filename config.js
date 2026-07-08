require('dotenv').config();

module.exports = {
  PORT:                 parseInt(process.env.PORT)               || 3000,
  PUBLIC_URL:           process.env.PUBLIC_URL
                        || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null),
  MACHINE_ID:           process.env.MACHINE_ID                   || 'machine1',
  QUESTION_TIME:        parseInt(process.env.QUESTION_TIME)      || 20,
  TOTAL_QUESTIONS:      parseInt(process.env.TOTAL_QUESTIONS)    || 8,
  POINTS_PER_CORRECT:   parseInt(process.env.POINTS_PER_CORRECT) || 20,
  ANSWER_DELAY:         parseInt(process.env.ANSWER_DELAY)       || 2000,
  NEXT_PLAYER_COUNTDOWN:parseInt(process.env.NEXT_PLAYER_COUNTDOWN) || 3,
};
