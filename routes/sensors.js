const express = require("express");
const router = express.Router();
const database = require("../database");

// Access to pending command maps (you may need to export these from the route files)
// For now, we'll create our own unified pending commands map
const pendingUnifiedCommands = new Map();

// POST /api/sensors/reading - Unified endpoint for nRF9160 multi-sensor gateway
router.post("/reading", async (req, res) => {
  try {
    // MODIFICATION: Removed 'timestamp' from the destructuring
    const { sensor_id, sensors, relays, location } = req.body;

    if (!sensor_id || !sensors) {
      return res.status(400).json({
        error: "Missing required fields: sensor_id and sensors",
      });
    }

    const responses = {};
    const errors = [];
    let hasCommands = false;
    let manualCommand = null;

    // Process Water Level Data
    if (sensors.water_level && sensors.water_level.valid) {
      try {
        // Convert water level (cm) to distance for the water API
        // Assuming we need to find tank config first
        const tankConfig = await database.TankConfig.findOne({
          sensorId: sensor_id,
        });

        if (tankConfig) {
          const distance_cm = Math.max(
            0,
            tankConfig.tankHeightCm - sensors.water_level.value
          );

          const waterData = {
            distance_cm: distance_cm,
            tank_id: tankConfig.tankId,
            relay_status: relays.water_pump || "unknown",
            sensor_id: sensor_id,
          };

          // Call water reading endpoint logic internally
          const result = await database.insertWaterReading({
            tankId: tankConfig.tankId,
            sensorId: sensor_id,
            distanceCm: distance_cm,
            waterLevelCm: sensors.water_level.value,
            relayStatus: relays.water_pump || "unknown",
          });

          responses.water = {
            success: true,
            data: result.data,
            tankId: tankConfig.tankId,
          };
        } else {
          responses.water = {
            success: false,
            error: "No tank configuration found for sensor",
          };
        }
      } catch (error) {
        errors.push({ type: "water", error: error.message });
      }
    }

    // Process Soil Moisture Data
    if (sensors.soil_moisture && sensors.soil_moisture.valid) {
      try {
        const zoneConfig = await database.ZoneConfig.findOne({
          sensorId: sensor_id,
        });

        if (zoneConfig) {
          // Get current moisture targets
          let targets;
          try {
            targets = await zoneConfig.getCurrentMoistureTargets();
          } catch (error) {
            targets = {
              minMoisture: zoneConfig.moistureThresholds.minMoisture,
              maxMoisture: zoneConfig.moistureThresholds.maxMoisture,
              source: "fallback_error",
            };
          }

          const readingData = {
            zoneId: zoneConfig.zoneId,
            sensorId: sensor_id,
            moisturePercentage: sensors.soil_moisture.value,
            rawValue: 0, // Not provided by nRF9160
            temperature: sensors.environmental?.temperature?.valid
              ? sensors.environmental.temperature.value
              : null,
            relayStatus: relays.irrigation || "auto",
            stageInfo: {
              stageName: targets.stageName,
              dayInStage: targets.dayInStage,
              targetMinMoisture: targets.minMoisture,
              targetMaxMoisture: targets.maxMoisture,
            },
          };

          const reading = new database.SoilMoistureReading(readingData);

          // Check if irrigation should be triggered
          let shouldIrrigate = false;
          try {
            shouldIrrigate = await reading.shouldTriggerIrrigation();
            reading.irrigationTriggered = shouldIrrigate;
          } catch (error) {
            reading.irrigationTriggered = false;
          }

          const savedReading = await reading.save();

          if (shouldIrrigate) {
            await database.ZoneConfig.findOneAndUpdate(
              { zoneId: zoneConfig.zoneId },
              { lastIrrigation: new Date() }
            );
          }

          responses.soil = {
            success: true,
            data: savedReading,
            irrigationTriggered: shouldIrrigate,
            zoneId: zoneConfig.zoneId,
          };
        } else {
          responses.soil = {
            success: false,
            error: "No zone configuration found for sensor",
          };
        }
      } catch (error) {
        errors.push({ type: "soil", error: error.message });
      }
    }

    // Process Environmental Data
    if (sensors.environmental && sensors.environmental.valid) {
      try {
        const envData = {
          sensorId: sensor_id,
          location: location || "field_station_1",
          temperatureCelsius: sensors.environmental.temperature?.valid // <--- Corrected name
            ? sensors.environmental.temperature.value
            : null,
          humidityPercent: sensors.environmental.humidity?.valid // <--- Corrected name
            ? sensors.environmental.humidity.value
            : null,
          timestamp: new Date(),
        };

        // Save environmental data (you may need to create this schema)
        const envReading = new database.EnvironmentalReading(envData);
        await envReading.save();

        responses.environmental = {
          success: true,
          data: envReading,
        };
      } catch (error) {
        errors.push({ type: "environmental", error: error.message });
      }
    }

    // Check for pending commands
    if (pendingUnifiedCommands.has(sensor_id)) {
      manualCommand = pendingUnifiedCommands.get(sensor_id);
      pendingUnifiedCommands.delete(sensor_id);
      hasCommands = true;
    }

    // Prepare response
    const response = {
      success: true,
      sensor_id: sensor_id,
      responses: responses,
      errors: errors.length > 0 ? errors : undefined,
      message: "Multi-sensor reading processed",
      timestamp: new Date(), // Backend generates its own timestamp for the response
    };

    // Add manual command if exists
    if (manualCommand) {
      response.manualCommand = manualCommand;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("Error processing unified sensor reading:", error);
    res.status(500).json({
      error: "Failed to process sensor reading",
      message: error.message,
    });
  }
});

// GET /api/sensors/pending-commands/:sensorId - Check for pending commands across all systems
router.get("/pending-commands/:sensorId", async (req, res) => {
  try {
    const { sensorId } = req.params;

    // Check if there are any pending commands for this sensor
    if (pendingUnifiedCommands.has(sensorId)) {
      const command = pendingUnifiedCommands.get(sensorId);
      pendingUnifiedCommands.delete(sensorId);

      res.json({
        success: true,
        hasCommand: true,
        manualCommand: command,
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

// POST /api/sensors/command - Send command to nRF9160 (unified command interface)
router.post("/command", async (req, res) => {
  try {
    const { sensor_id, action, target, trigger = "manual" } = req.body;

    if (!sensor_id || !action || !target) {
      return res.status(400).json({
        error: "Missing required fields: sensor_id, action, target",
      });
    }

    if (!["start", "stop"].includes(action)) {
      return res.status(400).json({
        error: "Invalid action. Must be 'start' or 'stop'",
      });
    }

    if (!["water_pump", "irrigation"].includes(target)) {
      return res.status(400).json({
        error: "Invalid target. Must be 'water_pump' or 'irrigation'",
      });
    }

    // Store unified command
    const command = {
      action: action,
      target: target,
      trigger: trigger,
      timestamp: new Date(),
    };

    pendingUnifiedCommands.set(sensor_id, command);

    console.log(
      `Queued ${action} command for ${target} on sensor ${sensor_id}`
    );

    res.json({
      success: true,
      data: {
        sensorId: sensor_id,
        action: action,
        target: target,
        trigger: trigger,
        queued: true,
        timestamp: new Date(),
      },
      message: `Command queued for nRF9160 sensor ${sensor_id}`,
    });
  } catch (error) {
    console.error("Error queuing unified command:", error);
    res.status(500).json({
      error: "Failed to queue command",
      message: error.message,
    });
  }
});

// GET /api/sensors/status/:sensorId - Get comprehensive status for a sensor
router.get("/status/:sensorId", async (req, res) => {
  try {
    const { sensorId } = req.params;

    // Get latest readings from all sensor types
    const tankConfig = await database.TankConfig.findOne({ sensorId });
    const zoneConfig = await database.ZoneConfig.findOne({ sensorId });

    let waterStatus = null;
    let soilStatus = null;

    if (tankConfig) {
      const latestWaterReading = await database.getLatestWaterReading(
        tankConfig.tankId
      );
      waterStatus = {
        tankId: tankConfig.tankId,
        location: tankConfig.location,
        latestReading: latestWaterReading,
      };
    }

    if (zoneConfig) {
      const latestSoilReading =
        await database.SoilMoistureReading.getLatestByZone(zoneConfig.zoneId);
      soilStatus = {
        zoneId: zoneConfig.zoneId,
        zoneName: zoneConfig.name,
        latestReading: latestSoilReading,
      };
    }

    res.json({
      success: true,
      data: {
        sensorId: sensorId,
        water: waterStatus,
        soil: soilStatus,
        hasPendingCommands: pendingUnifiedCommands.has(sensorId),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Error getting sensor status:", error);
    res.status(500).json({
      error: "Failed to get sensor status",
      message: error.message,
    });
  }
});
// GET /api/sensors/history/:sensorId
// ?param=temperature|humidity|soil|water_level|water_distance|all
// &from&to&agg=raw|min|max|avg&interval=15m|1h|2d|1w
router.get("/history/:sensorId", async (req, res) => {
  const { sensorId } = req.params;

  // normalize + defaults
  const { param = "all", from, to, agg = "raw", interval = "1h" } = req.query;

  // ---- helpers ----
  const parseInterval = (s) => {
    const m = String(s || "1h")
      .trim()
      .match(/^(\d+)\s*([smhdw])$/i);
    const units = { s: "second", m: "minute", h: "hour", d: "day", w: "week" };
    if (!m) return { unit: "hour", binSize: 1 };
    return { unit: units[m[2].toLowerCase()], binSize: parseInt(m[1], 10) };
  };

  const { unit, binSize } = parseInterval(interval);

  const start = from
    ? new Date(from)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = to ? new Date(to) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      success: false,
      error: "Invalid 'from' or 'to' date. Use ISO timestamps.",
    });
  }
  if (start > end) {
    return res.status(400).json({
      success: false,
      error: "'from' must be <= 'to'",
    });
  }

  const aggNorm = String(agg).toLowerCase();
  const allowedAgg = new Set(["raw", "min", "max", "avg"]);
  if (!allowedAgg.has(aggNorm)) {
    return res.status(400).json({
      success: false,
      error: "Invalid 'agg'. Use raw, min, max, or avg",
    });
  }

  // param aliases
  const paramNorm = String(param).toLowerCase();
  const ALIASES = {
    temp: "temperature",
    temps: "temperature",
    humidity: "humidity",
    humid: "humidity",
    soil: "soil",
    soil_moisture: "soil",
    moisture: "soil",
    water: "water_level",
    level: "water_level",
    waterlevel: "water_level",
    distance: "water_distance",
    waterdistance: "water_distance",
    all: "all",
    temperature: "temperature",
    water_level: "water_level",
    water_distance: "water_distance",
  };
  const resolved = ALIASES[paramNorm] || paramNorm;

  // where we pull each series from + which field to aggregate
  const SERIES = {
    temperature: {
      collection: () => database.EnvironmentalReading,
      field: "temperatureCelsius",
    },
    humidity: {
      collection: () => database.EnvironmentalReading,
      field: "humidityPercent",
    },
    soil: {
      collection: () => database.SoilMoistureReading,
      field: "moisturePercentage",
    },
    water_level: {
      collection: () => database.WaterReading,
      field: "waterLevelCm",
    },
    water_distance: {
      collection: () => database.WaterReading,
      field: "distanceCm",
    },
  };

  // shared time / sensor match (supports either 'timestamp' or 'createdAt')
  const baseMatch = {
    sensorId,
    $or: [
      { timestamp: { $gte: start, $lte: end } },
      { createdAt: { $gte: start, $lte: end } },
    ],
  };

  // build a pipeline for a given numeric field
  const buildAgg = (field) => {
    if (aggNorm === "raw") {
      return [
        { $match: baseMatch },
        { $addFields: { ts: { $ifNull: ["$timestamp", "$createdAt"] } } },
        { $sort: { ts: 1 } },
        { $project: { _id: 0, ts: 1, value: `$${field}` } },
      ];
    }
    return [
      { $match: baseMatch },
      { $addFields: { ts: { $ifNull: ["$timestamp", "$createdAt"] } } },
      {
        $group: {
          _id: { $dateTrunc: { date: "$ts", unit, binSize } },
          avg: { $avg: `$${field}` },
          min: { $min: `$${field}` },
          max: { $max: `$${field}` },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          ts: "$_id",
          value:
            aggNorm === "avg" ? "$avg" : aggNorm === "min" ? "$min" : "$max",
        },
      },
    ];
  };

  const fetchSeries = async (key) => {
    const spec = SERIES[key];
    if (!spec) {
      throw new Error(`Unknown series: ${key}`);
    }
    const Model = spec.collection();
    return Model.aggregate(buildAgg(spec.field));
  };

  try {
    let result;

    if (resolved === "all") {
      const keys = Object.keys(SERIES); // temp, humidity, soil, water_level, water_distance
      const data = await Promise.all(keys.map((k) => fetchSeries(k)));
      result = keys.reduce((acc, k, idx) => {
        acc[k] = data[idx];
        return acc;
      }, {});
    } else if (SERIES[resolved]) {
      result = await fetchSeries(resolved);
    } else {
      return res.status(400).json({
        success: false,
        error:
          "Invalid 'param'. Use temperature, humidity, soil, water_level, water_distance, or all",
      });
    }

    res.json({
      success: true,
      query: {
        sensorId,
        param: resolved,
        from: start.toISOString(),
        to: end.toISOString(),
        agg: aggNorm,
        interval: `${binSize}${unit[0]}`, // echo "1h" style
      },
      readings: result,
    });
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ success: false, error: "Failed to fetch history" });
  }
});

// GET /api/sensors/health - Health check for sensors system
router.get("/health", async (req, res) => {
  try {
    const totalSensors =
      (await database.TankConfig.countDocuments({ sensorId: { $ne: null } })) +
      (await database.ZoneConfig.countDocuments({ sensorId: { $ne: null } }));

    res.json({
      success: true,
      data: {
        status: "healthy",
        totalConfiguredSensors: totalSensors,
        pendingCommands: pendingUnifiedCommands.size,
        queuedSensors: Array.from(pendingUnifiedCommands.keys()),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Sensors system unhealthy",
      message: error.message,
    });
  }
});

module.exports = router;
