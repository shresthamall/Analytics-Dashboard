const express = require("express");
const path = require("path");
const store = require("./data/store");
const WebSocketServer = require("./ws/server");

const app = express();

// Parse JSON
app.use(express.json());

const server = app.listen(3000, () => {
  console.log("HTTP server running on http://localhost:3000");
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.resolve("./dashboard.html"));
});

app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.resolve("./dashboard.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.resolve("./client/index.html"));
});

// Initialize WebSocket server
const wsServer = new WebSocketServer(server);

// Generate session ID
function generateSessionId() {
  return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// REST API ------------------->
// Visitor Events
app.post("/api/events", (req, res) => {
  try {
    const { type, country, metadata } = req.body;   // Get event data
    
    if (!type || !country) {
      wsServer.broadcastAlert('warning', 'Invalid event data: type and country are required', {
        missingFields: { type: !type, country: !country },
        receivedData: req.body
      });
      return res.status(400).json({
        status: "error",
        message: "type and country are required"
      });
    }

    // Validate event type
    const validTypes = ['pageview', 'click', 'session_end'];
    if (!validTypes.includes(type)) {
      wsServer.broadcastAlert('warning', `Invalid event type: "${type}". Valid types are: ${validTypes.join(', ')}`, {
        invalidType: type,
        validTypes: validTypes,
        receivedData: req.body
      });
      return res.status(400).json({
        status: "error",
        message: "type must be one of: pageview, click, session_end"
      });
    }

  // Determine sessionId - use provided one or generate new
  const sessionId = req.body.sessionId || metadata?.sessionId || generateSessionId();
  
  const event = {
    id: Date.now() + Math.random(),     // Create unique ID for the event
    type,
    country,
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
    sessionId: sessionId
  };

  // Store event in memory
  store.visitorEvents.push(event);
  
  // Keep only last 1000 events
  if (store.visitorEvents.length > 1000) {
    store.visitorEvents.splice(0, store.visitorEvents.length - 1000);
  }

  // Handle session tracking
  if (type === 'pageview' || type === 'click') {
    // Check if session already exists and is active
    const existingSession = store.sessions.get(sessionId);
    
    if (!existingSession || !existingSession.isActive) {
      // Create new session (session starts) - either new session or restart after session_end
      const page = req.body.page || metadata?.page || '/';
      const newSession = {
        id: sessionId,
        startTime: event.timestamp,
        country: event.country,
        journey: [page], // Initialize journey with the first page
        currentPage: page,
        metadata: event.metadata,
        isActive: true // Mark session as active
      };
      store.sessions.set(sessionId, newSession);
      store.activeSessions.set(sessionId, newSession);
    } else {
      // Update existing active session
      const session = existingSession;
      const page = req.body.page || metadata?.page || '/';
      
      // Add page to journey (include all page visits, even duplicates)
      session.journey.push(page);
      
      session.currentPage = page;
      session.lastActivity = event.timestamp;
      
      // Update session metadata if provided
      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }
    }
    
    // Get the session (either new or updated)
    const session = store.sessions.get(sessionId);
    const page = req.body.page || metadata?.page || '/';
    
    // Calculate session duration (dynamic)
    const duration = Math.floor((new Date(event.timestamp) - new Date(session.startTime)) / 1000);
    
    // Broadcast session_activity event
    wsServer.broadcastSessionActivity({
      sessionId: sessionId,
      currentPage: page,
      journey: session.journey,
      duration: duration,
      isActive: true
    });
    
  } else if (type === 'session_end') {
    // End session (session ends)
    if (store.sessions.has(sessionId)) {
      const session = store.sessions.get(sessionId);
      session.isActive = false;
      session.endTime = event.timestamp;
      
      // Calculate final duration
      const finalDuration = Math.floor((new Date(event.timestamp) - new Date(session.startTime)) / 1000);
      
      // Broadcast session end
      wsServer.broadcastSessionActivity({
        sessionId: sessionId,
        currentPage: session.currentPage,
        journey: session.journey,
        duration: finalDuration,
        isActive: false
      });
    }
    
    // Remove from active sessions
    store.activeSessions.delete(sessionId);
  }

  // Update page visits for pageview events
  if (type === 'pageview') {
    const page = metadata?.page || '/';
    store.pageVisits.set(page, (store.pageVisits.get(page) || 0) + 1);
  }

  // Broadcast to all connected dashboards
  wsServer.broadcastVisitorUpdate(event);

  // Check for alert conditions
  const recentEvents = store.visitorEvents.filter(event => 
    new Date(event.timestamp) > new Date(Date.now() - 60 * 1000) // Last minute
  );
  
  if (recentEvents.length >= 10) {
    wsServer.broadcastAlert('warning', 'High visitor activity detected!', {
      visitorsLastMinute: recentEvents.length
    });
  }

    console.log(`Event received: ${type} from ${country}`);
    
    res.status(201).json({
      status: "success",
      received: event,
    });
  } catch (error) {
    console.error('Error processing event:', error);
    wsServer.broadcastAlert('warning', 'Error processing visitor event. Please check the data format.', {
      error: error.message,
      receivedData: req.body
    });
    
    res.status(500).json({
      status: "error",
      message: "Internal server error processing event"
    });
  }
});

