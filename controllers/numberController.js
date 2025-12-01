// controllers/numberController.js

const Number = require('../models/Number');

// Helper function to get random items from an array
const getRandomItems = (array, count) => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Helper function to shuffle an array
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// Helper function to generate Portuguese to English questions
const generatePortugueseToEnglishQuestions = async (count = 5) => {
  try {
    // Get all numbers from the database
    const allNumbers = await Number.find({});
    
    // Select random numbers for the quiz
    const selectedNumbers = getRandomItems(allNumbers, count);
    
    // Generate questions
    const questions = selectedNumbers.map((number, index) => {
      // Get 3 wrong options (other numbers)
      const wrongOptions = allNumbers
        .filter(n => n.id !== number.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(n => n.english);
      
      // Combine correct and wrong options, then shuffle
      const allOptions = shuffleArray([number.english, ...wrongOptions]);
      
      return {
        id: index + 1,
        question: `What does "${number.portuguese}" mean in English?`,
        options: allOptions,
        correct: number.english,
        number: number,
        type: 'portuguese-to-english'
      };
    });
    
    return questions;
  } catch (error) {
    console.error('Error generating Portuguese to English questions:', error);
    return [];
  }
};

// Helper function to generate English to Portuguese questions
const generateEnglishToPortugueseQuestions = async (count = 5) => {
  try {
    // Get all numbers from the database
    const allNumbers = await Number.find({});
    
    // Select random numbers for the quiz
    const selectedNumbers = getRandomItems(allNumbers, count);
    
    // Generate questions
    const questions = selectedNumbers.map((number, index) => {
      // Get 3 wrong options (other numbers)
      const wrongOptions = allNumbers
        .filter(n => n.id !== number.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(n => n.portuguese);
      
      // Combine correct and wrong options, then shuffle
      const allOptions = shuffleArray([number.portuguese, ...wrongOptions]);
      
      return {
        id: index + 1,
        question: `What is the Portuguese word for "${number.english}"?`,
        options: allOptions,
        correct: number.portuguese,
        number: number,
        type: 'english-to-portuguese'
      };
    });
    
    return questions;
  } catch (error) {
    console.error('Error generating English to Portuguese questions:', error);
    return [];
  }
};

// Helper function to generate "Complete the Sentence" questions
const generateSentenceQuestions = async (count = 3) => {
  try {
    // Get all numbers from the database
    const allNumbers = await Number.find({});
    
    // Select random numbers for the quiz
    const selectedNumbers = getRandomItems(allNumbers, count);
    
    // Generate questions
    const questions = selectedNumbers.map((number, index) => {
      // Create a sentence with a blank
      const example = number.example;
      const words = example.split(' ');
      
      // Find the position of the number in the sentence
      let numberPosition = -1;
      for (let i = 0; i < words.length; i++) {
        // Clean the word for comparison (remove punctuation)
        const cleanWord = words[i].toLowerCase().replace(/[.,!?;:]/g, '');
        const cleanPortuguese = number.portuguese.toLowerCase();
        
        if (cleanWord === cleanPortuguese) {
          numberPosition = i;
          break;
        }
      }
      
      // If we can't find the number in the example, use a default position
      if (numberPosition === -1) {
        numberPosition = Math.floor(words.length / 2);
      }
      
      // Create the sentence with a blank
      const beforeBlank = words.slice(0, numberPosition).join(' ');
      const afterBlank = words.slice(numberPosition + 1).join(' ');
      const sentenceWithBlank = `${beforeBlank} _____ ${afterBlank}`;
      
      // Get 3 wrong options (other numbers)
      const wrongOptions = allNumbers
        .filter(n => n.id !== number.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(n => n.portuguese);
      
      // Combine correct and wrong options, then shuffle
      const allOptions = shuffleArray([number.portuguese, ...wrongOptions]);
      
      return {
        id: index + 1,
        question: `Complete the sentence: "${sentenceWithBlank}"`,
        options: allOptions,
        correct: number.portuguese,
        number: number,
        type: 'complete-sentence',
        example: example
      };
    });
    
    return questions;
  } catch (error) {
    console.error('Error generating sentence questions:', error);
    return [];
  }
};

// Helper function to generate "What Comes Next" questions
const generateSequenceQuestions = async (count = 2) => {
  try {
    // Get all numbers from the database
    const allNumbers = await Number.find({});
    
    // Generate questions for number sequences
    const questions = [];
    
    // Create a sequence question for basic numbers (1-10)
    const basicNumbers = allNumbers.filter(n => 
      n.category === 'Basic Numbers 0-10' && 
      !isNaN(parseInt(n.id))
    );
    
    if (basicNumbers.length > 0) {
      // Select a random starting number between 1-9
      const startNumber = Math.floor(Math.random() * 9) + 1;
      const nextNumber = startNumber + 1;
      
      // Find the number objects
      const currentNumberObj = basicNumbers.find(n => parseInt(n.id) === startNumber);
      const nextNumberObj = basicNumbers.find(n => parseInt(n.id) === nextNumber);
      
      if (currentNumberObj && nextNumberObj) {
        // Get 3 wrong options (other numbers)
        const wrongOptions = basicNumbers
          .filter(n => parseInt(n.id) !== nextNumber)
          .sort(() => 0.5 - Math.random())
          .slice(0, 3)
          .map(n => n.portuguese);
        
        // Combine correct and wrong options, then shuffle
        const allOptions = shuffleArray([nextNumberObj.portuguese, ...wrongOptions]);
        
        questions.push({
          id: questions.length + 1,
          question: `What comes after "${currentNumberObj.portuguese}"?`,
          options: allOptions,
          correct: nextNumberObj.portuguese,
          number: nextNumberObj,
          type: 'sequence',
          sequence: [currentNumberObj.portuguese, nextNumberObj.portuguese]
        });
      }
    }
    
    return questions;
  } catch (error) {
    console.error('Error generating sequence questions:', error);
    return [];
  }
};

// @desc    Get all numbers organized by category
// @route   GET /api/numbers
// @access  Public
exports.getAllNumbers = async (req, res) => {
  try {
    // Define all categories we want to include
    const categories = [
      'Basic Numbers 0-10', 
      'Teens 11-20', 
      'Twenty-one to Thirty-nine', 
      'Tens', 
      'One hundred', 
      'Thousands & Special',
      'Ordinal Numbers 1-10', 
      'Ordinal Numbers 11-20', 
      'Ordinal Numbers 21-31'
    ];
    
    const result = [];
    
    for (const category of categories) {
      const numbers = await Number.find({ category })
        .sort({ order: 1 })
        .select('-__v -createdAt -updatedAt');
      
      // Only include categories that have numbers
      if (numbers.length > 0) {
        result.push({
          title: category,
          data: numbers
        });
      }
    }
    
    res.status(200).json({
      success: true,
      count: result.reduce((acc, curr) => acc + curr.data.length, 0),
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get a single number by ID
// @route   GET /api/numbers/:id
// @access  Public
exports.getNumberById = async (req, res) => {
  try {
    const number = await Number.findOne({ id: req.params.id }).select('-__v -createdAt -updatedAt');
    
    if (!number) {
      return res.status(404).json({
        success: false,
        message: 'Number not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: number
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get comprehensive quiz questions
// @route   GET /api/numbers/quiz
// @access  Public
exports.getQuizQuestions = async (req, res) => {
  try {
    // Get different types of questions
    const portugueseToEnglishQuestions = await generatePortugueseToEnglishQuestions(3);
    const englishToPortugueseQuestions = await generateEnglishToPortugueseQuestions(3);
    const sentenceQuestions = await generateSentenceQuestions(2);
    const sequenceQuestions = await generateSequenceQuestions(2);
    
    // Combine all questions
    const allQuestions = [
      ...portugueseToEnglishQuestions,
      ...englishToPortugueseQuestions,
      ...sentenceQuestions,
      ...sequenceQuestions
    ];
    
    // Shuffle all questions to randomize the order
    const shuffledQuestions = shuffleArray(allQuestions);
    
    // Add sequential IDs to the shuffled questions
    const finalQuestions = shuffledQuestions.map((q, index) => ({
      ...q,
      id: index + 1
    }));
    
    res.status(200).json({
      success: true,
      count: finalQuestions.length,
      data: finalQuestions
    });
  } catch (error) {
    console.error('Error generating quiz questions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get quiz questions by type
// @route   GET /api/numbers/quiz/:type
// @access  Public
exports.getQuizQuestionsByType = async (req, res) => {
  try {
    const { type } = req.params;
    let questions = [];
    
    switch (type) {
      case 'portuguese-to-english':
        questions = await generatePortugueseToEnglishQuestions(10);
        break;
      case 'english-to-portuguese':
        questions = await generateEnglishToPortugueseQuestions(10);
        break;
      case 'complete-sentence':
        questions = await generateSentenceQuestions(10);
        break;
      case 'sequence':
        questions = await generateSequenceQuestions(10);
        break;
      default:
        // Return mixed questions if type is not recognized
        const portugueseToEnglishQuestions = await generatePortugueseToEnglishQuestions(3);
        const englishToPortugueseQuestions = await generateEnglishToPortugueseQuestions(3);
        const sentenceQuestions = await generateSentenceQuestions(2);
        const sequenceQuestions = await generateSequenceQuestions(2);
        
        questions = [
          ...portugueseToEnglishQuestions,
          ...englishToPortugueseQuestions,
          ...sentenceQuestions,
          ...sequenceQuestions
        ];
        break;
    }
    
    // Shuffle questions
    const shuffledQuestions = shuffleArray(questions);
    
    // Add sequential IDs
    const finalQuestions = shuffledQuestions.map((q, index) => ({
      ...q,
      id: index + 1
    }));
    
    res.status(200).json({
      success: true,
      count: finalQuestions.length,
      data: finalQuestions
    });
  } catch (error) {
    console.error('Error generating quiz questions by type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};