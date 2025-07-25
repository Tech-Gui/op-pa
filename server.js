const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const database = require("./database");
const waterRoutes = require("./routes/water");
const soilmoistureRoutes = require("./routes/soilMoisture");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize database
database.init();

// Routes
app.use("/api/water", waterRoutes);
app.use("/api/soil", soilmoistureRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Smart Farming Backend",
  });
});

// Default route
app.get("/", (req, res) => {
  res.json({
    message: "Smart Farming Backend API",
    endpoints: [
      "GET /health - Health check",
      "POST /api/water/reading - Submit water level reading",
      "GET /api/water/readings - Get all readings",
      "GET /api/water/latest - Get latest reading",
      "POST /api/water/relay - Control relay (future use)",
    ],
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// app.listen(PORT, () => {
//   console.log(`Smart Farming Backend running on port ${PORT}`);
//   console.log(`Health check: http://localhost:${PORT}/health`);
// });

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
