const express = require("express");
const router = express.Router();
const database = require("../database");

// In-memory store for pending commands (in production, use Redis)
const pendingCommands = new Map();

// Store for ESP32 connections (for real-time commands)
const esp32Connections = new Map();

// POST /api/soil/reading - Enhanced with command checking
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
    let stageInfo = {
      stageName: null,
      dayInStage: null,
      targetMinMoisture: null,
      targetMaxMoisture: null,
    };

    if (zoneConfig) {
      try {
        const targets = await zoneConfig.getCurrentMoistureTargets();

        if (
          targets.stageName &&
          targets.dayInStage &&
          !isNaN(targets.dayInStage)
        ) {
          stageInfo = {
            stageName: targets.stageName,
            dayInStage: Math.max(1, Math.floor(targets.dayInStage)),
            targetMinMoisture: targets.minMoisture,
            targetMaxMoisture: targets.maxMoisture,
          };
        } else {
          stageInfo = {
            stageName: targets.stageName || null,
            dayInStage: null,
            targetMinMoisture: targets.minMoisture,
            targetMaxMoisture: targets.maxMoisture,
          };
        }
      } catch (error) {
        console.error("Error getting moisture targets:", error);
      }
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

    // Check if irrigation should be triggered automatically
    let shouldIrrigate = false;
    try {
      shouldIrrigate = await reading.shouldTriggerIrrigation();
      reading.irrigationTriggered = shouldIrrigate;
    } catch (error) {
      console.error("Error checking irrigation trigger:", error);
      reading.irrigationTriggered = false;
    }

    const savedReading = await reading.save();

    // Update zone's last irrigation if triggered
    if (shouldIrrigate) {
      await database.ZoneConfig.findOneAndUpdate(
        { zoneId },
        { lastIrrigation: new Date() }
      );
    }

    // CHECK FOR PENDING MANUAL COMMANDS
    let manualCommand = null;
    if (pendingCommands.has(sensor_id)) {
      manualCommand = pendingCommands.get(sensor_id);
      pendingCommands.delete(sensor_id); // Remove after retrieving
      console.log(
        `Sending manual command to ${sensor_id}: ${manualCommand.action}`
      );
    }

    // Prepare response
    const response = {
      success: true,
      data: savedReading,
      irrigationTriggered: shouldIrrigate,
      stageInfo: stageInfo,
      message: "Soil moisture reading saved successfully",
    };

    // Add manual command if exists
    if (manualCommand) {
      response.manualCommand = {
        action: manualCommand.action,
        timestamp: manualCommand.timestamp,
        trigger: "manual_web_app",
      };
    }

    res.status(201).json(response);
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

    // Get current moisture targets from growth stage with error handling
    let targets;
    try {
      targets = await zoneConfig.getCurrentMoistureTargets();
    } catch (error) {
      console.error("Error getting targets for ESP32 config:", error);
      targets = {
        minMoisture: zoneConfig.moistureThresholds.minMoisture,
        maxMoisture: zoneConfig.moistureThresholds.maxMoisture,
        source: "fallback_error",
      };
    }

    // Get crop profile for additional info
    const cropProfile = await database.CropProfile.findOne({
      cropType: zoneConfig.cropType,
    });

    // Calculate growth progress with validation
    let daysSincePlanting = 1;
    if (zoneConfig.plantingDate && !isNaN(zoneConfig.plantingDate.getTime())) {
      const calculated = Math.floor(
        (Date.now() - zoneConfig.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      daysSincePlanting = Math.max(1, calculated);
    }

    const configForESP32 = {
      zoneId: zoneConfig.zoneId,
      zoneName: zoneConfig.name,
      thresholds: {
        minMoisture: targets.minMoisture,
        maxMoisture: targets.maxMoisture,
      },
      irrigationSettings: zoneConfig.irrigationSettings,
      currentStage: targets.stageName || "Unknown",
      profileDay: daysSincePlanting,
      stageInfo: {
        name: targets.stageName,
        description: targets.stageDescription,
        dayInStage:
          targets.dayInStage && !isNaN(targets.dayInStage)
            ? Math.max(1, targets.dayInStage)
            : 1,
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
        try {
          const latestReading =
            await database.SoilMoistureReading.getLatestByZone(zone.zoneId);
          const stats = await database.SoilMoistureReading.getZoneStats(
            zone.zoneId,
            24
          );

          // Get current moisture targets with error handling
          let targets;
          try {
            targets = await zone.getCurrentMoistureTargets();
          } catch (error) {
            console.error(
              `Error getting targets for zone ${zone.zoneId}:`,
              error
            );
            targets = {
              minMoisture: zone.moistureThresholds.minMoisture,
              maxMoisture: zone.moistureThresholds.maxMoisture,
              source: "fallback_error",
            };
          }

          // Get crop profile
          const cropProfile = await database.CropProfile.findOne({
            cropType: zone.cropType,
          });

          // Calculate growth stage info with validation
          let daysSincePlanting = 1;
          let progress = 0;

          if (zone.plantingDate && !isNaN(zone.plantingDate.getTime())) {
            const calculated = Math.floor(
              (Date.now() - zone.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            daysSincePlanting = Math.max(1, calculated);

            if (cropProfile && cropProfile.duration > 0) {
              progress = Math.min(
                100,
                (daysSincePlanting / cropProfile.duration) * 100
              );
            }
          }

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
              daysSincePlanting,
              progress,
            },
          };
        } catch (error) {
          console.error(`Error processing zone ${zone.zoneId}:`, error);
          return {
            ...zone.toObject(),
            latestReading: null,
            stats: {
              readingCount: 0,
              averageMoisture: 0,
              minMoisture: 0,
              maxMoisture: 0,
            },
            currentTargets: {
              minMoisture: zone.moistureThresholds.minMoisture,
              maxMoisture: zone.moistureThresholds.maxMoisture,
              source: "fallback_error",
            },
            cropProfile: null,
            growthInfo: { daysSincePlanting: 1, progress: 0 },
          };
        }
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

// POST /api/soil/irrigation - Enhanced irrigation control with ESP32 commands
router.post("/irrigation", async (req, res) => {
  try {
    const { zone_id, action, relay_id, force_manual = false } = req.body;

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

    let targets;
    try {
      targets = await zoneConfig.getCurrentMoistureTargets();
    } catch (error) {
      console.error("Error getting targets for irrigation:", error);
      targets = {
        minMoisture: zoneConfig.moistureThresholds.minMoisture,
        maxMoisture: zoneConfig.moistureThresholds.maxMoisture,
        source: "fallback_error",
      };
    }

    const moistureLevel = latestReading ? latestReading.moisturePercentage : 0;

    // Calculate growth stage info with validation
    let daysSincePlanting = 1;
    if (zoneConfig.plantingDate && !isNaN(zoneConfig.plantingDate.getTime())) {
      const calculated = Math.floor(
        (Date.now() - zoneConfig.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      daysSincePlanting = Math.max(1, calculated);
    }

    // SEND COMMAND TO ESP32
    let commandSent = false;
    if (zoneConfig.sensorId) {
      // Store command for ESP32 to pick up on next reading
      const command = {
        action: action,
        timestamp: new Date(),
        zoneId: zone_id,
        trigger: force_manual ? "manual_override" : "manual",
      };

      pendingCommands.set(zoneConfig.sensorId, command);
      commandSent = true;

      console.log(
        `Queued ${action} command for ESP32 ${zoneConfig.sensorId} (Zone: ${zone_id})`
      );
    }

    // Log the irrigation action with enhanced context
    const irrigationLog = new database.IrrigationLog({
      zoneId: zone_id,
      relayId: relay_id || zoneConfig.relayId || "unknown",
      action,
      trigger: force_manual ? "manual_override" : "manual",
      moistureLevel,
      targetMoisture: targets.minMoisture,
      stageInfo: {
        stageName: targets.stageName,
        dayInStage:
          targets.dayInStage && !isNaN(targets.dayInStage)
            ? Math.max(1, targets.dayInStage)
            : 1,
        dayInCrop: daysSincePlanting,
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
        trigger: force_manual ? "manual_override" : "manual",
        moistureLevel,
        targetMoisture: targets.minMoisture,
        commandSent,
        sensorId: zoneConfig.sensorId,
        stageInfo: {
          stageName: targets.stageName,
          dayInStage:
            targets.dayInStage && !isNaN(targets.dayInStage)
              ? Math.max(1, targets.dayInStage)
              : 1,
          dayInCrop: daysSincePlanting,
        },
        timestamp: new Date(),
      },
      message: `Irrigation ${action} command ${
        commandSent ? "sent to ESP32" : "logged (no ESP32 connection)"
      }`,
    });
  } catch (error) {
    console.error("Error controlling irrigation:", error);
    res.status(500).json({
      error: "Failed to control irrigation",
      message: error.message,
    });
  }
});

// NEW: GET /api/soil/pending-commands/:sensorId - For ESP32 to check for commands
router.get("/pending-commands/:sensorId", async (req, res) => {
  try {
    const { sensorId } = req.params;

    if (pendingCommands.has(sensorId)) {
      const command = pendingCommands.get(sensorId);
      pendingCommands.delete(sensorId); // Remove after sending

      res.json({
        success: true,
        hasCommand: true,
        command: command,
      });
    } else {
      res.json({
        success: true,
        hasCommand: false,
      });
    }
  } catch (error) {
    console.error("Error checking pending commands:", error);
    res.status(500).json({
      error: "Failed to check pending commands",
      message: error.message,
    });
  }
});

// NEW: POST /api/soil/irrigation/bulk - Control multiple zones
router.post("/irrigation/bulk", async (req, res) => {
  try {
    const { action, zone_ids = [] } = req.body;

    if (!action || !["start", "stop"].includes(action)) {
      return res.status(400).json({
        error: "Invalid action. Must be 'start' or 'stop'",
      });
    }

    const results = [];
    const errors = [];

    // If no specific zones provided, get all zones
    let targetZones = zone_ids;
    if (targetZones.length === 0) {
      const allZones = await database.ZoneConfig.find({ isActive: true });
      targetZones = allZones.map((zone) => zone.zoneId);
    }

    // Process each zone
    for (const zoneId of targetZones) {
      try {
        const zoneConfig = await database.ZoneConfig.findOne({ zoneId });
        if (!zoneConfig) {
          errors.push({ zoneId, error: "Zone not found" });
          continue;
        }

        // Only process zones that have sensors assigned
        if (!zoneConfig.sensorId) {
          errors.push({ zoneId, error: "No sensor assigned" });
          continue;
        }

        // Queue command for ESP32
        const command = {
          action: action,
          timestamp: new Date(),
          zoneId: zoneId,
          trigger: "bulk_operation",
        };

        pendingCommands.set(zoneConfig.sensorId, command);

        // Log the action
        const irrigationLog = new database.IrrigationLog({
          zoneId: zoneId,
          relayId: zoneConfig.relayId || "unknown",
          action,
          trigger: "bulk_operation",
          moistureLevel: 0, // Will be updated by ESP32
          targetMoisture: zoneConfig.moistureThresholds.minMoisture,
        });

        await irrigationLog.save();

        // Update last irrigation time if starting
        if (action === "start") {
          await database.ZoneConfig.findOneAndUpdate(
            { zoneId },
            { lastIrrigation: new Date() }
          );
        }

        results.push({
          zoneId,
          sensorId: zoneConfig.sensorId,
          action,
          status: "queued",
        });
      } catch (error) {
        errors.push({ zoneId, error: error.message });
      }
    }

    res.json({
      success: true,
      data: {
        action,
        processed: results.length,
        queued: results,
        errors: errors,
      },
      message: `Bulk ${action} operation queued for ${results.length} zones`,
    });
  } catch (error) {
    console.error("Error in bulk irrigation control:", error);
    res.status(500).json({
      error: "Failed to execute bulk irrigation control",
      message: error.message,
    });
  }
});

// NEW: GET /api/soil/system/status - Overall system status
router.get("/system/status", async (req, res) => {
  try {
    const totalZones = await database.ZoneConfig.countDocuments({
      isActive: true,
    });
    const zonesWithSensors = await database.ZoneConfig.countDocuments({
      isActive: true,
      sensorId: { $ne: null, $ne: "" },
    });

    // Get recent irrigation activities
    const recentIrrigations = await database.IrrigationLog.find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .select("zoneId action trigger timestamp moistureLevel");

    // Count active irrigations (start without corresponding stop)
    const startLogs = await database.IrrigationLog.aggregate([
      { $match: { action: "start" } },
      { $sort: { zoneId: 1, timestamp: -1 } },
      { $group: { _id: "$zoneId", latestStart: { $first: "$$ROOT" } } },
    ]);

    const stopLogs = await database.IrrigationLog.aggregate([
      { $match: { action: "stop" } },
      { $sort: { zoneId: 1, timestamp: -1 } },
      { $group: { _id: "$zoneId", latestStop: { $first: "$$ROOT" } } },
    ]);

    const stopMap = new Map(
      stopLogs.map((log) => [log._id, log.latestStop.timestamp])
    );

    const activeIrrigations = startLogs.filter((startLog) => {
      const zoneId = startLog._id;
      const startTime = startLog.latestStart.timestamp;
      const stopTime = stopMap.get(zoneId);

      return !stopTime || startTime > stopTime;
    });

    // Get pending commands count
    const pendingCommandsCount = pendingCommands.size;

    res.json({
      success: true,
      data: {
        zones: {
          total: totalZones,
          withSensors: zonesWithSensors,
          withoutSensors: totalZones - zonesWithSensors,
        },
        irrigation: {
          activeZones: activeIrrigations.length,
          recentActivity: recentIrrigations,
        },
        commands: {
          pending: pendingCommandsCount,
          queuedSensors: Array.from(pendingCommands.keys()),
        },
        system: {
          uptime: process.uptime(),
          timestamp: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Error getting system status:", error);
    res.status(500).json({
      error: "Failed to get system status",
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

    // Calculate days with validation
    let daysSincePlanting = 1;
    if (zoneConfig.plantingDate && !isNaN(zoneConfig.plantingDate.getTime())) {
      const calculated = Math.floor(
        (Date.now() - zoneConfig.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      daysSincePlanting = Math.max(1, calculated);
    }

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
      ? Math.max(1, daysSincePlanting - currentStage.startDay + 1)
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
          daysSincePlanting,
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

    // Validate planting date
    let validPlantingDate = new Date();
    if (planting_date) {
      const parsedDate = new Date(planting_date);
      if (!isNaN(parsedDate.getTime())) {
        validPlantingDate = parsedDate;
      }
    }

    const zoneData = {
      zoneId: zone_id,
      name,
      fieldName: field_name || "Default Field",
      area: area || 100,
      cropType: crop_type,
      plantingDate: validPlantingDate,
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
      try {
        currentTargets = await zoneConfig.getCurrentMoistureTargets();
      } catch (error) {
        console.error("Error getting targets for status:", error);
        currentTargets = {
          minMoisture: zoneConfig.moistureThresholds.minMoisture,
          maxMoisture: zoneConfig.moistureThresholds.maxMoisture,
          source: "fallback_error",
        };
      }
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

// NEW: PUT /api/soil/zone/:zoneId - Update existing zone
router.put("/zone/:zoneId", async (req, res) => {
  try {
    const { zoneId } = req.params;
    const {
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

    const existingZone = await database.ZoneConfig.findOne({ zoneId });
    if (!existingZone) {
      return res.status(404).json({
        error: "Zone not found",
      });
    }

    // Validate planting date if provided
    let validPlantingDate = existingZone.plantingDate;
    if (planting_date) {
      const parsedDate = new Date(planting_date);
      if (!isNaN(parsedDate.getTime())) {
        validPlantingDate = parsedDate;
      }
    }

    const updateData = {
      ...(name && { name }),
      ...(field_name && { fieldName: field_name }),
      ...(area && { area: parseInt(area) }),
      ...(crop_type && { cropType: crop_type }),
      ...(validPlantingDate && { plantingDate: validPlantingDate }),
      ...(sensor_id !== undefined && { sensorId: sensor_id || null }),
      ...(relay_id !== undefined && { relayId: relay_id || null }),
    };

    // Update moisture thresholds if provided
    if (min_moisture !== undefined || max_moisture !== undefined) {
      updateData.moistureThresholds = {
        minMoisture:
          min_moisture !== undefined
            ? parseInt(min_moisture)
            : existingZone.moistureThresholds.minMoisture,
        maxMoisture:
          max_moisture !== undefined
            ? parseInt(max_moisture)
            : existingZone.moistureThresholds.maxMoisture,
      };
    }

    // Update irrigation settings if provided
    if (
      irrigation_duration !== undefined ||
      cooldown_minutes !== undefined ||
      use_static_thresholds !== undefined
    ) {
      updateData.irrigationSettings = {
        ...existingZone.irrigationSettings,
        ...(irrigation_duration !== undefined && {
          durationMinutes: parseInt(irrigation_duration),
        }),
        ...(cooldown_minutes !== undefined && {
          cooldownMinutes: parseInt(cooldown_minutes),
        }),
        ...(use_static_thresholds !== undefined && {
          useStaticThresholds: Boolean(use_static_thresholds),
        }),
      };
    }

    const updatedZone = await database.ZoneConfig.findOneAndUpdate(
      { zoneId },
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      data: updatedZone,
      message: "Zone updated successfully",
    });
  } catch (error) {
    console.error("Error updating zone:", error);
    res.status(500).json({
      error: "Failed to update zone",
      message: error.message,
    });
  }
});

// NEW: DELETE /api/soil/zone/:zoneId - Soft delete zone
router.delete("/zone/:zoneId", async (req, res) => {
  try {
    const { zoneId } = req.params;

    const zone = await database.ZoneConfig.findOne({ zoneId });
    if (!zone) {
      return res.status(404).json({
        error: "Zone not found",
      });
    }

    // Soft delete by setting isActive to false
    await database.ZoneConfig.findOneAndUpdate(
      { zoneId },
      { isActive: false, deletedAt: new Date() }
    );

    res.json({
      success: true,
      message: "Zone deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting zone:", error);
    res.status(500).json({
      error: "Failed to delete zone",
      message: error.message,
    });
  }
});

// NEW: GET /api/soil/readings/:zoneId - Get historical readings for a zone
router.get("/readings/:zoneId", async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { limit = 100, hours = 24, start_date, end_date } = req.query;

    let query = { zoneId };

    // Date range filter
    if (start_date || end_date || hours) {
      query.timestamp = {};

      if (start_date) {
        query.timestamp.$gte = new Date(start_date);
      } else if (hours) {
        query.timestamp.$gte = new Date(Date.now() - hours * 60 * 60 * 1000);
      }

      if (end_date) {
        query.timestamp.$lte = new Date(end_date);
      }
    }

    const readings = await database.SoilMoistureReading.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select(
        "moisturePercentage rawValue temperature timestamp relayStatus stageInfo"
      );

    const zone = await database.ZoneConfig.findOne({ zoneId });

    res.json({
      success: true,
      data: {
        zoneId,
        zoneName: zone?.name || "Unknown",
        count: readings.length,
        readings: readings.reverse(), // Return in chronological order
        query: {
          limit: parseInt(limit),
          hours: hours ? parseInt(hours) : null,
          start_date,
          end_date,
        },
      },
    });
  } catch (error) {
    console.error("Error getting readings:", error);
    res.status(500).json({
      error: "Failed to retrieve readings",
      message: error.message,
    });
  }
});

// NEW: GET /api/soil/analytics/:zoneId - Get analytics for a zone
router.get("/analytics/:zoneId", async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { days = 7 } = req.query;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get readings for the period
    const readings = await database.SoilMoistureReading.find({
      zoneId,
      timestamp: { $gte: startDate },
    }).sort({ timestamp: 1 });

    // Get irrigation logs for the period
    const irrigationLogs = await database.IrrigationLog.find({
      zoneId,
      timestamp: { $gte: startDate },
    }).sort({ timestamp: 1 });

    // Calculate daily statistics
    const dailyStats = {};
    readings.forEach((reading) => {
      const day = reading.timestamp.toISOString().split("T")[0];
      if (!dailyStats[day]) {
        dailyStats[day] = {
          date: day,
          readings: [],
          avgMoisture: 0,
          minMoisture: Infinity,
          maxMoisture: -Infinity,
          readingCount: 0,
        };
      }

      const moisture = reading.moisturePercentage;
      dailyStats[day].readings.push(moisture);
      dailyStats[day].minMoisture = Math.min(
        dailyStats[day].minMoisture,
        moisture
      );
      dailyStats[day].maxMoisture = Math.max(
        dailyStats[day].maxMoisture,
        moisture
      );
      dailyStats[day].readingCount++;
    });

    // Calculate averages
    Object.values(dailyStats).forEach((day) => {
      if (day.readings.length > 0) {
        day.avgMoisture = Math.round(
          day.readings.reduce((sum, val) => sum + val, 0) / day.readings.length
        );
      }
      delete day.readings; // Remove raw readings to reduce payload size
    });

    // Calculate irrigation efficiency
    const irrigationSessions = [];
    let currentSession = null;

    irrigationLogs.forEach((log) => {
      if (log.action === "start") {
        currentSession = {
          startTime: log.timestamp,
          startMoisture: log.moistureLevel,
          trigger: log.trigger,
        };
      } else if (log.action === "stop" && currentSession) {
        irrigationSessions.push({
          ...currentSession,
          endTime: log.timestamp,
          endMoisture: log.moistureLevel,
          duration: (log.timestamp - currentSession.startTime) / (1000 * 60), // minutes
          moistureIncrease: log.moistureLevel - currentSession.startMoisture,
        });
        currentSession = null;
      }
    });

    // Overall statistics
    const allMoisture = readings.map((r) => r.moisturePercentage);
    const overallStats = {
      totalReadings: readings.length,
      avgMoisture:
        allMoisture.length > 0
          ? Math.round(
              allMoisture.reduce((a, b) => a + b, 0) / allMoisture.length
            )
          : 0,
      minMoisture: allMoisture.length > 0 ? Math.min(...allMoisture) : 0,
      maxMoisture: allMoisture.length > 0 ? Math.max(...allMoisture) : 0,
      irrigationSessions: irrigationSessions.length,
      totalIrrigationTime: irrigationSessions.reduce(
        (sum, session) => sum + (session.duration || 0),
        0
      ),
      avgIrrigationDuration:
        irrigationSessions.length > 0
          ? irrigationSessions.reduce(
              (sum, session) => sum + (session.duration || 0),
              0
            ) / irrigationSessions.length
          : 0,
    };

    res.json({
      success: true,
      data: {
        zoneId,
        period: {
          days: parseInt(days),
          startDate,
          endDate: new Date(),
        },
        overallStats,
        dailyStats: Object.values(dailyStats).sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
        irrigationSessions: irrigationSessions.slice(-10), // Last 10 sessions
        trends: {
          moistureTrend:
            allMoisture.length >= 2
              ? allMoisture[allMoisture.length - 1] - allMoisture[0]
              : 0,
          irrigationFrequency: irrigationSessions.length / parseInt(days),
        },
      },
    });
  } catch (error) {
    console.error("Error getting analytics:", error);
    res.status(500).json({
      error: "Failed to retrieve analytics",
      message: error.message,
    });
  }
});

// NEW: POST /api/soil/command/direct - Send direct command to ESP32 (for testing)
router.post("/command/direct", async (req, res) => {
  try {
    const { sensor_id, action, priority = false } = req.body;

    if (!sensor_id || !action) {
      return res.status(400).json({
        error: "sensor_id and action are required",
      });
    }

    if (!["start", "stop", "status", "config"].includes(action)) {
      return res.status(400).json({
        error: "Invalid action. Must be 'start', 'stop', 'status', or 'config'",
      });
    }

    // Check if sensor exists
    const zone = await database.ZoneConfig.findOne({ sensorId: sensor_id });
    if (!zone) {
      return res.status(404).json({
        error: "No zone found with this sensor ID",
      });
    }

    const command = {
      action,
      timestamp: new Date(),
      zoneId: zone.zoneId,
      trigger: "direct_command",
      priority: Boolean(priority),
    };

    // If priority command, override any existing command
    if (priority || !pendingCommands.has(sensor_id)) {
      pendingCommands.set(sensor_id, command);
    } else {
      return res.status(409).json({
        error:
          "Command already queued for this sensor. Use priority=true to override.",
      });
    }

    res.json({
      success: true,
      data: {
        sensorId: sensor_id,
        zoneId: zone.zoneId,
        zoneName: zone.name,
        command,
        queued: true,
      },
      message: `Direct command '${action}' queued for sensor ${sensor_id}`,
    });
  } catch (error) {
    console.error("Error sending direct command:", error);
    res.status(500).json({
      error: "Failed to send direct command",
      message: error.message,
    });
  }
});

// NEW: GET /api/soil/commands/queue - View current command queue
router.get("/commands/queue", async (req, res) => {
  try {
    const queueArray = Array.from(pendingCommands.entries()).map(
      ([sensorId, command]) => ({
        sensorId,
        ...command,
        queuedFor:
          ((Date.now() - command.timestamp.getTime()) / 1000).toFixed(1) + "s",
      })
    );

    // Get zone info for each queued command
    const enrichedQueue = await Promise.all(
      queueArray.map(async (item) => {
        try {
          const zone = await database.ZoneConfig.findOne({
            sensorId: item.sensorId,
          });
          return {
            ...item,
            zoneName: zone?.name || "Unknown",
            zoneId: zone?.zoneId || "Unknown",
          };
        } catch (error) {
          return {
            ...item,
            zoneName: "Error",
            zoneId: "Error",
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        queueSize: pendingCommands.size,
        commands: enrichedQueue.sort((a, b) => a.timestamp - b.timestamp),
      },
    });
  } catch (error) {
    console.error("Error getting command queue:", error);
    res.status(500).json({
      error: "Failed to retrieve command queue",
      message: error.message,
    });
  }
});

// NEW: DELETE /api/soil/commands/clear - Clear command queue
router.delete("/commands/clear", async (req, res) => {
  try {
    const { sensor_id } = req.query;

    if (sensor_id) {
      // Clear specific sensor command
      const hadCommand = pendingCommands.has(sensor_id);
      pendingCommands.delete(sensor_id);

      res.json({
        success: true,
        message: hadCommand
          ? `Command cleared for sensor ${sensor_id}`
          : `No command found for sensor ${sensor_id}`,
        cleared: hadCommand ? 1 : 0,
      });
    } else {
      // Clear all commands
      const clearedCount = pendingCommands.size;
      pendingCommands.clear();

      res.json({
        success: true,
        message: `All commands cleared from queue`,
        cleared: clearedCount,
      });
    }
  } catch (error) {
    console.error("Error clearing commands:", error);
    res.status(500).json({
      error: "Failed to clear commands",
      message: error.message,
    });
  }
});

// NEW: GET /api/soil/health - Health check endpoint
router.get("/health", async (req, res) => {
  try {
    const dbStatus = await database.ZoneConfig.findOne().limit(1);

    res.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date(),
        database: dbStatus ? "connected" : "disconnected",
        commandQueue: {
          size: pendingCommands.size,
          sensors: Array.from(pendingCommands.keys()),
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: "1.0.0",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: {
        status: "unhealthy",
        timestamp: new Date(),
        error: error.message,
      },
    });
  }
});

module.exports = router;
