// backend/models/UserStatus.js - SIMPLIFIED
const mongoose = require('mongoose');

const UserStatusSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  expoPushToken: {
    type: String,
    default: null
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserStatus', UserStatusSchema);