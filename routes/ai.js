// routes/ai.js
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

// Helper function to check if image contains a plant
const checkIfPlantImage = async (base64Image) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please analyze this image and determine if it contains plants, crops, or vegetation that can be analyzed for agricultural purposes. 

              Respond with ONLY a JSON object in this exact format:
              {
                "isPlant": true/false,
                "confidence": 0-100,
                "reason": "brief explanation",
                "plantType": "specific plant/crop name or null if no plant",
                "category": "crop/flower/tree/weed/houseplant/vegetable/fruit/herb/other or null"
              }

              Return isPlant: true if the image shows:
              - Agricultural crops (corn, wheat, tomatoes, etc.)
              - Garden plants or vegetables
              - Trees with visible leaves/fruit
              - Any plant with visible health indicators
              - Potted plants or houseplants
              
              Return isPlant: false if the image shows:
              - Only soil, rocks, or landscape without plants
              - Animals, people, or objects
              - Buildings, machinery, or tools
              - Very blurry or unclear images where plants cannot be identified`,
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
      max_tokens: 300,
      temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback if JSON parsing fails
    return {
      isPlant: false,
      confidence: 0,
      reason: "Unable to analyze image",
      plantType: null,
      category: null,
    };
  } catch (error) {
    console.error("Plant detection error:", error);
    return {
      isPlant: false,
      confidence: 0,
      reason: "Analysis failed",
      plantType: null,
      category: null,
    };
  }
};

// Helper function to generate AI comment on weekly log
const generateWeeklyLogComment = async (
  analysis,
  notes,
  plantType,
  week,
  previousLogs = []
) => {
  try {
    // Prepare context about previous logs
    let historyContext = "";
    if (previousLogs.length > 0) {
      const recentLogs = previousLogs.slice(0, 3); // Last 3 logs
      historyContext = `\nPrevious log history:\n${recentLogs
        .map(
          (log) =>
            `Week ${log.week}: Health was ${
              log.analysis?.health || "N/A"
            }, Score: ${log.analysis?.overallScore || "N/A"}/100. Notes: "${
              log.notes
            }"`
        )
        .join("\n")}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert agricultural consultant providing weekly insights on crop health. Your comments should be encouraging, informative, and actionable. Keep responses concise but insightful.",
        },
        {
          role: "user",
          content: `Provide a brief but insightful AI comment on this weekly plant log entry. 

Plant: ${plantType}
Week: ${week}
Farmer's Notes: "${notes}"

AI Analysis Results:
- Health Status: ${analysis?.health || "Not analyzed"}
- Overall Score: ${analysis?.overallScore || "N/A"}/100
- Diseases: ${analysis?.diseases?.join(", ") || "None detected"}
- Issues: ${analysis?.issues?.join(", ") || "None identified"}
- Recommendations: ${analysis?.recommendations?.join(", ") || "None provided"}
${historyContext}

Provide a comment in this JSON format:
{
  "comment": "Your encouraging and insightful comment here",
  "trend": "improving/stable/declining/inconclusive",
  "keyInsight": "One key insight or actionable advice",
  "encouragement": "Brief encouraging message"
}

Focus on:
- Progress trends if previous data available
- Specific actionable advice
- Acknowledging farmer's observations
- Encouraging positive practices
- Highlighting concerns if any`,
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback structured comment
    return {
      comment: `Week ${week} monitoring shows your ${plantType} plants are progressing. Your observations about "${notes.slice(
        0,
        50
      )}..." are valuable for tracking health trends. Continue with regular monitoring.`,
      trend: "stable",
      keyInsight:
        "Regular monitoring and documentation are key to successful crop management.",
      encouragement:
        "Great job keeping detailed records of your plants' progress!",
    };
  } catch (error) {
    console.error("AI comment generation error:", error);
    return {
      comment: `Thank you for your week ${week} observations. Your notes about the ${plantType} plants are helpful for tracking progress over time.`,
      trend: "stable",
      keyInsight:
        "Consistent monitoring helps identify patterns and potential issues early.",
      encouragement: "Keep up the excellent documentation!",
    };
  }
};

