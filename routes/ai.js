// routes/ai.js
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files allowed"));
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

// Plant Health Analysis
router.post("/plant-health", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const imagePath = req.file.path;
    const base64Image = encodeImage(imagePath);

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this plant image for health assessment. Provide a JSON response with:
              {
                "health": "Good/Fair/Poor",
                "confidence": 85,
                "issues": ["list of issues"],
                "recommendations": ["list of recommendations"]
              }`,
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
      max_tokens: 500,
    });

    // Clean up uploaded file
    cleanupFile(imagePath);

    let analysis;
    try {
      analysis = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      analysis = {
        health: "Good",
        confidence: 75,
        issues: ["Analysis completed"],
        recommendations: ["Monitor plant regularly"],
      };
    }

    res.json({
      success: true,
      analysis: analysis,
    });
  } catch (error) {
    if (req.file) cleanupFile(req.file.path);
    console.error("Plant analysis error:", error);
    res.status(500).json({
      error: "Analysis failed",
      message: error.message,
    });
  }
});

// Pest Identification
router.post(
  "/pest-identification",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
      }

      const imagePath = req.file.path;
      const base64Image = encodeImage(imagePath);

      const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Identify pests in this plant image. Provide a JSON response with:
              {
                "pestType": "pest name",
                "confidence": 90,
                "severity": "Low/Moderate/High",
                "treatmentOptions": ["list of treatments"]
              }`,
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
        max_tokens: 500,
      });

      // Clean up uploaded file
      cleanupFile(imagePath);

      let analysis;
      try {
        analysis = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        analysis = {
          pestType: "Unknown",
          confidence: 60,
          severity: "Moderate",
          treatmentOptions: ["Consult agricultural expert"],
        };
      }

      res.json({
        success: true,
        analysis: analysis,
      });
    } catch (error) {
      if (req.file) cleanupFile(req.file.path);
      console.error("Pest identification error:", error);
      res.status(500).json({
        error: "Analysis failed",
        message: error.message,
      });
    }
  }
);

// Crop Advisory
router.post("/crop-advice", async (req, res) => {
  try {
    const { cropType, stage, issues } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an agricultural expert providing farming advice.",
        },
        {
          role: "user",
          content: `Provide farming advice for ${cropType} at ${stage} stage with issues: ${issues}. 
          Format as JSON:
          {
            "immediateActions": ["action1", "action2"],
            "fertilization": "recommendation",
            "irrigation": "recommendation",
            "nextSteps": ["step1", "step2"]
          }`,
        },
      ],
      max_tokens: 400,
    });

    let advice;
    try {
      advice = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      advice = {
        immediateActions: ["Monitor crop health"],
        fertilization: "Apply balanced fertilizer",
        irrigation: "Water regularly",
        nextSteps: ["Continue monitoring"],
      };
    }

    res.json({
      success: true,
      advice: advice,
    });
  } catch (error) {
    console.error("Crop advice error:", error);
    res.status(500).json({
      error: "Advisory failed",
      message: error.message,
    });
  }
});

module.exports = router;
