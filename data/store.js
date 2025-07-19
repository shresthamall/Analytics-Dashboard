// Global memory store (for now)
const sessions = new Map(); // sessionId -> journey
const pageVisits = new Map(); // page -> count
const connectedDashboards = new Set(); // ws clients