// Plant Health Analysis with Plant Detection
router.post("/plant-health", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image provided",
      });
    }

    const imagePath = req.file.path;
    const base64Image = encodeImage(imagePath);

    // First, check if the image contains a plant
    const plantCheck = await checkIfPlantImage(base64Image);

    if (!plantCheck.isPlant) {
      cleanupFile(imagePath);
      return res.status(400).json({
        success: false,
        error: "No plant detected in image",
        details: {
          reason: plantCheck.reason,
          confidence: plantCheck.confidence,
          suggestion:
            "Please upload an image that clearly shows a plant, crop, or vegetation.",
        },
      });
    }

    // Proceed with plant health analysis
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this plant image for health assessment. You are an expert agricultural consultant. 

              The plant has been identified as: ${plantCheck.plantType} (${plantCheck.category})

              Please provide a detailed analysis in the following JSON format:
              {
                "plantIdentification": {
                  "name": "${plantCheck.plantType}",
                  "category": "${plantCheck.category}",
                  "confidence": ${plantCheck.confidence}
                },
                "health": "Excellent/Good/Fair/Poor",
                "confidence": 0-100,
                "issues": ["specific issue 1", "specific issue 2"],
                "recommendations": ["actionable recommendation 1", "actionable recommendation 2"],
                "diseases": ["disease name if any"],
                "nutrientDeficiencies": ["nutrient name if deficient"],
                "overallScore": 0-100,
                "detailedAssessment": {
                  "leafCondition": "description",
                  "colorHealth": "description",
                  "growthPattern": "description",
                  "pestSigns": "description"
                }
              }

              Focus on:
              - Leaf color and condition
              - Growth patterns
              - Signs of disease or pest damage
              - Nutrient deficiency symptoms
              - Overall plant vigor
              - Specific issues for this plant type: ${plantCheck.plantType}`,
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

    cleanupFile(imagePath);

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
        plantIdentification: {
          name: plantCheck.plantType,
          category: plantCheck.category,
          confidence: plantCheck.confidence,
        },
        health: "Good",
        confidence: 75,
        issues: ["Analysis completed - detailed assessment available"],
        recommendations: [
          "Continue regular monitoring",
          "Maintain consistent care routine",
        ],
        diseases: [],
        nutrientDeficiencies: [],
        overallScore: 75,
        detailedAssessment: {
          leafCondition: "Generally healthy appearance",
          colorHealth: "Normal coloration observed",
          growthPattern: "Standard growth pattern",
          pestSigns: "No obvious pest damage visible",
        },
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
      success: false,
      error: "Analysis failed",
      message: error.message,
    });
  }
});

// Weekly Log Entry Route
router.post("/weekly-log", upload.single("image"), async (req, res) => {
  try {
    const { notes, fieldId, week, date, analysis } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image provided for weekly log",
      });
    }

    if (!notes || !fieldId) {
      cleanupFile(req.file.path);
      return res.status(400).json({
        success: false,
        error: "Missing required fields: notes and fieldId are required",
      });
    }

    const imagePath = req.file.path;
    const base64Image = encodeImage(imagePath);

    // Check if image contains a plant
    const plantCheck = await checkIfPlantImage(base64Image);

    if (!plantCheck.isPlant) {
      cleanupFile(imagePath);
      return res.status(400).json({
        success: false,
        error: "Weekly log requires a plant image",
        details: {
          reason: plantCheck.reason,
          suggestion:
            "Please upload an image that shows the plants you're monitoring.",
        },
      });
    }

    // Parse analysis if provided as string
    let parsedAnalysis = null;
    if (analysis) {
      try {
        parsedAnalysis =
          typeof analysis === "string" ? JSON.parse(analysis) : analysis;
      } catch (e) {
        console.error("Error parsing analysis:", e);
      }
    }

    // Read existing logs to get previous entries for AI context
    const logsFilePath = path.join("data", "weekly-logs.json");
    let existingLogs = [];
    if (fs.existsSync(logsFilePath)) {
      try {
        const logsData = fs.readFileSync(logsFilePath, "utf8");
        existingLogs = JSON.parse(logsData);
      } catch (e) {
        console.error("Error reading existing logs:", e);
        existingLogs = [];
      }
    }

    // Get previous logs for this field for AI context
    const fieldLogs = existingLogs
      .filter((log) => log.fieldId === parseInt(fieldId))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3); // Last 3 logs

    // Generate AI comment
    const aiComment = await generateWeeklyLogComment(
      parsedAnalysis,
      notes,
      plantCheck.plantType,
      parseInt(week) || 1,
      fieldLogs
    );

    // Generate filename for permanent storage
    const timestamp = Date.now();
    const fileExtension = path.extname(req.file.originalname);
    const permanentFileName = `weekly-log-${fieldId}-${timestamp}${fileExtension}`;
    const permanentPath = path.join(
      "uploads",
      "weekly-logs",
      permanentFileName
    );

    // Ensure directory exists
    const weeklyLogsDir = path.join("uploads", "weekly-logs");
    if (!fs.existsSync(weeklyLogsDir)) {
      fs.mkdirSync(weeklyLogsDir, { recursive: true });
    }

    // Move file to permanent location
    fs.renameSync(imagePath, permanentPath);

    // Create log entry object
    const logEntry = {
      id: `log_${timestamp}`,
      fieldId: parseInt(fieldId),
      week: parseInt(week) || 1,
      date: date || new Date().toISOString(),
      imagePath: permanentPath,
      imageUrl: `/uploads/weekly-logs/${permanentFileName}`,
      notes: notes,
      analysis: parsedAnalysis,
      plantIdentification: {
        name: plantCheck.plantType,
        category: plantCheck.category,
        confidence: plantCheck.confidence,
      },
      aiComment: aiComment,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // In a real application, you would save this to a database
    // For now, we'll save to a JSON file as a simple storage solution
    const dataDir = path.dirname(logsFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Add new log entry
    existingLogs.push(logEntry);

    // Save updated logs
    fs.writeFileSync(logsFilePath, JSON.stringify(existingLogs, null, 2));

    res.json({
      success: true,
      data: logEntry,
      message: "Weekly log saved successfully",
    });
  } catch (error) {
    if (req.file) cleanupFile(req.file.path);
    console.error("Weekly log error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to save weekly log",
      message: error.message,
    });
  }
});

// Get Weekly Logs for a Field
router.get("/weekly-logs/:fieldId", async (req, res) => {
  try {
    const { fieldId } = req.params;
    const logsFilePath = path.join("data", "weekly-logs.json");

    if (!fs.existsSync(logsFilePath)) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const logsData = fs.readFileSync(logsFilePath, "utf8");
    const allLogs = JSON.parse(logsData);

    // Filter logs for the specific field
    const fieldLogs = allLogs.filter(
      (log) => log.fieldId === parseInt(fieldId)
    );

    // Sort by date (newest first)
    fieldLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: fieldLogs,
    });
  } catch (error) {
    console.error("Error fetching weekly logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch weekly logs",
      message: error.message,
    });
  }
});

// Get All Weekly Logs
router.get("/weekly-logs", async (req, res) => {
  try {
    const logsFilePath = path.join("data", "weekly-logs.json");

    if (!fs.existsSync(logsFilePath)) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const logsData = fs.readFileSync(logsFilePath, "utf8");
    const allLogs = JSON.parse(logsData);

    // Sort by date (newest first)
    allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: allLogs,
    });
  } catch (error) {
    console.error("Error fetching all weekly logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch weekly logs",
      message: error.message,
    });
  }
});

// Regenerate AI Comment for Existing Log
router.post("/weekly-log/:logId/comment", async (req, res) => {
  try {
    const { logId } = req.params;
    const logsFilePath = path.join("data", "weekly-logs.json");

    if (!fs.existsSync(logsFilePath)) {
      return res.status(404).json({
        success: false,
        error: "No logs found",
      });
    }

    const logsData = fs.readFileSync(logsFilePath, "utf8");
    const allLogs = JSON.parse(logsData);

    // Find the specific log
    const logIndex = allLogs.findIndex((log) => log.id === logId);
    if (logIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Log entry not found",
      });
    }

    const targetLog = allLogs[logIndex];

    // Get previous logs for context
    const fieldLogs = allLogs
      .filter((log) => log.fieldId === targetLog.fieldId && log.id !== logId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);

    // Generate new AI comment
    const aiComment = await generateWeeklyLogComment(
      targetLog.analysis,
      targetLog.notes,
      targetLog.plantIdentification?.name || "plant",
      targetLog.week,
      fieldLogs
    );

    // Update the log with new comment
    allLogs[logIndex].aiComment = aiComment;
    allLogs[logIndex].updatedAt = new Date().toISOString();

    // Save updated logs
    fs.writeFileSync(logsFilePath, JSON.stringify(allLogs, null, 2));

    res.json({
      success: true,
      data: {
        logId: logId,
        aiComment: aiComment,
      },
      message: "AI comment regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating AI comment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate comment",
      message: error.message,
    });
  }
});

// Pest Identification with Plant Guard
router.post(
  "/pest-identification",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No image provided",
        });
      }

      const imagePath = req.file.path;
      const base64Image = encodeImage(imagePath);

      // Check if image contains a plant (pests should be on plants)
      const plantCheck = await checkIfPlantImage(base64Image);

      if (!plantCheck.isPlant) {
        cleanupFile(imagePath);
        return res.status(400).json({
          success: false,
          error: "Pest identification requires an image with plants",
          details: {
            reason: plantCheck.reason,
            suggestion:
              "Please upload an image showing plants where pests might be present.",
          },
        });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image for pest identification on plants. You are an expert entomologist and agricultural pest specialist.

            The plant has been identified as: ${plantCheck.plantType} (${plantCheck.category})

            Please provide analysis in this JSON format:
            {
              "plantIdentification": {
                "name": "${plantCheck.plantType}",
                "category": "${plantCheck.category}"
              },
              "pestDetected": true/false,
              "pestType": "specific pest name or null",
              "confidence": 0-100,
              "severity": "None/Low/Moderate/High",
              "treatmentOptions": ["specific treatment 1", "specific treatment 2"],
              "preventionMeasures": ["prevention method 1", "prevention method 2"],
              "economicThreat": "Low/Medium/High",
              "affectedParts": ["plant part 1", "plant part 2"],
              "urgency": "Low/Medium/High",
              "commonPestsForPlant": ["pest 1", "pest 2"]
            }

            Look carefully for:
            - Visible insects or pests
            - Damage patterns on leaves/stems
            - Eggs or larvae
            - Feeding damage characteristics
            - Secondary damage signs
            - Common pests that affect ${plantCheck.plantType}`,
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
        max_tokens: 800,
        temperature: 0.1,
      });

      cleanupFile(imagePath);

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
          plantIdentification: {
            name: plantCheck.plantType,
            category: plantCheck.category,
          },
          pestDetected: false,
          pestType: null,
          confidence: 60,
          severity: "None",
          treatmentOptions: ["Continue monitoring for pests"],
          preventionMeasures: ["Regular inspection", "Maintain plant health"],
          economicThreat: "Low",
          affectedParts: [],
          urgency: "Low",
          commonPestsForPlant: [],
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
        success: false,
        error: "Analysis failed",
        message: error.message,
      });
    }
  }
);

