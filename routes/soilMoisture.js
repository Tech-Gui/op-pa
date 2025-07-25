const express = require("express");
const router = express.Router();
const database = require("../database");

// POST /api/soil/reading - Submit new soil moisture reading
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
    if (!zoneId && sensor_id) {
      const zoneConfig = await database.ZoneConfig.findOne({
        sensorId: sensor_id,
      });
      if (zoneConfig) {
        zoneId = zoneConfig.zoneId;
      }
    }

    if (!zoneId) {
      return res.status(400).json({
        error:
          "Could not determine zone. Please assign sensor to a zone first.",
      });
    }

    const readingData = {
      zoneId,
      sensorId: sensor_id,
      moisturePercentage: parseFloat(moisture_percentage),
      rawValue: raw_value || 0,
      temperature: temperature || null,
      relayStatus: relay_status || "auto",
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

// GET /api/soil/latest - Get latest reading for a zone
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

// GET /api/soil/zone-config - Get configuration for ESP32
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

    // Calculate current growth stage
    const plantingDate = new Date(zoneConfig.plantingDate);
    const today = new Date();
    const daysSincePlanting = Math.floor(
      (today - plantingDate) / (1000 * 60 * 60 * 24)
    );

    // Get crop profile
    const cropProfile = await database.CropProfile.findOne({
      cropType: zoneConfig.cropType,
    });

    let currentStage = null;
    let updatedThresholds = zoneConfig.moistureThresholds;

    if (cropProfile) {
      let daysSoFar = 0;
      for (let stage of cropProfile.stages) {
        if (daysSincePlanting <= daysSoFar + stage.days) {
          currentStage = stage;
          updatedThresholds = {
            minMoisture: stage.minMoisture,
            maxMoisture: stage.maxMoisture,
          };
          break;
        }
        daysSoFar += stage.days;
      }
    }

    const configForESP32 = {
      zoneId: zoneConfig.zoneId,
      zoneName: zoneConfig.name,
      thresholds: updatedThresholds,
      irrigationSettings: zoneConfig.irrigationSettings,
      currentStage: currentStage ? currentStage.name : "Unknown",
      profileDay: Math.max(1, daysSincePlanting),
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

// POST /api/soil/zone - Create or update zone configuration
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

// GET /api/soil/zones - Get all zones
router.get("/zones", async (req, res) => {
  try {
    const zones = await database.ZoneConfig.find({ isActive: true }).sort({
      createdAt: 1,
    });

    // Get latest readings for each zone
    const zonesWithReadings = await Promise.all(
      zones.map(async (zone) => {
        const latestReading =
          await database.SoilMoistureReading.getLatestByZone(zone.zoneId);
        const stats = await database.SoilMoistureReading.getZoneStats(
          zone.zoneId,
          24
        );

        return {
          ...zone.toObject(),
          latestReading,
          stats,
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

// POST /api/soil/irrigation - Control irrigation manually
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

    // Get latest moisture reading
    const latestReading = await database.SoilMoistureReading.getLatestByZone(
      zone_id
    );
    const moistureLevel = latestReading ? latestReading.moisturePercentage : 0;

    // Log the irrigation action
    const irrigationLog = new database.IrrigationLog({
      zoneId: zone_id,
      relayId: relay_id || zoneConfig.relayId || "unknown",
      action,
      trigger: "manual",
      moistureLevel,
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

// GET /api/soil/irrigation/status - Get current irrigation status for zone
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

    res.json({
      success: true,
      data: {
        zoneId: zone_id,
        isIrrigating,
        irrigationStartTime,
        latestReading,
        zoneConfig: zoneConfig
          ? {
              thresholds: zoneConfig.moistureThresholds,
              irrigationSettings: zoneConfig.irrigationSettings,
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
