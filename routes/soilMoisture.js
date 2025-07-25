const express = require("express");
const router = express.Router();
const database = require("../database");

// POST /api/soil/reading - Submit new soil moisture reading (Enhanced)
router.post("/reading", async (req, res) => {
  try {
    const {
      moisture_percentage,
      raw_value,
      temperature,
      zone_id,
      sensor_id,
      relay_status,
    } = req.body;

    if (moisture_percentage === undefined || !sensor_id) {
      return res.status(400).json({
        error: "Missing required fields: moisture_percentage and sensor_id",
      });
    }

    // Find zone by sensor_id if zone_id not provided
    let zoneId = zone_id;
    let zoneConfig = null;

    if (!zoneId && sensor_id) {
      zoneConfig = await database.ZoneConfig.findOne({ sensorId: sensor_id });
      if (zoneConfig) {
        zoneId = zoneConfig.zoneId;
      }
    } else if (zoneId) {
      zoneConfig = await database.ZoneConfig.findOne({ zoneId });
    }

    if (!zoneId) {
      return res.status(400).json({
        error:
          "Could not determine zone. Please assign sensor to a zone first.",
      });
    }

    // Get current moisture targets based on growth stage
    let stageInfo = null;
    if (zoneConfig) {
      const targets = await zoneConfig.getCurrentMoistureTargets();
      stageInfo = {
        stageName: targets.stageName,
        dayInStage: targets.dayInStage,
        targetMinMoisture: targets.minMoisture,
        targetMaxMoisture: targets.maxMoisture,
      };
    }

    const readingData = {
      zoneId,
      sensorId: sensor_id,
      moisturePercentage: parseFloat(moisture_percentage),
      rawValue: raw_value || 0,
      temperature: temperature || null,
      relayStatus: relay_status || "auto",
      stageInfo,
    };

    const reading = new database.SoilMoistureReading(readingData);

    // Check if irrigation should be triggered
    const shouldIrrigate = await reading.shouldTriggerIrrigation();
    reading.irrigationTriggered = shouldIrrigate;

    const savedReading = await reading.save();

    // Update zone's last irrigation if triggered
    if (shouldIrrigate) {
      await database.ZoneConfig.findOneAndUpdate(
        { zoneId },
        { lastIrrigation: new Date() }
      );
    }

    res.status(201).json({
      success: true,
      data: savedReading,
      irrigationTriggered: shouldIrrigate,
      stageInfo: stageInfo,
      message: "Soil moisture reading saved successfully",
    });
  } catch (error) {
    console.error("Error inserting soil moisture reading:", error);
    res.status(500).json({
      error: "Failed to save reading",
      message: error.message,
    });
  }
});

