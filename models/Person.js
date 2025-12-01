// models/Person.js
const mongoose = require('mongoose');

const FormSchema = new mongoose.Schema({
  gender: {
    type: String,
    required: true,
    enum: ['masculine', 'feminine', 'both']
  },
  singular: {
    type: String,
    required: true
  },
  plural: {
    type: String,
    required: true
  },
  example: {
    type: String,
    required: true
  },
  exampleTranslation: {
    type: String,
    required: true
  }
});

const RelatedTermSchema = new mongoose.Schema({
  portuguese: {
    type: String,
    required: true
  },
  english: {
    type: String,
    required: true
  }
});

const PersonSchema = new mongoose.Schema({
  portuguese: {
    type: [String], // Changed to array of strings
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Portuguese must be a non-empty array'
    }
  },
  english: {
    type: [String], // Changed to array of strings
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'English must be a non-empty array'
    }
  },
  pronunciation: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['family', 'relatives', 'professions', 'relationships']
  },
  forms: [FormSchema],
  related: [RelatedTermSchema]
});

module.exports = mongoose.model('Person', PersonSchema);