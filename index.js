const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const app = express();

// Parse JSON
app.use(express.json());

const server = app.listen(3000, () => {
  console.log("HTTP server running on http://localhost:3000");
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.resolve("./client/index.html"));
});

// REST API ------------------->
app.post("/api/events", (req, res) => {
  console.log(`response revceived: ${req.body}`);
  res.status(201).json({
    status: "success",
    received: req.body,
  });
});

app.get("/api/analytics/summary", (req, res) => {
  res.status(200).json({
    status: "success",
    data: "true",
  });
});

app.get("/api/analytics/sessions", (req, res) => {
  res.status(200).json({
    status: "success",
    data: "true",
  });
});

const wss = new WebSocket.Server({ server }); // use HTTP server here

const u = {
  type: "pageview", // "pageview", "click" or "session_end"
  page: "/products",
  sessionId: "user-123",
  timestamp: "2025-07-19T10:30:00Z",

  country: "India",
  metadata: {
    // Optional extra data
    device: "mobile",
    referrer: "google.com",
  },
};
