// models/Day.js
const mongoose = require('mongoose');

const DaySchema = new mongoose.Schema({
  portuguese: { type: String, required: true },
  english: { type: String, required: true },
  pronunciation: { type: String, required: true },
  abbreviation: { type: String, required: true },
  example: { type: String, required: true },
  exampleTranslation: { type: String, required: true },
  tips: { type: String, required: true }
});

module.exports = mongoose.model('Day', DaySchema);