// models/Number.js

const mongoose = require('mongoose');

const NumberSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Number ID is required'],
    unique: true,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    enum: {
      values: [
        'Basic Numbers 0-10', 
        'Teens 11-20', 
        'Twenty-one to Twenty-five', 
        'Tens', 
        'Hundreds', 
        'Thousands & Special',
        'Ordinal Numbers 1-10', 
        'Ordinal Numbers 11-20', 
        'Ordinal Numbers 21-31'
      ],
      message: '{VALUE} is not a valid category'
    }
  },
  portuguese: {
    type: String,
    required: [true, 'Portuguese text is required'],
    trim: true,
    maxlength: [50, 'Portuguese text cannot exceed 50 characters']
  },
  english: {
    type: String,
    required: [true, 'English text is required'],
    trim: true,
    maxlength: [50, 'English text cannot exceed 50 characters']
  },
  pronunciation: {
    type: String,
    required: [true, 'Pronunciation is required'],
    trim: true,
    maxlength: [50, 'Pronunciation cannot exceed 50 characters']
  },
  example: {
    type: String,
    required: [true, 'Example is required'],
    trim: true,
    maxlength: [200, 'Example cannot exceed 200 characters']
  },
  exampleTranslation: {
    type: String,
    required: [true, 'Example translation is required'],
    trim: true,
    maxlength: [200, 'Example translation cannot exceed 200 characters']
  },
  order: {
    type: Number,
    required: [true, 'Order is required'],
    min: [1, 'Order must be at least 1']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster queries
NumberSchema.index({ category: 1, order: 1 });

module.exports = mongoose.model('Number', NumberSchema);