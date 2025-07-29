// routes/video-analysis.js
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for video frame uploads
const upload = multer({
  dest: "uploads/frames/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per frame
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files allowed for frame analysis"));
    }
  },
});

// Helper function to encode image
const encodeImage = (imagePath) => {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
};

// Helper function to cleanup files
const cleanupFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

// Threat classification system
const classifyThreat = (detections) => {
  const threats = [];

  detections.forEach((detection) => {
    const { class: objectClass, confidence } = detection;

    // Define threat rules
    const threatRules = {
      person: {
        type: "person",
        description: "Person detected in restricted area",
        baseSeverity:
          confidence > 80 ? "high" : confidence > 60 ? "medium" : "low",
      },
      dog: {
        type: "predator",
        description: "Potential predator (dog) detected",
        baseSeverity: confidence > 75 ? "high" : "medium",
      },
      cat: {
        type: "predator",
        description: "Potential predator (cat) detected",
        baseSeverity: confidence > 75 ? "high" : "medium",
      },
      bird: {
        type: "predator",
        description: "Aerial predator (bird) detected",
        baseSeverity: confidence > 80 ? "medium" : "low",
      },
      car: {
        type: "vehicle",
        description: "Unauthorized vehicle detected",
        baseSeverity: confidence > 70 ? "medium" : "low",
      },
      truck: {
        type: "vehicle",
        description: "Large vehicle detected",
        baseSeverity: confidence > 70 ? "medium" : "low",
      },
      motorcycle: {
        type: "vehicle",
        description: "Motorcycle detected",
        baseSeverity: confidence > 70 ? "medium" : "low",
      },
    };

    // Check if detection matches a threat
    const normalizedClass = objectClass.toLowerCase();
    const threatRule = threatRules[normalizedClass];

    if (threatRule && confidence > 60) {
      // Only consider high-confidence detections as threats
      threats.push({
        type: threatRule.type,
        description: threatRule.description,
        confidence: confidence,
        severity: threatRule.baseSeverity,
        detectedObject: objectClass,
        bbox: detection.bbox,
      });
    }
  });

  return threats;
};

// Main frame analysis endpoint
router.post("/analyze-frame", upload.single("frame"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No frame provided for analysis",
      });
    }

    const framePath = req.file.path;
    const timestamp = req.body.timestamp || new Date().toISOString();
    const base64Image = encodeImage(framePath);

    console.log(`Analyzing frame at ${timestamp}`);

    // Analyze frame with OpenAI Vision
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this security camera frame for objects and potential threats. You are an expert security analyst.

              Please identify all objects in the image and provide a detailed analysis in this JSON format:
              {
                "timestamp": "${timestamp}",
                "detections": [
                  {
                    "class": "object_name",
                    "confidence": 85,
                    "bbox": {
                      "x": 10,
                      "y": 20,
                      "width": 30,
                      "height": 40
                    },
                    "description": "detailed description of what you see"
                  }
                ],
                "scene_description": "overall description of the scene",
                "threat_level": "none/low/medium/high",
                "environment": "indoor/outdoor/mixed",
                "lighting": "good/poor/dark",
                "movement_detected": true/false
              }

              Focus on detecting:
              - People (persons, humans)
              - Animals (dogs, cats, birds, livestock, wild animals)
              - Vehicles (cars, trucks, motorcycles, bicycles)
              - Suspicious objects or activities
              - Movement or changes from typical scenes

              Provide confidence scores (0-100) and approximate bounding box coordinates as percentages of the image dimensions.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    // Clean up uploaded file
    cleanupFile(framePath);

    let analysis;
    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.log("JSON parse error, creating structured response");
      analysis = {
        timestamp: timestamp,
        detections: [],
        scene_description:
          "Analysis completed but unable to parse detailed results",
        threat_level: "none",
        environment: "unknown",
        lighting: "unknown",
        movement_detected: false,
      };
    }

    // Classify threats based on detections
    const threats = classifyThreat(analysis.detections || []);

    // Update threat level based on detected threats
    if (threats.length > 0) {
      const highestSeverity = threats.reduce((max, threat) => {
        const severityLevels = { low: 1, medium: 2, high: 3 };
        return severityLevels[threat.severity] > severityLevels[max]
          ? threat.severity
          : max;
      }, "low");
      analysis.threat_level = highestSeverity;
    }

    // Add threat information to analysis
    analysis.threats = threats;
    analysis.threat_count = threats.length;

    // Log analysis results
    console.log(
      `Frame analysis complete: ${analysis.detections?.length || 0} objects, ${
        threats.length
      } threats`
    );

    // Save analysis to log file (optional)
    const logEntry = {
      timestamp: timestamp,
      detections: analysis.detections?.length || 0,
      threats: threats.length,
      threat_level: analysis.threat_level,
    };

    // Append to daily log file
    const logFile = path.join(
      "logs",
      `analysis-${new Date().toISOString().split("T")[0]}.json`
    );
    try {
      const logDir = path.dirname(logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      let existingLogs = [];
      if (fs.existsSync(logFile)) {
        const logData = fs.readFileSync(logFile, "utf8");
        existingLogs = JSON.parse(logData);
      }

      existingLogs.push(logEntry);
      fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2));
    } catch (logError) {
      console.error("Error writing to log file:", logError);
    }

    res.json({
      success: true,
      analysis: analysis,
    });
  } catch (error) {
    if (req.file) cleanupFile(req.file.path);
    console.error("Frame analysis error:", error);

    res.status(500).json({
      success: false,
      error: "Analysis failed",
      message: error.message,
      fallback: {
        timestamp: req.body.timestamp || new Date().toISOString(),
        detections: [],
        threats: [],
        threat_level: "none",
        scene_description: "Analysis service temporarily unavailable",
        environment: "unknown",
        lighting: "unknown",
        movement_detected: false,
        threat_count: 0,
      },
    });
  }
});

