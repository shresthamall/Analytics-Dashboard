const fetch = require('node-fetch');

// Simulate visitor events
const countries = ['India', 'USA', 'UK', 'Canada', 'Australia', 'Germany', 'France', 'Japan'];
const devices = ['mobile', 'desktop', 'tablet'];
const pages = ['/', '/products', '/about', '/contact', '/blog', '/pricing'];
const referrers = ['google.com', 'facebook.com', 'twitter.com', 'linkedin.com', 'direct'];

function generateRandomEvent() {
  // 70% pageview, 20% click, 10% session_end
  const rand = Math.random();
  let type;
  if (rand < 0.7) {
    type = 'pageview';
  } else if (rand < 0.9) {
    type = 'click';
  } else {
    type = 'session_end';
  }

  const country = countries[Math.floor(Math.random() * countries.length)];
  const device = devices[Math.floor(Math.random() * devices.length)];
  const page = pages[Math.floor(Math.random() * pages.length)];
  const referrer = referrers[Math.floor(Math.random() * referrers.length)];
  
  return {
    type,
    country,
    metadata: {
      device,
      page,
      referrer,
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
  };
}

async function sendEvent(event) {
  try {
    const response = await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event)
    });
    
    const result = await response.json();
    console.log(`✅ Event sent: ${event.type} from ${event.country}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending event:', error.message);
  }
}

async function simulateVisitors() {
  console.log('🚀 Starting visitor simulation...');
  console.log('📊 Sending events every 2-5 seconds...');
  console.log('⏹️  Press Ctrl+C to stop\n');
  
  let eventCount = 0;
  
  const sendRandomEvent = async () => {
    const event = generateRandomEvent();
    await sendEvent(event);
    eventCount++;
    
    // Schedule next event
    const delay = Math.random() * 3000 + 2000; // 2-5 seconds
    setTimeout(sendRandomEvent, delay);
  };
  
  // Start sending events
  sendRandomEvent();
  
  // Log statistics every 10 seconds
  setInterval(() => {
    console.log(`📈 Total events sent: ${eventCount}`);
  }, 10000);
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/analytics/summary');
    if (response.ok) {
      console.log('✅ Server is running!');
      return true;
    }
  } catch (error) {
    console.error('❌ Server is not running. Please start the server first:');
    console.error('   npm run dev');
    return false;
  }
}

// Main execution
async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    simulateVisitors();
  }
}

main(); 