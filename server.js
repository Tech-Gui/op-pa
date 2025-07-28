const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const database = require("./database");
const waterRoutes = require("./routes/water");
const soilmoistureRoutes = require("./routes/soilMoisture");
const aiRoutes = require("./routes/ai"); // Add this line
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" })); // Increased for image uploads
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Initialize database
database.init();

// Routes
app.use("/api/water", waterRoutes);
app.use("/api/soil", soilmoistureRoutes);
app.use("/api/ai", aiRoutes); // Add AI routes

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Smart Farming Backend",
    aiEnabled: !!process.env.OPENAI_API_KEY,
  });
});

// Default route
app.get("/", (req, res) => {
  res.json({
    message: "Smart Farming Backend API with AI",
    endpoints: [
      "GET /health - Health check",
      "POST /api/water/reading - Submit water level reading",
      "GET /api/water/readings - Get all readings",
      "GET /api/water/latest - Get latest reading",
      "POST /api/water/relay - Control relay",
      "POST /api/ai/plant-health - Analyze plant health from image",
      "POST /api/ai/pest-identification - Identify pests from image",
      "POST /api/ai/crop-advice - Get crop management advice",
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(
    `AI Integration: ${
      process.env.OPENAI_API_KEY
        ? "✅ Enabled"
        : "❌ Disabled (Add OPENAI_API_KEY to .env)"
    }`
  );
});

module.exports = app;
