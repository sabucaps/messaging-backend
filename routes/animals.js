// routes/animals.js
const express = require('express');
const router = express.Router();
const Animal = require('../models/Animal');

// Get all animals
router.get('/', async (req, res) => {
  try {
    const animals = await Animal.find();
    res.json(animals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get animals by category
router.get('/category/:category', async (req, res) => {
  try {
    const animals = await Animal.find({ category: req.params.category });
    res.json(animals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single animal
router.get('/:id', async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: 'Animal not found' });
    res.json(animal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new animal
router.post('/', async (req, res) => {
  const animal = new Animal(req.body);
  try {
    const newAnimal = await animal.save();
    res.status(201).json(newAnimal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update an animal
router.put('/:id', async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: 'Animal not found' });
    
    Object.assign(animal, req.body);
    const updatedAnimal = await animal.save();
    res.json(updatedAnimal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete an animal
router.delete('/:id', async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: 'Animal not found' });
    
    await animal.remove();
    res.json({ message: 'Animal deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;