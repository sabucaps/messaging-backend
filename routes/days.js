// routes/days.js
const express = require('express');
const router = express.Router();
const Day = require('../models/Day');

// Get all days
router.get('/', async (req, res) => {
  try {
    const days = await Day.find();
    res.json(days);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single day by ID
router.get('/:id', async (req, res) => {
  try {
    const day = await Day.findById(req.params.id);
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json(day);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new day
router.post('/', async (req, res) => {
  const day = new Day(req.body);
  try {
    const newDay = await day.save();
    res.status(201).json(newDay);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a day
router.put('/:id', async (req, res) => {
  try {
    const day = await Day.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json(day);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a day
router.delete('/:id', async (req, res) => {
  try {
    const day = await Day.findByIdAndDelete(req.params.id);
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json({ message: 'Day deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;