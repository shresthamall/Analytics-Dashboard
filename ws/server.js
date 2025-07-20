const WebSocket = require('ws');
const store = require('../data/store');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });    // Create WebSocket server
    this.setupEventHandlers();
    console.log('WebSocket server ready');
  }

  setupEventHandlers() {
    this.wss.on('connection', (ws) => {
      this.handleNewConnection(ws);
    });
  }

  handleNewConnection(ws) {
    console.log('New dashboard connected');
    store.connectedDashboards.add(ws);

    // Send existing visitor events to populate the feed
    this.sendExistingEvents(ws);

    // Send initial dashboard count to the new dashboard
    console.log('WebSocket readyState:', ws.readyState, 'Total dashboards:', store.connectedDashboards.size);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'user_connected',
        data: {
          totalDashboards: store.connectedDashboards.size,
          connectedAt: new Date().toISOString()
        }
      }));
      console.log('Sent user_connected to new dashboard with count:', store.connectedDashboards.size);
    } else {
      // If WebSocket is not ready, wait a bit and try again
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'user_connected',
            data: {
              totalDashboards: store.connectedDashboards.size,
              connectedAt: new Date().toISOString()
            }
          }));
          console.log('Sent user_connected to new dashboard (delayed) with count:', store.connectedDashboards.size);
        } else {
          console.log('WebSocket still not ready after delay, readyState:', ws.readyState);
        }
      }, 100);
    }

    // Then broadcast to all other dashboards
    this.broadcastToOthers(ws, {
      type: 'user_connected',
      data: {
        totalDashboards: store.connectedDashboards.size,
        connectedAt: new Date().toISOString()
      }
    });

    ws.on('message', (message) => {
      this.handleMessage(ws, message);
    });

    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      store.connectedDashboards.delete(ws);
      
      // Broadcast user_disconnected event to remaining dashboards
      this.broadcastToAll({
        type: 'user_disconnected',
        data: {
          totalDashboards: store.connectedDashboards.size
        }
      });
    });
  }

  sendExistingEvents(ws) {
    // Send last 50 visitor events to populate the feed
    const recentEvents = store.visitorEvents.slice(-50);
    
    if (recentEvents.length > 0) {
      ws.send(JSON.stringify({
        type: 'existing_events',
        events: recentEvents
      }));
    }
  }

  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'request_detailed_stats':
          this.handleDetailedStatsRequest(ws, data);
          break;
        case 'track_dashboard_action':
          this.handleDashboardAction(ws, data);
          break;
        case 'filter_events':
          this.handleFilterRequest(ws, data);
          break;
        default:
          this.broadcastAlert('warning', `Unknown message type: ${data.type}`, {
            unknownType: data.type,
            receivedData: data
          });
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      this.broadcastAlert('warning', 'Error processing WebSocket message. Invalid JSON format.', {
        error: error.message,
        rawMessage: message.toString()
      });
    }
  }

  handleDetailedStatsRequest(ws, data) {
    try {
      // Get available countries and pages from existing events
      const availableCountries = [...new Set(store.visitorEvents.map(event => event.country))];
      const availablePages = [...new Set(store.visitorEvents.map(event => event.metadata?.page).filter(Boolean))];
      
      // Validate country filter
      if (data.filter?.country && !availableCountries.includes(data.filter.country)) {
        this.broadcastAlert('warning', `Invalid country filter: "${data.filter.country}". Available countries: ${availableCountries.join(', ')}`, {
          invalidFilter: 'country',
          providedValue: data.filter.country,
          availableValues: availableCountries
        });
        return;
      }
      
      // Validate page filter
      if (data.filter?.page && !availablePages.includes(data.filter.page)) {
        this.broadcastAlert('warning', `Invalid page filter: "${data.filter.page}". Available pages: ${availablePages.join(', ')}`, {
          invalidFilter: 'page',
          providedValue: data.filter.page,
          availableValues: availablePages
        });
        return;
      }
      
      // Apply filters
      const filteredEvents = store.visitorEvents.filter(event => {
        if (data.filter?.country && event.country !== data.filter.country) return false;
        if (data.filter?.page && event.metadata?.page !== data.filter.page) return false;
        return true;
      });
      
      ws.send(JSON.stringify({
        type: 'detailed_stats',
        data: {
          events: filteredEvents.slice(-50),
          totalEvents: filteredEvents.length,
          filter: data.filter
        }
      }));
      
    } catch (error) {
      console.error('Error handling detailed stats request:', error);
      this.broadcastAlert('warning', 'Error processing detailed stats request. Please try again.', {
        error: error.message,
        requestData: data
      });
    }
  }

  handleDashboardAction(ws, data) {
    // Track dashboard user actions
    console.log(`Dashboard action: ${data.action}`, data.details);
    
    // Handle filter_applied action
    if (data.action === 'filter_applied') {
      this.handleFilterApplied(ws, data.details);
      return;
    }
    
    // Handle remove_filters action
    if (data.action === 'remove_filters') {
      this.handleRemoveFilters(ws);
      return;
    }
    
    // Could store dashboard actions for analytics
    // For now, just acknowledge
    ws.send(JSON.stringify({
      type: 'action_tracked',
      data: {
        action: data.action,
        timestamp: new Date().toISOString()
      }
    }));
  }

  handleFilterApplied(ws, filterDetails) {
    try {
      const { filterType, value } = filterDetails;
      
      // Get available countries and pages from existing events
      const availableCountries = [...new Set(store.visitorEvents.map(event => event.country))];
      const availablePages = [...new Set(store.visitorEvents.map(event => event.metadata?.page).filter(Boolean))];
      
      let filteredEvents = [];
      let isValidFilter = true;
      let errorMessage = '';
      
      // Apply filter based on type
      if (filterType === 'country') {
        // Validate country filter
        if (!availableCountries.includes(value)) {
          isValidFilter = false;
          errorMessage = `Invalid country filter: "${value}". Available countries: ${availableCountries.join(', ')}`;
        } else {
          filteredEvents = store.visitorEvents.filter(event => event.country === value);
        }
      } else if (filterType === 'page') {
        // Validate page filter
        if (!availablePages.includes(value)) {
          isValidFilter = false;
          errorMessage = `Invalid page filter: "${value}". Available pages: ${availablePages.join(', ')}`;
        } else {
          filteredEvents = store.visitorEvents.filter(event => event.metadata?.page === value);
        }
      } else {
        isValidFilter = false;
        errorMessage = `Invalid filter type: "${filterType}". Supported types: country, page`;
      }
      
      if (!isValidFilter) {
        this.broadcastAlert('warning', errorMessage, {
          invalidFilter: filterType,
          providedValue: value,
          availableValues: filterType === 'country' ? availableCountries : availablePages
        });
        return;
      }
      
      // Broadcast filtered results to all dashboards
      this.broadcastToAll({
        type: 'filtered_events',
        events: filteredEvents.slice(-50), // Send last 50 filtered events
        filter: {
          type: filterType,
          value: value,
          totalFound: filteredEvents.length
        }
      });
      
      // Send success alert
      this.broadcastAlert('info', `Filter applied: ${filterType} = "${value}". Found ${filteredEvents.length} events.`, {
        appliedFilter: { type: filterType, value: value },
        filteredCount: filteredEvents.length,
        totalEvents: store.visitorEvents.length
      });
      
    } catch (error) {
      console.error('Error handling filter applied:', error);
      this.broadcastAlert('warning', 'Error processing filter. Please try again.', {
        error: error.message,
        filterDetails: filterDetails
      });
    }
  }

  handleRemoveFilters(ws) {
    try {
      // Broadcast to all dashboards that filters have been removed
      this.broadcastToAll({
        type: 'filters_removed',
        message: 'All filters have been removed'
      });
      
      // Send success alert
      this.broadcastAlert('info', 'All filters have been removed. Showing all events.', {
        action: 'remove_filters',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error handling remove filters:', error);
      this.broadcastAlert('warning', 'Error removing filters. Please try again.', {
        error: error.message
      });
    }
  }

  handleFilterRequest(ws, data) {
    try {
      // Get available countries and pages from existing events
      const availableCountries = [...new Set(store.visitorEvents.map(event => event.country))];
      const availablePages = [...new Set(store.visitorEvents.map(event => event.metadata?.page).filter(Boolean))];
      
      // Validate country filter
      if (data.country && !availableCountries.includes(data.country)) {
        this.broadcastAlert('warning', `Invalid country filter: "${data.country}". Available countries: ${availableCountries.join(', ')}`, {
          invalidFilter: 'country',
          providedValue: data.country,
          availableValues: availableCountries
        });
        return;
      }
      
      // Validate page filter
      if (data.page && !availablePages.includes(data.page)) {
        this.broadcastAlert('warning', `Invalid page filter: "${data.page}". Available pages: ${availablePages.join(', ')}`, {
          invalidFilter: 'page',
          providedValue: data.page,
          availableValues: availablePages
        });
        return;
      }
      
      // Apply filters
      const filteredEvents = store.visitorEvents.filter(event => {
        if (data.country && event.country !== data.country) return false;
        if (data.page && event.metadata?.page !== data.page) return false;
        return true;
      });
      
      // Send filtered results
      ws.send(JSON.stringify({
        type: 'filtered_events',
        events: filteredEvents.slice(-50) // Send last 50 filtered events
      }));
      
      // Send success alert if filters were applied
      if (data.country || data.page) {
        const filterMessage = [];
        if (data.country) filterMessage.push(`country: ${data.country}`);
        if (data.page) filterMessage.push(`page: ${data.page}`);
        
        this.broadcastAlert('info', `Filter applied: ${filterMessage.join(', ')}. Found ${filteredEvents.length} events.`, {
          appliedFilters: { country: data.country, page: data.page },
          filteredCount: filteredEvents.length,
          totalEvents: store.visitorEvents.length
        });
      }
      
    } catch (error) {
      console.error('Error handling filter request:', error);
      this.broadcastAlert('warning', 'Error processing filter request. Please try again.', {
        error: error.message,
        requestData: data
      });
    }
  }

  handleDisconnection(ws) {
    console.log('Dashboard disconnected');
    store.connectedDashboards.delete(ws);
    
    // Broadcast user_disconnected event to remaining dashboards
    this.broadcastToAll({
      type: 'user_disconnected',
      data: {
        totalDashboards: store.connectedDashboards.size
      }
    });
  }

  broadcastToAll(message) {
    store.connectedDashboards.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  broadcastToOthers(excludeWs, message) {
    store.connectedDashboards.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  broadcastVisitorUpdate(event) {
    // Get current stats
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEvents = store.visitorEvents.filter(e => new Date(e.timestamp) >= today);
    
    // Count pages visited
    const pagesVisited = {};
    store.visitorEvents.forEach(e => {
      const page = e.metadata?.page || '/';
      pagesVisited[page] = (pagesVisited[page] || 0) + 1;
    });

    const updateMessage = {
      type: 'visitor_update',
      data: {
        event: event,
        stats: {
          totalActive: store.activeSessions.size,
          totalToday: todayEvents.length,
          pagesVisited: pagesVisited
        }
      }
    };

    this.broadcastToAll(updateMessage);
  }

  broadcastSessionActivity(sessionData) {
    const sessionActivityMessage = {
      type: 'session_activity',
      data: {
        sessionId: sessionData.sessionId,
        currentPage: sessionData.currentPage,
        journey: sessionData.journey,
        duration: sessionData.duration
      }
    };

    this.broadcastToAll(sessionActivityMessage);
  }

  broadcastAlert(level, message, details = {}) {
    const alertMessage = {
      type: 'alert',
      data: {
        level: level, // "info", "warning", "milestone"
        message: message,
        details: details
      }
    };

    this.broadcastToAll(alertMessage);
  }
}

module.exports = WebSocketServer;
