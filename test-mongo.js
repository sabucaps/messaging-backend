// backend/test-mongo.js
const mongoose = require('mongoose');

async function testConnection() {
  try {
    console.log('Testing MongoDB connection...');
    
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/chat-app', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ MongoDB Connected Successfully!');
    
    // Check if database exists
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('📂 Collections in database:');
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    // Test Message model
    const Message = require('./models/Message');
    const messageCount = await Message.countDocuments();
    console.log(`📊 Total messages in database: ${messageCount}`);
    
    // Create a test message
    const testMessage = new Message({
      _id: 'test_' + Date.now(),
      text: 'Test message from connection test',
      user: {
        _id: 'test_user',
        name: 'Test User',
        avatar: 'https://i.pravatar.cc/150'
      },
      createdAt: new Date(),
      type: 'text'
    });
    
    await testMessage.save();
    console.log('✅ Test message saved successfully!');
    
    // Count again
    const newCount = await Message.countDocuments();
    console.log(`📊 Total messages after test: ${newCount}`);
    
    mongoose.connection.close();
    console.log('✅ Connection closed.');
    
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.log('Make sure MongoDB is running: mongod --dbpath "C:\\data\\db"');
  }
}

testConnection();