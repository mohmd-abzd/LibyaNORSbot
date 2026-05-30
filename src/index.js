require('dotenv').config();

console.log('🚀 Starting Outbreak Detection System...');

// Start Telegram bot
require('./bot');

// Start Express API + dashboard
require('./api');