app.get("/api/analytics/summary", (req, res) => {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    
    const recentEvents = store.visitorEvents.filter(event => 
      new Date(event.timestamp) > tenMinutesAgo
    );

    const summary = {
      totalVisitors: store.sessions.size,
      activeSessions: store.activeSessions.size,
      recentEvents: recentEvents.length,
      topCountries: getTopCountries(),
      topPages: getTopPages(),
      eventsLast10Minutes: recentEvents.length
    };

    res.status(200).json({
      status: "success",
      data: summary
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    wsServer.broadcastAlert('warning', 'Error fetching analytics summary. Please try again.', {
      error: error.message
    });
    
    res.status(500).json({
      status: "error",
      message: "Internal server error fetching analytics"
    });
  }
});

app.get("/api/analytics/sessions", (req, res) => {
  try {
    const activeSessionsList = Array.from(store.activeSessions.values()).map(session => {
      // Calculate dynamic duration for active sessions
      const now = new Date();
      const duration = Math.floor((now - new Date(session.startTime)) / 1000);
      
  
      
      return {
        id: session.id,
        country: session.country,
        startTime: session.startTime,
        lastActivity: session.lastActivity,
        journeyLength: session.journey.length,
        journey: session.journey, // Array of page paths
        currentPage: session.currentPage,
        duration: duration,
        isActive: session.isActive,
        metadata: session.metadata
      };
    });

    res.status(200).json({
      status: "success",
      data: activeSessionsList
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    wsServer.broadcastAlert('warning', 'Error fetching active sessions. Please try again.', {
      error: error.message
    });
    
    res.status(500).json({
      status: "error",
      message: "Internal server error fetching sessions"
    });
  }
});

// Clear Analytics
app.post("/api/analytics/clear", (req, res) => {
  try {
    // Clear analytics data but keep visitor events
    store.sessions.clear();
    store.activeSessions.clear();
    store.pageVisits.clear();
    
    // Broadcast analytics cleared to all dashboards
    wsServer.broadcastToAll({
      type: 'analytics_cleared',
      totalDashboards: store.connectedDashboards.size
    });

    console.log('Analytics cleared from data store');
    
    res.status(200).json({
      status: "success",
      message: "Analytics cleared successfully"
    });
  } catch (error) {
    console.error('Error clearing analytics:', error);
    wsServer.broadcastAlert('warning', 'Error clearing analytics. Please try again.', {
      error: error.message
    });
    
    res.status(500).json({
      status: "error",
      message: "Internal server error clearing analytics"
    });
  }
});

// Helper functions
function getTopCountries() {
  const countryCount = {};
  store.visitorEvents.forEach(event => {
    countryCount[event.country] = (countryCount[event.country] || 0) + 1;
  });
  
  return Object.entries(countryCount)
    .sort(([,a], [,b]) => b - a)    // Sort by count in descending order
    .slice(0, 5)                  // Get top 5 countries
    .map(([country, count]) => ({ country, count }));   // Turn back into array of objects
}

function getTopPages() {
  return Array.from(store.pageVisits.entries())
    .sort(([,a], [,b]) => b - a)    
    .slice(0, 10)                  // Get top 10 pages
    .map(([page, count]) => ({ page, count }));   
}