// Get analysis history
router.get("/analysis-history", async (req, res) => {
  try {
    const { date, limit = 100 } = req.query;
    const targetDate = date || new Date().toISOString().split("T")[0];
    const logFile = path.join("logs", `analysis-${targetDate}.json`);

    if (!fs.existsSync(logFile)) {
      return res.json({
        success: true,
        data: [],
        message: "No analysis data found for the specified date",
      });
    }

    const logData = fs.readFileSync(logFile, "utf8");
    const logs = JSON.parse(logData);

    // Return most recent entries up to limit
    const recentLogs = logs.slice(-parseInt(limit)).reverse();

    res.json({
      success: true,
      data: recentLogs,
      total: logs.length,
      date: targetDate,
    });
  } catch (error) {
    console.error("Error fetching analysis history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch analysis history",
      message: error.message,
    });
  }
});

// Get analysis statistics
router.get("/analysis-stats", async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split("T")[0];
    const logFile = path.join("logs", `analysis-${targetDate}.json`);

    if (!fs.existsSync(logFile)) {
      return res.json({
        success: true,
        stats: {
          total_analyses: 0,
          total_detections: 0,
          total_threats: 0,
          threat_levels: { none: 0, low: 0, medium: 0, high: 0 },
          average_detections_per_frame: 0,
        },
      });
    }

    const logData = fs.readFileSync(logFile, "utf8");
    const logs = JSON.parse(logData);

    const stats = {
      total_analyses: logs.length,
      total_detections: logs.reduce((sum, log) => sum + log.detections, 0),
      total_threats: logs.reduce((sum, log) => sum + log.threats, 0),
      threat_levels: { none: 0, low: 0, medium: 0, high: 0 },
      average_detections_per_frame: 0,
    };

    // Calculate threat level distribution
    logs.forEach((log) => {
      stats.threat_levels[log.threat_level] =
        (stats.threat_levels[log.threat_level] || 0) + 1;
    });

    // Calculate average detections per frame
    stats.average_detections_per_frame =
      logs.length > 0 ? (stats.total_detections / logs.length).toFixed(2) : 0;

    res.json({
      success: true,
      stats: stats,
      date: targetDate,
    });
  } catch (error) {
    console.error("Error calculating analysis statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to calculate statistics",
      message: error.message,
    });
  }
});

// Test endpoint for system health
router.get("/health", (req, res) => {
  const frameDir = path.join("uploads", "frames");
  const logDir = "logs";

  // Ensure directories exist
  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true });
  }
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  res.json({
    success: true,
    service: "Real-time Video Analysis Service",
    model: "gpt-4o",
    features: [
      "Real-time frame analysis",
      "Object detection",
      "Threat classification",
      "Analysis logging",
      "Statistics tracking",
    ],
    directories: {
      frames: frameDir,
      logs: logDir,
    },
    timestamp: new Date().toISOString(),
  });
});

// Cleanup old frame files (run periodically)
router.post("/cleanup", (req, res) => {
  try {
    const frameDir = path.join("uploads", "frames");
    const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
    const now = Date.now();
    let deletedCount = 0;

    if (fs.existsSync(frameDir)) {
      const files = fs.readdirSync(frameDir);

      files.forEach((file) => {
        const filePath = path.join(frameDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });
    }

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old frame files`,
      deleted_files: deletedCount,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({
      success: false,
      error: "Cleanup failed",
      message: error.message,
    });
  }
});

module.exports = router;
