# Real-Time Visitor Analytics System

A comprehensive real-time visitor analytics dashboard with WebSocket communication, built with Node.js, Express, and React.

## Features

### 🚀 Core Features
- **Real-time WebSocket Communication** - Live updates across multiple dashboard instances
- **Visitor Event Tracking** - Track pageviews, session data, and visitor metadata
- **Live Analytics Dashboard** - Real-time statistics and visitor feed
- **Session Management** - Track active sessions and visitor journeys
- **Interactive Filtering** - Filter events by country and page
- **Auto-reconnection** - Handles WebSocket disconnections gracefully

### 📊 Dashboard Components
- **Live Visitor Feed** - Real-time stream of visitor events
- **Analytics Summary** - Key metrics and statistics
- **Active Sessions** - List of current visitor sessions
- **Session Journey** - Detailed visitor path tracking
- **Visitor Chart** - 10-minute activity visualization
- **Connection Status** - WebSocket connection monitoring

### 🔧 Technical Features
- **REST API Endpoints** - `/api/events`, `/api/analytics/summary`, `/api/analytics/sessions`
- **WebSocket Events** - Real-time bidirectional communication
- **Session Tracking** - Complete visitor journey management
- **Sound Notifications** - Audio alerts for new visitors
- **Responsive Design** - Works on desktop and mobile devices

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   cd client && npm install
   cd ..
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open the dashboard:**
   - Navigate to `http://localhost:3000`
   - The dashboard will automatically connect to the WebSocket server

### Testing the System

#### Method 1: Using the Test Script
```bash
# In a new terminal, run the test script
node test-events.js
```

#### Method 2: Using Postman/curl
```bash
# Send a visitor event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pageview",
    "country": "India",
    "metadata": {
      "device": "mobile",
      "page": "/products",
      "referrer": "google.com"
    }
  }'
```

#### Method 3: Multiple Dashboard Testing
1. Open multiple browser tabs to `http://localhost:3000`
2. Each tab represents a separate dashboard instance
3. Send events and watch real-time updates across all tabs

## API Reference

### REST Endpoints

#### POST `/api/events`
Receives visitor events from websites.

**Request Body:**
```json
{
  "type": "pageview", // "pageview" or "session_end"
  "country": "India",
  "metadata": {
    "device": "mobile",
    "page": "/products",
    "referrer": "google.com",
    "sessionId": "optional-session-id"
  }
}
```

#### GET `/api/analytics/summary`
Returns current analytics statistics.

**Response:**
```json
{
  "status": "success",
  "data": {
    "totalVisitors": 25,
    "activeSessions": 8,
    "recentEvents": 15,
    "topCountries": [...],
    "topPages": [...],
    "eventsLast10Minutes": 15
  }
}
```

#### GET `/api/analytics/sessions`
Returns active sessions with their journey data.

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "session-123",
      "country": "India",
      "startTime": "2025-01-20T10:30:00Z",
      "lastActivity": "2025-01-20T10:35:00Z",
      "journeyLength": 5,
      "metadata": {...}
    }
  ]
}
```

### WebSocket Events

#### Server → Client Events

**visitor_update**
```json
{
  "type": "visitor_update",
  "totalDashboards": 3,
  "connectedAt": "2025-01-20T10:30:00Z",
  "event": {
    "id": "event-123",
    "type": "pageview",
    "country": "India",
    "timestamp": "2025-01-20T10:30:00Z",
    "metadata": {...}
  }
}
```

**dashboard_connected/dashboard_disconnected**
```json
{
  "type": "dashboard_connected",
  "totalDashboards": 3
}
```

#### Client → Server Events

**filter_events**
```json
{
  "type": "filter_events",
  "country": "India",
  "page": "/products"
}
```

## Project Structure

```
├── index.js              # Main server with REST API and WebSocket
├── client/               # React dashboard application
│   ├── src/
│   │   ├── App.jsx      # Main dashboard component
│   │   └── App.css      # Dashboard styles
│   └── index.html       # Dashboard entry point
├── test-events.js       # Test script for simulating events
├── package.json         # Server dependencies
└── README.md           # This file
```

## Features in Detail

### Real-Time Updates
- WebSocket connection provides instant updates
- Multiple dashboard instances stay synchronized
- Auto-reconnection handles network issues

### Session Tracking
- Each visitor gets a unique session ID
- Tracks complete journey through the website
- Shows active sessions with last activity time

### Analytics Dashboard
- Live visitor feed with newest events first
- 10-minute activity chart
- Key metrics: total visitors, active sessions, recent events
- Top countries and pages statistics

### Interactive Features
- Filter events by country and page
- Click on sessions to view detailed journey
- Clear statistics button
- Sound notifications for new visitors

### Connection Management
- Visual connection status indicator
- Shows number of connected dashboards
- Handles disconnections and reconnections

## Testing Scenarios

### Basic Functionality
1. Start the server: `npm run dev`
2. Open dashboard: `http://localhost:3000`
3. Run test script: `node test-events.js`
4. Watch real-time updates in the dashboard

### Multiple Dashboards
1. Open multiple browser tabs to the dashboard
2. Verify connection count updates
3. Send events and verify all dashboards receive updates

### WebSocket Testing
1. Open browser DevTools → Network → WS
2. Monitor WebSocket messages
3. Test disconnection/reconnection

### Filter Testing
1. Enter country or page filters
2. Apply filters and verify filtered events
3. Test clearing filters

## Troubleshooting

### Common Issues

**Dashboard not connecting:**
- Ensure server is running on port 3000
- Check browser console for WebSocket errors
- Verify no firewall blocking localhost:3000

**No real-time updates:**
- Check WebSocket connection status
- Verify test script is running
- Check server console for errors

**Events not appearing:**
- Verify event format matches API specification
- Check server logs for validation errors
- Ensure proper Content-Type headers

## Development

### Adding New Features
1. Backend: Add new endpoints in `index.js`
2. Frontend: Update React components in `client/src/App.jsx`
3. Styling: Modify `client/src/App.css`

### Extending Analytics
- Add new metrics to `/api/analytics/summary`
- Create new WebSocket event types
- Implement additional filtering options

## License

This project is created for the Mindcraft Labs API Developer Intern assessment. 