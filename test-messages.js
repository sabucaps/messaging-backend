// backend/test-messages.js
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function testMessagePersistence() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/chat-app', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('🧪 Testing Message Persistence...\n');
    
    // 1. Create a test message
    const testMsg = {
      _id: 'persistence_test_' + Date.now(),
      text: 'This is a persistence test message',
      user: {
        _id: 'test_user_1',
        name: 'Test User',
        avatar: 'https://i.pravatar.cc/150'
      },
      createdAt: new Date(),
      type: 'text'
    };
    
    const message = new Message(testMsg);
    await message.save();
    console.log('✅ Test message saved to database');
    console.log('   Message ID:', message._id);
    console.log('   Text:', message.text);
    console.log('   Created:', message.createdAt);
    
    // 2. Retrieve the same message
    const retrieved = await Message.findById(message._id);
    console.log('\n✅ Message retrieved from database');
    console.log('   Retrieved ID:', retrieved._id);
    console.log('   Retrieved Text:', retrieved.text);
    
    // 3. Check if they match
    if (retrieved._id === message._id && retrieved.text === message.text) {
      console.log('\n🎉 SUCCESS: Message persistence is working correctly!');
    } else {
      console.log('\n⚠️ WARNING: Message data mismatch detected');
    }
    
    // 4. Count all messages
    const totalMessages = await Message.countDocuments();
    console.log('\n📊 Total messages in database:', totalMessages);
    
    // 5. List recent messages
    const recentMessages = await Message.find({})
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log('\n📝 Recent messages:');
    recentMessages.forEach((msg, index) => {
      console.log(`   ${index + 1}. [${msg.user.name}]: ${msg.text || '[Media]'} (${msg.createdAt.toLocaleTimeString()})`);
    });
    
    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testMessagePersistence();