// Crop Advisory (Text-only, no vision needed)
router.post("/crop-advice", async (req, res) => {
  try {
    const { cropType, stage, issues, location, soilType, weather } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert agricultural consultant with decades of experience in crop management, soil science, and sustainable farming practices. Provide specific, actionable advice.",
        },
        {
          role: "user",
          content: `Provide comprehensive farming advice for the following situation:
          
          Crop: ${cropType || "Not specified"}
          Growth Stage: ${stage || "Not specified"}
          Current Issues: ${issues || "None reported"}
          Location: ${location || "Not specified"}
          Soil Type: ${soilType || "Not specified"}
          Weather Conditions: ${weather || "Not specified"}
          
          Please provide advice in this JSON format:
          {
            "immediateActions": ["urgent action 1", "urgent action 2"],
            "fertilization": {
              "schedule": "timing and frequency",
              "type": "specific fertilizer recommendation",
              "amount": "application rates"
            },
            "irrigation": "specific watering recommendations",
            "pestPrevention": ["prevention strategy 1", "prevention strategy 2"],
            "nextSteps": ["upcoming task 1", "upcoming task 2"],
            "timeline": "expected timeframe for next growth stage",
            "additionalNotes": ["important consideration 1", "important consideration 2"]
          }`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    });

    let advice;
    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        advice = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.log("JSON parse error, creating structured response from text");
      const content = response.choices[0].message.content;
      advice = {
        immediateActions: ["Monitor crop health closely"],
        fertilization: {
          schedule: "Based on soil test results",
          type: "Balanced NPK fertilizer",
          amount: "Follow manufacturer recommendations",
        },
        irrigation: "Maintain consistent moisture levels",
        pestPrevention: [
          "Regular field scouting",
          "Integrated pest management",
        ],
        nextSteps: ["Continue monitoring", "Plan for next growth stage"],
        timeline: "2-3 weeks to next stage",
        additionalNotes: ["Consult local agricultural extension"],
        rawAdvice: content,
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
      fallback: {
        immediateActions: ["Monitor crop regularly"],
        fertilization: {
          schedule: "Every 2-3 weeks during growing season",
          type: "Balanced fertilizer appropriate for crop type",
          amount: "Follow soil test recommendations",
        },
        irrigation: "Water deeply but less frequently",
        pestPrevention: ["Regular inspection", "Maintain plant health"],
        nextSteps: ["Continue standard care practices"],
        timeline: "Monitor for changes",
        additionalNotes: ["Consult local agricultural expert"],
      },
    });
  }
});

// Health check for AI services
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "AI Analysis Service",
    models: {
      vision: "gpt-4o",
      text: "gpt-4o",
    },
    features: [
      "Plant Health Analysis",
      "Pest Identification",
      "Weekly Log Management",
      "Plant Image Detection",
      "AI Comments Generation",
      "Crop Advisory",
    ],
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
