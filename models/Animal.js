// models/Animal.js
const mongoose = require('mongoose');

const RelatedTermSchema = new mongoose.Schema({
  portuguese: { type: String, required: true },
  english: { type: String, required: true }
});

const AnimalSchema = new mongoose.Schema({
  portuguese: { type: String, required: true },
  english: { type: String, required: true },
  pronunciation: { type: String, required: true },
  plural: { type: String, required: true },
  category: { type: String, required: true },
  example: { type: String, required: true },
  exampleTranslation: { type: String, required: true },
  related: [RelatedTermSchema]
});

module.exports = mongoose.model('Animal', AnimalSchema);