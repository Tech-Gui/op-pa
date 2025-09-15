const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const database = require("./database");
const waterRoutes = require("./routes/water");
const soilmoistureRoutes = require("./routes/soilMoisture");
const aiRoutes = require("./routes/ai");
const videoAnalysisRoutes = require("./routes/video-analysis"); // Add video analysis routes
const environmentalRoutes = require("./routes/environmental");
const sensorsRoutes = require("./routes/sensors");
const machineRoutes = require("./routes/machines");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Ensure required directories exist for video analysis
const ensureDirectoriesExist = () => {
  const directories = [
    "uploads",
    "uploads/frames",
    "uploads/weekly-logs",
    "data",
    "logs",
  ];

  directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
};

// Initialize directories
ensureDirectoriesExist();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000", // Create React App
      "http://localhost:5173", // Vite
      "http://localhost:5174", // Vite
      "http://127.0.0.1:5173", // Alternative localhost
      "https://opptapp.onrender.com",
      "https://dataportal-2l83.onrender.com",
      process.env.FRONTEND_URL || "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(bodyParser.json({ limit: "50mb" })); // Increased for image uploads
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files for uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Initialize database
database.init();

const { startMachineSweeper } = require("./services/machineSweeper");
startMachineSweeper();
// Routes
app.use("/api/water", waterRoutes);
app.use("/api/soil", soilmoistureRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/video", videoAnalysisRoutes); // Add video analysis routes
app.use("/api/environmental", environmentalRoutes);
app.use("/api/sensors", sensorsRoutes);
app.use("/api/machines", machineRoutes);
// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Smart Farming Backend with AI Security",
    aiEnabled: !!process.env.OPENAI_API_KEY,
    services: {
      water: "Water management system",
      soil: "Soil moisture monitoring",
      plantHealth: "AI plant health analysis",
      pestDetection: "AI pest identification",
      videoAnalysis: "Real-time video security analysis",
      weeklyLogs: "Weekly plant logging system",
    },
    directories: {
      uploads: fs.existsSync("uploads"),
      frames: fs.existsSync("uploads/frames"),
      logs: fs.existsSync("logs"),
    },
  });
});

// Default route
app.get("/", (req, res) => {
  res.json({
    message: "Smart Farming Backend API with AI & Video Security",
    version: "2.0.0",
    endpoints: [
      "GET /health - Health check",
      "GET /api/health - Detailed system health",

      // Water Management
      "POST /api/water/reading - Submit water level reading",
      "GET /api/water/readings - Get all readings",
      "GET /api/water/latest - Get latest reading",
      "POST /api/water/relay - Control relay",

      // Soil Management
      "GET /api/soil/* - Soil moisture endpoints",

      // AI Plant Analysis
      "POST /api/ai/plant-health - Analyze plant health from image",
      "POST /api/ai/pest-identification - Identify pests from image",
      "POST /api/ai/crop-advice - Get crop management advice",
      "POST /api/ai/weekly-log - Save weekly plant log with AI analysis",
      "GET /api/ai/weekly-logs/:fieldId - Get weekly logs for field",
      "POST /api/ai/weekly-log/:logId/comment - Regenerate AI comment",

      // Real-time Video Security
      "POST /api/video/analyze-frame - Analyze video frame for threats",
      "GET /api/video/analysis-history - Get analysis history",
      "GET /api/video/analysis-stats - Get analysis statistics",
      "GET /api/video/health - Video analysis service health",
      "POST /api/video/cleanup - Clean up old frame files",
    ],
    features: [
      "🌱 Plant Health Analysis",
      "🐛 Pest Detection",
      "💧 Water Level Monitoring",
      "🌡️ Soil Moisture Tracking",
      "📹 Real-time Video Security",
      "🤖 AI Threat Detection",
      "📊 Weekly Plant Logging",
      "📈 Analytics & Statistics",
    ],
  });
});

