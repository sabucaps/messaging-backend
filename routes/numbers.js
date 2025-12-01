// routes/numbers.js

const express = require('express');
const {
  getAllNumbers,
  getNumberById,
  getQuizQuestions,
  getQuizQuestionsByType
} = require('../controllers/numberController');

const router = express.Router();

// Route for getting all numbers organized by category
router.get('/', getAllNumbers);

// Route for getting quiz questions
router.get('/quiz', getQuizQuestions);

// Route for getting quiz questions by type
router.get('/quiz/:type', getQuizQuestionsByType);

// Route for getting a single number by ID
router.get('/:id', getNumberById);

module.exports = router;