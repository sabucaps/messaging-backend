// backend/models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    text: {
        type: String,
        default: ''
    },
    image: String,
    file: String,
    location: Object,
    user: {
        _id: {
            type: String,
            required: true
        },
        name: String,
        avatar: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: null
    },
    replyTo: String,
    linkPreview: Object,
    type: {
        type: String,
        default: 'text'
    },
    reactions: [{
        user: String,
        emoji: String
    }],
    seenBy: [String],
    // Make receiverId optional for backward compatibility
    receiverId: {
        type: String,
        default: null // Changed from required: true
    },
    // New fields for deletion
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    },
    deletedBy: {
        type: String,
        default: null
    },
    // Field for edits
    isEdited: {
        type: Boolean,
        default: false
    },
    pushNotificationSent: {
        type: Boolean,
        default: false
    },
    pushSentAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Add pre-save middleware to ensure receiverId exists for new messages
MessageSchema.pre('save', function(next) {
    // If receiverId is not set, determine it from sender/receiver logic
    if (!this.receiverId && this.user && this.user._id) {
        // Determine the other user in the 1-on-1 chat
        this.receiverId = this.user._id === 'user_1' ? 'user_2' : 'user_1';
    }
    next();
});

// Create index for faster queries
MessageSchema.index({ receiverId: 1, createdAt: -1 });
MessageSchema.index({ isDeleted: 1 });
MessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);