// API health check with detailed service status
app.get("/api/health", (req, res) => {
  const services = {
    water: true,
    soil: true,
    ai: !!process.env.OPENAI_API_KEY,
    video: !!process.env.OPENAI_API_KEY,
    database: true, // Assume database is working if server started
  };

  const allServicesUp = Object.values(services).every((status) => status);

  res.json({
    success: true,
    status: allServicesUp
      ? "All systems operational"
      : "Some services degraded",
    services: services,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: "2.0.0",
  });
});

// Cleanup old files periodically (every 2 hours)
const scheduleCleanup = () => {
  setInterval(async () => {
    try {
      console.log("🧹 Running scheduled cleanup...");

      // Clean up old frame files (older than 2 hours)
      const frameDir = path.join(__dirname, "uploads", "frames");
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours
      const now = Date.now();
      let deletedCount = 0;

      if (fs.existsSync(frameDir)) {
        const files = fs.readdirSync(frameDir);

        files.forEach((file) => {
          const filePath = path.join(frameDir, file);
          try {
            const stats = fs.statSync(filePath);

            if (now - stats.mtime.getTime() > maxAge) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          } catch (err) {
            console.error(`Error processing file ${file}:`, err.message);
          }
        });
      }

      if (deletedCount > 0) {
        console.log(
          `✅ Cleanup completed: ${deletedCount} old frame files deleted`
        );
      }
    } catch (error) {
      console.error("❌ Cleanup error:", error);
    }
  }, 2 * 60 * 60 * 1000); // Run every 2 hours
};

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server Error:", error);

  // Handle specific error types
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      error: "File too large",
      message: "Maximum file size is 50MB",
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON",
      message: "Request body contains invalid JSON",
    });
  }

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: [
      "GET /health",
      "GET /api/health",
      "POST /api/ai/*",
      "POST /api/video/*",
      "GET /api/water/*",
      "GET /api/soil/*",
    ],
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Smart Farming Backend Server Started");
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔧 Health check: http://localhost:${PORT}/health`);
  console.log("");
  console.log("📊 Available Services:");
  console.log("   💧 Water Management: /api/water/*");
  console.log("   🌡️  Soil Monitoring: /api/soil/*");
  console.log("   🌱 Plant Health Analysis: /api/ai/plant-health");
  console.log("   🐛 Pest Identification: /api/ai/pest-identification");
  console.log("   📝 Weekly Plant Logs: /api/ai/weekly-log");
  console.log("   📹 Video Security Analysis: /api/video/analyze-frame");
  console.log("   📈 Analysis Statistics: /api/video/analysis-stats");
  console.log("");
  console.log("🤖 AI Integration Status:");
  console.log(
    `   OpenAI API: ${
      process.env.OPENAI_API_KEY
        ? "✅ Enabled"
        : "❌ Disabled (Add OPENAI_API_KEY to .env)"
    }`
  );
  console.log(
    `   Plant Analysis: ${
      process.env.OPENAI_API_KEY ? "✅ Ready" : "❌ Unavailable"
    }`
  );
  console.log(
    `   Video Security: ${
      process.env.OPENAI_API_KEY ? "✅ Ready" : "❌ Unavailable"
    }`
  );
  console.log("");
  console.log("📁 Directory Structure:");
  console.log(`   Uploads: ${fs.existsSync("uploads") ? "✅" : "❌"}`);
  console.log(
    `   Video Frames: ${fs.existsSync("uploads/frames") ? "✅" : "❌"}`
  );
  console.log(`   Analysis Logs: ${fs.existsSync("logs") ? "✅" : "❌"}`);
  console.log("");

  // Start scheduled cleanup
  scheduleCleanup();
  console.log("🧹 Automatic file cleanup enabled (runs every 2 hours)");
  console.log("");
  console.log("🎥 Real-time Video Security System Ready!");
  console.log("🛡️ AI Threat Detection Active!");
  console.log("");
  console.log("Ready to protect your farm! 🚜🌾🤖");
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

module.exports = app;
