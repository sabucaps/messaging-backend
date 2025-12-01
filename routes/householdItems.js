// routes/householdItems.js
const express = require('express');
const router = express.Router();
const HouseholdItem = require('../models/HouseholdItem');

// Get all household items
router.get('/', async (req, res) => {
  try {
    const items = await HouseholdItem.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get household items by category
router.get('/category/:category', async (req, res) => {
  try {
    const items = await HouseholdItem.find({ category: req.params.category });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single household item
router.get('/:id', async (req, res) => {
  try {
    const item = await HouseholdItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new household item
router.post('/', async (req, res) => {
  const item = new HouseholdItem(req.body);
  try {
    const newItem = await item.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;