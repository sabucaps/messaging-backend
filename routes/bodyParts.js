// routes/bodyParts.js
const express = require('express');
const router = express.Router();
const BodyPart = require('../models/BodyPart');

// Get all body parts
router.get('/', async (req, res) => {
  try {
    const bodyParts = await BodyPart.find();
    res.json(bodyParts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get body parts by category
router.get('/category/:category', async (req, res) => {
  try {
    const bodyParts = await BodyPart.find({ category: req.params.category });
    res.json(bodyParts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single body part
router.get('/:id', async (req, res) => {
  try {
    const bodyPart = await BodyPart.findById(req.params.id);
    if (!bodyPart) return res.status(404).json({ message: 'Body part not found' });
    res.json(bodyPart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new body part
router.post('/', async (req, res) => {
  const bodyPart = new BodyPart(req.body);
  try {
    const newBodyPart = await bodyPart.save();
    res.status(201).json(newBodyPart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;