// GET /api/soil/zone-config - Get configuration for ESP32 (Enhanced)
router.get("/zone-config", async (req, res) => {
  try {
    const { sensor_id } = req.query;

    if (!sensor_id) {
      return res.status(400).json({
        error: "sensor_id is required",
      });
    }

    const zoneConfig = await database.ZoneConfig.findOne({
      sensorId: sensor_id,
    });

    if (!zoneConfig) {
      return res.status(404).json({
        error: "Zone configuration not found for this sensor",
      });
    }

    // Get current moisture targets from growth stage
    const targets = await zoneConfig.getCurrentMoistureTargets();

    // Get crop profile for additional info
    const cropProfile = await database.CropProfile.findOne({
      cropType: zoneConfig.cropType,
    });

    // Calculate growth progress
    const daysSincePlanting = Math.floor(
      (Date.now() - zoneConfig.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const configForESP32 = {
      zoneId: zoneConfig.zoneId,
      zoneName: zoneConfig.name,
      thresholds: {
        minMoisture: targets.minMoisture,
        maxMoisture: targets.maxMoisture,
      },
      irrigationSettings: zoneConfig.irrigationSettings,
      currentStage: targets.stageName || "Unknown",
      profileDay: Math.max(1, daysSincePlanting),
      stageInfo: {
        name: targets.stageName,
        description: targets.stageDescription,
        dayInStage: targets.dayInStage,
        source: targets.source,
      },
      cropInfo: cropProfile
        ? {
            name: cropProfile.name,
            duration: cropProfile.duration,
            waterRequirements: cropProfile.waterRequirements,
          }
        : null,
      relayId: zoneConfig.relayId,
    };

    res.json({
      success: true,
      data: configForESP32,
    });
  } catch (error) {
    console.error("Error getting zone config:", error);
    res.status(500).json({
      error: "Failed to retrieve zone configuration",
      message: error.message,
    });
  }
});

// GET /api/soil/zones - Get all zones with enhanced data
router.get("/zones", async (req, res) => {
  try {
    const zones = await database.ZoneConfig.find({ isActive: true }).sort({
      createdAt: 1,
    });

    // Get latest readings and enhanced data for each zone
    const zonesWithReadings = await Promise.all(
      zones.map(async (zone) => {
        const latestReading =
          await database.SoilMoistureReading.getLatestByZone(zone.zoneId);
        const stats = await database.SoilMoistureReading.getZoneStats(
          zone.zoneId,
          24
        );

        // Get current moisture targets
        const targets = await zone.getCurrentMoistureTargets();

        // Get crop profile
        const cropProfile = await database.CropProfile.findOne({
          cropType: zone.cropType,
        });

        // Calculate growth stage info
        const daysSincePlanting = Math.floor(
          (Date.now() - zone.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          ...zone.toObject(),
          latestReading,
          stats,
          currentTargets: targets,
          cropProfile: cropProfile
            ? {
                name: cropProfile.name,
                duration: cropProfile.duration,
                waterRequirements: cropProfile.waterRequirements,
              }
            : null,
          growthInfo: {
            daysSincePlanting: Math.max(1, daysSincePlanting),
            progress: cropProfile
              ? Math.min(100, (daysSincePlanting / cropProfile.duration) * 100)
              : 0,
          },
        };
      })
    );

    res.json({
      success: true,
      count: zonesWithReadings.length,
      data: zonesWithReadings,
    });
  } catch (error) {
    console.error("Error getting zones:", error);
    res.status(500).json({
      error: "Failed to retrieve zones",
      message: error.message,
    });
  }
});

// POST /api/soil/irrigation - Enhanced irrigation control
router.post("/irrigation", async (req, res) => {
  try {
    const { zone_id, action, relay_id } = req.body;

    if (!zone_id || !action || !["start", "stop"].includes(action)) {
      return res.status(400).json({
        error: "Invalid parameters. Provide zone_id and action (start/stop)",
      });
    }

    const zoneConfig = await database.ZoneConfig.findOne({ zoneId: zone_id });
    if (!zoneConfig) {
      return res.status(404).json({
        error: "Zone not found",
      });
    }

    // Get latest moisture reading and current targets
    const latestReading = await database.SoilMoistureReading.getLatestByZone(
      zone_id
    );
    const targets = await zoneConfig.getCurrentMoistureTargets();
    const moistureLevel = latestReading ? latestReading.moisturePercentage : 0;

    // Calculate growth stage info
    const daysSincePlanting = Math.floor(
      (Date.now() - zoneConfig.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Log the irrigation action with enhanced context
    const irrigationLog = new database.IrrigationLog({
      zoneId: zone_id,
      relayId: relay_id || zoneConfig.relayId || "unknown",
      action,
      trigger: "manual",
      moistureLevel,
      targetMoisture: targets.minMoisture,
      stageInfo: {
        stageName: targets.stageName,
        dayInStage: targets.dayInStage,
        dayInCrop: Math.max(1, daysSincePlanting),
      },
    });

    await irrigationLog.save();

    // Update zone's last irrigation time if starting
    if (action === "start") {
      await database.ZoneConfig.findOneAndUpdate(
        { zoneId: zone_id },
        { lastIrrigation: new Date() }
      );
    }

    res.json({
      success: true,
      data: {
        zoneId: zone_id,
        action,
        trigger: "manual",
        moistureLevel,
        targetMoisture: targets.minMoisture,
        stageInfo: {
          stageName: targets.stageName,
          dayInStage: targets.dayInStage,
          dayInCrop: Math.max(1, daysSincePlanting),
        },
        timestamp: new Date(),
      },
      message: `Irrigation ${action} command logged successfully`,
    });
  } catch (error) {
    console.error("Error controlling irrigation:", error);
    res.status(500).json({
      error: "Failed to control irrigation",
      message: error.message,
    });
  }
});

// GET /api/soil/crop-profiles - Get all crop profiles
router.get("/crop-profiles", async (req, res) => {
  try {
    const profiles = await database.CropProfile.find({ isActive: true }).sort({
      name: 1,
    });

    res.json({
      success: true,
      count: profiles.length,
      data: profiles,
    });
  } catch (error) {
    console.error("Error getting crop profiles:", error);
    res.status(500).json({
      error: "Failed to retrieve crop profiles",
      message: error.message,
    });
  }
});

// POST /api/soil/crop-profile - Create or update crop profile
router.post("/crop-profile", async (req, res) => {
  try {
    const {
      crop_type,
      name,
      duration,
      description,
      stages,
      temperature_range,
      water_requirements,
    } = req.body;

    if (!crop_type || !name || !duration || !stages || !Array.isArray(stages)) {
      return res.status(400).json({
        error: "Missing required fields: crop_type, name, duration, stages",
      });
    }

    // Validate stages
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (
        !stage.name ||
        !stage.startDay ||
        !stage.endDay ||
        stage.minMoisture === undefined ||
        stage.maxMoisture === undefined
      ) {
        return res.status(400).json({
          error: `Stage ${i + 1} is missing required fields`,
        });
      }
    }

    const profileData = {
      cropType: crop_type,
      name,
      duration,
      description: description || "",
      stages,
      temperatureRange: temperature_range || { min: 15, max: 30 },
      waterRequirements: water_requirements || "medium",
    };

    const updatedProfile = await database.CropProfile.findOneAndUpdate(
      { cropType: crop_type },
      profileData,
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: updatedProfile,
      message: "Crop profile saved successfully",
    });
  } catch (error) {
    console.error("Error saving crop profile:", error);
    res.status(500).json({
      error: "Failed to save crop profile",
      message: error.message,
    });
  }
});

// GET /api/soil/zone/:zoneId/growth-stage - Get detailed growth stage info
router.get("/zone/:zoneId/growth-stage", async (req, res) => {
  try {
    const { zoneId } = req.params;

    const zoneConfig = await database.ZoneConfig.findOne({ zoneId });
    if (!zoneConfig) {
      return res.status(404).json({
        error: "Zone not found",
      });
    }

    const cropProfile = await database.CropProfile.findOne({
      cropType: zoneConfig.cropType,
    });

    if (!cropProfile) {
      return res.status(404).json({
        error: "Crop profile not found",
      });
    }

    const daysSincePlanting = Math.floor(
      (Date.now() - zoneConfig.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find current stage
    let currentStage = null;
    let stageIndex = 0;

    for (let i = 0; i < cropProfile.stages.length; i++) {
      const stage = cropProfile.stages[i];
      if (
        daysSincePlanting >= stage.startDay &&
        daysSincePlanting <= stage.endDay
      ) {
        currentStage = stage;
        stageIndex = i;
        break;
      }
    }

    // If past all stages, use last stage
    if (!currentStage && daysSincePlanting > cropProfile.duration) {
      currentStage = cropProfile.stages[cropProfile.stages.length - 1];
      stageIndex = cropProfile.stages.length - 1;
    }

    const dayInStage = currentStage
      ? daysSincePlanting - currentStage.startDay + 1
      : 1;
    const stageDuration = currentStage
      ? currentStage.endDay - currentStage.startDay + 1
      : 1;
    const daysRemainingInStage = currentStage
      ? Math.max(0, currentStage.endDay - daysSincePlanting)
      : 0;

    res.json({
      success: true,
      data: {
        zone: {
          zoneId: zoneConfig.zoneId,
          name: zoneConfig.name,
          plantingDate: zoneConfig.plantingDate,
        },
        crop: {
          type: cropProfile.cropType,
          name: cropProfile.name,
          duration: cropProfile.duration,
        },
        growth: {
          daysSincePlanting: Math.max(1, daysSincePlanting),
          currentStage,
          stageIndex,
          dayInStage,
          stageDuration,
          daysRemainingInStage,
          overallProgress: Math.min(
            100,
            (daysSincePlanting / cropProfile.duration) * 100
          ),
          stageProgress: Math.min(100, (dayInStage / stageDuration) * 100),
        },
        allStages: cropProfile.stages,
      },
    });
  } catch (error) {
    console.error("Error getting growth stage info:", error);
    res.status(500).json({
      error: "Failed to get growth stage information",
      message: error.message,
    });
  }
});

// Existing routes (latest, zone, irrigation/status) remain the same...
// GET /api/soil/latest
router.get("/latest", async (req, res) => {
  try {
    const { zone_id, sensor_id } = req.query;

    let query = {};
    if (zone_id) query.zoneId = zone_id;
    if (sensor_id) query.sensorId = sensor_id;

    if (Object.keys(query).length === 0) {
      return res.status(400).json({
        error: "Must provide either zone_id or sensor_id",
      });
    }

    const reading = await database.SoilMoistureReading.findOne(query).sort({
      timestamp: -1,
    });

    if (!reading) {
      return res.status(404).json({
        error: "No readings found",
      });
    }

    res.json({
      success: true,
      data: reading,
    });
  } catch (error) {
    console.error("Error getting latest reading:", error);
    res.status(500).json({
      error: "Failed to retrieve reading",
      message: error.message,
    });
  }
});

// POST /api/soil/zone
router.post("/zone", async (req, res) => {
  try {
    const {
      zone_id,
      name,
      field_name,
      area,
      crop_type,
      planting_date,
      min_moisture,
      max_moisture,
      sensor_id,
      relay_id,
      irrigation_duration,
      cooldown_minutes,
      use_static_thresholds,
    } = req.body;

    if (!zone_id || !name || !crop_type) {
      return res.status(400).json({
        error: "Missing required fields: zone_id, name, crop_type",
      });
    }

    const zoneData = {
      zoneId: zone_id,
      name,
      fieldName: field_name || "Default Field",
      area: area || 100,
      cropType: crop_type,
      plantingDate: planting_date ? new Date(planting_date) : new Date(),
      moistureThresholds: {
        minMoisture: min_moisture || 60,
        maxMoisture: max_moisture || 80,
      },
      irrigationSettings: {
        enabled: true,
        durationMinutes: irrigation_duration || 30,
        cooldownMinutes: cooldown_minutes || 120,
        useStaticThresholds: use_static_thresholds || false,
      },
      sensorId: sensor_id || null,
      relayId: relay_id || null,
    };

    const updatedZone = await database.ZoneConfig.findOneAndUpdate(
      { zoneId: zone_id },
      zoneData,
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: updatedZone,
      message: "Zone configuration saved successfully",
    });
  } catch (error) {
    console.error("Error saving zone config:", error);
    res.status(500).json({
      error: "Failed to save zone configuration",
      message: error.message,
    });
  }
});

// GET /api/soil/irrigation/status
router.get("/irrigation/status", async (req, res) => {
  try {
    const { zone_id } = req.query;

    if (!zone_id) {
      return res.status(400).json({
        error: "zone_id is required",
      });
    }

    // Get latest irrigation logs
    const latestLog = await database.IrrigationLog.findOne({
      zoneId: zone_id,
    }).sort({
      timestamp: -1,
    });
    const latestReading = await database.SoilMoistureReading.getLatestByZone(
      zone_id
    );
    const zoneConfig = await database.ZoneConfig.findOne({ zoneId: zone_id });

    let isIrrigating = false;
    let irrigationStartTime = null;

    if (latestLog && latestLog.action === "start") {
      // Check if there's a corresponding stop action
      const stopLog = await database.IrrigationLog.findOne({
        zoneId: zone_id,
        action: "stop",
        timestamp: { $gt: latestLog.timestamp },
      });

      if (!stopLog) {
        isIrrigating = true;
        irrigationStartTime = latestLog.timestamp;
      }
    }

    // Get current moisture targets
    let currentTargets = null;
    if (zoneConfig) {
      currentTargets = await zoneConfig.getCurrentMoistureTargets();
    }

    res.json({
      success: true,
      data: {
        zoneId: zone_id,
        isIrrigating,
        irrigationStartTime,
        latestReading,
        currentTargets,
        zoneConfig: zoneConfig
          ? {
              thresholds: zoneConfig.moistureThresholds,
              irrigationSettings: zoneConfig.irrigationSettings,
              useStaticThresholds:
                zoneConfig.irrigationSettings.useStaticThresholds,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error getting irrigation status:", error);
    res.status(500).json({
      error: "Failed to get irrigation status",
      message: error.message,
    });
  }
});

module.exports = router;
