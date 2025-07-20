import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [wsStatus, setWsStatus] = useState('Disconnected')
  const [connectedDashboards, setConnectedDashboards] = useState(0)
  const [visitorEvents, setVisitorEvents] = useState([])
  const [filteredEvents, setFilteredEvents] = useState([])
  const [isFiltered, setIsFiltered] = useState(false)
  const [activeSessions, setActiveSessions] = useState([])
  const [analytics, setAnalytics] = useState({})
  const [filters, setFilters] = useState({ country: '', page: '' })
  const [selectedSession, setSelectedSession] = useState(null)
  const [visitorChart, setVisitorChart] = useState([])
  
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  // WebSocket connection
  useEffect(() => {
    connectWebSocket()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  const connectWebSocket = () => {
    setWsStatus('Connecting...')
    
    const ws = new WebSocket('ws://localhost:3000')
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus('Connected')
      console.log('WebSocket connected successfully')
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'visitor_update':
          if (data.data && data.data.event) {
            setVisitorEvents(prev => [data.data.event, ...prev.slice(0, 99)])
            playNotification()
            updateVisitorChart()
          }
          break
        case 'user_connected':
          setConnectedDashboards(data.data.totalDashboards)
          console.log('New dashboard connected:', data.data)
          break
        case 'user_disconnected':
          setConnectedDashboards(data.data.totalDashboards)
          console.log('Dashboard disconnected:', data.data)
          break
        case 'session_activity':
          handleSessionActivity(data.data)
          break
        case 'alert':
          handleAlert(data.data)
          break
        case 'existing_events':
          // Load existing events when connecting
          setVisitorEvents(data.events)
          setTimeout(() => updateVisitorChart(), 100) // Small delay to ensure state is updated
          break
        case 'analytics_cleared':
          // Clear analytics when analytics are cleared from server
          setAnalytics({
            totalVisitors: 0,
            activeSessions: 0,
            recentEvents: 0,
            eventsLast10Minutes: 0
          })
          setActiveSessions([])
          setSelectedSession(null)
          updateVisitorChart()
          break
        case 'filtered_events':
          setFilteredEvents(data.events)
          setIsFiltered(true)
          // Update chart with filtered events
          setTimeout(() => updateVisitorChart(), 100)
          break
        case 'filters_removed':
          setFilteredEvents([])
          setIsFiltered(false)
          // Update chart with all events
          setTimeout(() => updateVisitorChart(), 100)
          break
      }
    }

    ws.onclose = () => {
      setWsStatus('Disconnected')
      console.log('WebSocket disconnected')
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setWsStatus('Error')
    }
  }

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [summaryRes, sessionsRes] = await Promise.all([
          fetch('/api/analytics/summary'),
          fetch('/api/analytics/sessions')
        ])
        
        const summary = await summaryRes.json()
        const sessions = await sessionsRes.json()
        
        setAnalytics(summary.data)
        setActiveSessions(sessions.data)
      } catch (error) {
        console.error('Error fetching analytics:', error)
      }
    }

    fetchAnalytics()
    const interval = setInterval(fetchAnalytics, 5000) // Refresh every 5 seconds
    
    return () => clearInterval(interval)
  }, [])

  // Update chart when visitor events change
  useEffect(() => {
    if (visitorEvents.length > 0) {
      updateVisitorChart()
    }
  }, [visitorEvents])

  // Dynamic chart updates every 5 seconds
  useEffect(() => {
    const chartInterval = setInterval(() => {
      updateVisitorChart()
    }, 5000) // Update every 5 seconds

    return () => clearInterval(chartInterval)
  }, [visitorEvents, filteredEvents, isFiltered]) // Re-run when events or filter state changes

  // Update duration counters in real-time
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSessions(prev => 
        prev.map(session => ({
          ...session,
          duration: Math.floor((new Date() - new Date(session.startTime)) / 1000)
        }))
      )
      
      // Also update selected session duration
      if (selectedSession) {
        setSelectedSession(prev => ({
          ...prev,
          duration: Math.floor((new Date() - new Date(prev.startTime)) / 1000)
        }))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [selectedSession])

  // Update visitor chart data
  const updateVisitorChart = () => {
    const now = new Date()
    
    // Use filtered events if available, otherwise use all events
    const eventsToUse = isFiltered ? filteredEvents : visitorEvents
    
    // Create dynamic timeline based on real-world time
    const chartData = []
    for (let i = 0; i < 10; i++) {
      // Calculate time slots based on real-world time progression
      // i=0 is the most recent completed minute, i=9 is 9 minutes ago
      const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
      
      // For the most recent minute (i=0), we want the previous minute's data
      // For older minutes, we go back further
      const targetMinute = new Date(currentMinute.getTime() - (i + 1) * 60 * 1000)
      const timeSlotStart = new Date(targetMinute.getFullYear(), targetMinute.getMonth(), targetMinute.getDate(), targetMinute.getHours(), targetMinute.getMinutes())
      const timeSlotEnd = new Date(timeSlotStart.getTime() + 60 * 1000)
      
      // Filter events for this specific minute
      const minuteEvents = eventsToUse.filter(event => {
        const eventTime = new Date(event.timestamp)
        return eventTime >= timeSlotStart && eventTime < timeSlotEnd
      })
      
      // Count unique visitors (sessionIds) instead of total events
      const uniqueVisitors = new Set(minuteEvents.map(event => event.sessionId))
      
      chartData.push({
        time: timeSlotStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        count: uniqueVisitors.size,
        startTime: timeSlotStart,
        endTime: timeSlotEnd
      })
    }
    
    // Reverse the array so most recent minute (index 0) appears at the bottom
    setVisitorChart(chartData.reverse())
  }

  // Play notification sound
  const playNotification = () => {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.1)
  }

  // Filter events
  const handleFilter = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Send filter by country if specified
      if (filters.country) {
        wsRef.current.send(JSON.stringify({
          type: 'track_dashboard_action',
          action: 'filter_applied',
          details: {
            filterType: 'country',
            value: filters.country
          }
        }))
      }
      
      // Send filter by page if specified
      if (filters.page) {
        wsRef.current.send(JSON.stringify({
          type: 'track_dashboard_action',
          action: 'filter_applied',
          details: {
            filterType: 'page',
            value: filters.page
          }
        }))
      }
    }
  }

  // Remove filters
  const removeFilters = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'track_dashboard_action',
        action: 'remove_filters',
        details: {}
      }))
    }
    
    setFilteredEvents([])
    setIsFiltered(false)
    setFilters({ country: '', page: '' })
    updateVisitorChart()
  }

  // Clear analytics (not visitor feed)
  const clearStats = async () => {
    try {
      const response = await fetch('/api/analytics/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('Analytics cleared successfully');
      } else {
        console.error('Failed to clear analytics');
      }
    } catch (error) {
      console.error('Error clearing analytics:', error);
    }
  }

  // Handle session activity updates from WebSocket
  const handleSessionActivity = (sessionData) => {
    setActiveSessions(prev => {
      const sessionIndex = prev.findIndex(s => s.id === sessionData.sessionId)
      if (sessionIndex !== -1) {
        const updatedSessions = [...prev]
        updatedSessions[sessionIndex] = {
          ...updatedSessions[sessionIndex],
          currentPage: sessionData.currentPage,
          journey: sessionData.journey,
          duration: sessionData.duration
        }
        return updatedSessions
      }
      return prev
    })
    
    // Update selected session if it's the one being updated
    if (selectedSession && selectedSession.id === sessionData.sessionId) {
      setSelectedSession(prev => ({
        ...prev,
        currentPage: sessionData.currentPage,
        journey: sessionData.journey,
        duration: sessionData.duration
      }))
    }
  }

  // Handle alerts from WebSocket
  const handleAlert = (alertData) => {
    console.log('Alert received:', alertData)
    
    // Create alert notification (you could use a toast library or custom component)
    const alertMessage = `${alertData.level.toUpperCase()}: ${alertData.message}`
    alert(alertMessage) // Simple alert for now, could be enhanced with a proper toast
  }

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Real-Time Visitor Analytics</h1>
        <div className="connection-status">
          <span className={`status ${wsStatus.toLowerCase()}`}>
            {wsStatus}
          </span>
          <span className="dashboards-count">
            {connectedDashboards} dashboard{connectedDashboards !== 1 ? 's' : ''} connected
          </span>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="left-panel">
          {/* Live Visitor Feed */}
          <section className="visitor-feed">
            <h2>Live Visitor Feed {isFiltered && '(Filtered)'}</h2>
            <div className="feed-container">
              {(isFiltered ? filteredEvents : visitorEvents).length === 0 ? (
                <div className="feed-item">
                  <div className="event-type">Waiting for events...</div>
                  <div className="event-country">Connect to see real-time updates</div>
                </div>
              ) : (
                (isFiltered ? filteredEvents : visitorEvents).map((event, index) => (
                  <div key={event.id || index} className="feed-item">
                    <div className="event-type">{event.type}</div>
                    <div className="event-country">{event.country}</div>
                    <div className="event-time">{formatTime(event.timestamp)}</div>
                    {event.metadata?.device && (
                      <div className="event-device">{event.metadata.device}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Visitor Chart */}
          <section className="visitor-chart">
            <h2>Visitors (Last 10 Minutes - Live)</h2>
            <div className="chart-container">
              {visitorChart.length === 0 || visitorChart.every(data => data.count === 0) ? (
                <div className="chart-empty">
                  <div className="empty-text">No recent activity</div>
                  <div className="empty-subtext">Events will appear here as they occur</div>
                </div>
              ) : (
                <>
                  <div className="chart-bars">
                    {visitorChart.map((data, index) => {
                      const maxCount = Math.max(...visitorChart.map(d => d.count), 1);
                      const barWidth = Math.max((data.count / maxCount) * 200, 5);
                      
                      return (
                        <div key={index} className="chart-bar">
                          <span className="bar-label">{data.time}</span>
                          <div 
                            className="bar" 
                            style={{ 
                              width: `${barWidth}px`,
                              backgroundColor: data.count > 0 ? '#3498db' : '#ecf0f1'
                            }}
                          >
                            {data.count > 0 && (
                              <span className="bar-value">{data.count}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-legend">
                    <div className="legend-item">
                      <span className="legend-color" style={{backgroundColor: '#3498db'}}></span>
                      <span>Visitors per minute (completed)</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="right-panel">
          {/* Analytics Summary */}
          <section className="analytics-summary">
            <h2>Analytics Summary</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{analytics.totalVisitors || 0}</div>
                <div className="stat-label">Total Visitors</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{analytics.activeSessions || 0}</div>
                <div className="stat-label">Active Sessions</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{analytics.eventsLast10Minutes || 0}</div>
                <div className="stat-label">Events (10min)</div>
              </div>
            </div>
          </section>

          {/* Active Sessions */}
          <section className="active-sessions">
            <h2>Active Sessions</h2>
            <div className="sessions-container">
              {activeSessions.length === 0 ? (
                <div className="session-item">
                  <div className="session-country">No active sessions</div>
                </div>
              ) : (
                activeSessions.map((session) => (
                  <div 
                    key={session.id} 
                    className={`session-item ${selectedSession?.id === session.id ? 'selected' : ''}`}
                    onClick={() => {
                      // If clicking on the same session, deselect it
                      if (selectedSession && selectedSession.id === session.id) {
                        setSelectedSession(null);
                      } else {
                        // Select the new session
                        setSelectedSession(session);
                      }
                    }}
                  >
                    <div className="session-country">{session.country}</div>
                    <div className="session-current-page">Current: {session.currentPage}</div>
                    <div className="session-journey-length">{session.journeyLength} pages</div>
                    <div className="session-time">{formatTime(session.lastActivity)}</div>
                    <div className="session-duration">
                      Duration: <span className="duration-counter">{session.duration}</span>s
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Session Details */}
          {selectedSession && (
            <section className="session-details">
              <h2>Session Journey</h2>
              <div className="journey-container">
                {selectedSession.journey && selectedSession.journey.length > 0 ? (
                  selectedSession.journey.map((page, index) => (
                    <div key={index} className="journey-step">
                      <div className="step-page">{page}</div>
                      <div className="step-number">Step {index + 1}</div>
                    </div>
                  ))
                ) : (
                  <div className="journey-step">No journey data available</div>
                )}
              </div>
              {selectedSession.duration && (
                <div className="session-duration">
                  <strong>Duration:</strong> <span className="duration-counter">{selectedSession.duration}</span> seconds
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="dashboard-controls">
        <div className="filters">
          <input
            type="text"
            placeholder="Filter by country"
            value={filters.country}
            onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Filter by page"
            value={filters.page}
            onChange={(e) => setFilters(prev => ({ ...prev, page: e.target.value }))}
          />
          <button onClick={handleFilter}>Apply Filter</button>
          <button 
            onClick={removeFilters} 
            disabled={!isFiltered}
            style={{ 
              opacity: isFiltered ? 1 : 0.5,
              cursor: isFiltered ? 'pointer' : 'not-allowed'
            }}
          >
            Remove Filters
          </button>
        </div>
        <button onClick={clearStats} className="clear-btn">Clear Statistics</button>
      </div>
    </div>
  )
}

export default App
