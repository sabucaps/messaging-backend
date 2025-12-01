// routes/people.js
const express = require('express');
const router = express.Router();
const Person = require('../models/Person');

// Get all people
router.get('/', async (req, res) => {
  try {
    const people = await Person.find();
    res.json(people);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get people by category
router.get('/category/:category', async (req, res) => {
  try {
    const people = await Person.find({ category: req.params.category });
    res.json(people);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single person
router.get('/:id', async (req, res) => {
  try {
    const person = await Person.findById(req.params.id);
    if (!person) return res.status(404).json({ message: 'Person not found' });
    res.json(person);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new person
router.post('/', async (req, res) => {
  const person = new Person(req.body);
  try {
    const newPerson = await person.save();
    res.status(201).json(newPerson);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;