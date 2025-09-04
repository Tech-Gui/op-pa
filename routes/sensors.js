// routes/sensors.js
const express = require("express");
const router = express.Router();
const database = require("../database");

// ---- Single-zone setup ----
const HARD_ZONE_ID = "zone_001";

// Simple structured logger
const log = {
  info: (...args) => console.log(new Date().toISOString(), "[INFO]", ...args),
  warn: (...args) => console.warn(new Date().toISOString(), "[WARN]", ...args),
  error: (...args) =>
    console.error(new Date().toISOString(), "[ERROR]", ...args),
};

// Models
const PendingCommand = database.PendingCommand;

// ---------- helpers ----------
const coerceNumber = (v) => (typeof v === "number" ? v : Number(v));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const safeTankHeight = (cfg) => {
  const h = coerceNumber(cfg?.tankHeightCm);
  return Number.isFinite(h) && h > 0 ? h : 0;
};

// =========================================
// POST /api/sensors/reading
// =========================================
router.post("/reading", async (req, res) => {
  try {
    const { sensor_id, sensors, relays, location } = req.body;

    log.info("POST /api/sensors/reading received", {
      sensor_id,
      hasSensors: !!sensors,
      sensorKeys: sensors ? Object.keys(sensors) : [],
      relayKeys: relays ? Object.keys(relays) : [],
      location: location || null,
    });

    if (!sensor_id || !sensors) {
      return res.status(400).json({
        error: "Missing required fields: sensor_id and sensors",
      });
    }

    const responses = {};
    const errors = [];
    let manualCommand = null;

    // ===== Water: treat incoming as DISTANCE =====
    // Accepts sensors.water_distance (preferred) or sensors.water_level (legacy-as-distance).
    if (
      (sensors.water_distance && sensors.water_distance.valid) ||
      (sensors.water_level && sensors.water_level.valid)
    ) {
      try {
        const tankConfig = await database.TankConfig.findOne({
          sensorId: sensor_id,
        });

        if (!tankConfig) {
          responses.water = {
            success: false,
            error: "No tank configuration found for sensor",
          };
          log.warn("No tank configuration found for sensor", { sensor_id });
        } else {
          const tankHeight = safeTankHeight(tankConfig);
          const hasDistance = !!(
            sensors.water_distance && sensors.water_distance.valid
          );

          const raw = coerceNumber(
            hasDistance
              ? sensors.water_distance.value
              : sensors.water_level.value
          );

          const distanceCm = clamp(
            raw,
            0,
            tankHeight || Number.MAX_SAFE_INTEGER
          );
          const waterLevelCm =
            tankHeight > 0 ? clamp(tankHeight - distanceCm, 0, tankHeight) : 0;

          const result = await database.insertWaterReading({
            tankId: tankConfig.tankId,
            sensorId: sensor_id,
            distanceCm,
            waterLevelCm,
            relayStatus: relays?.water_pump || "unknown",
          });

          responses.water = {
            success: true,
            data: result.data,
            tankId: tankConfig.tankId,
          };

          log.info("Water reading processed", {
            sensor_id,
            tankId: tankConfig.tankId,
            tankHeightCm: tankHeight,
            usedField: hasDistance
              ? "water_distance"
              : "water_level(as distance)",
            distanceCm,
            waterLevelCm,
          });
        }
      } catch (error) {
        errors.push({ type: "water", error: error.message });
        log.error("Error processing water", {
          sensor_id,
          message: error.message,
          stack: error.stack,
        });
      }
    }

    // ===== Soil (single-zone) =====
    if (sensors.soil_moisture && sensors.soil_moisture.valid) {
      try {
        const zoneConfig = await database.ZoneConfig.findOne({
          zoneId: HARD_ZONE_ID,
        });

        if (zoneConfig) {
          let targets;
          try {
            targets = await zoneConfig.getCurrentMoistureTargets();
          } catch (error) {
            targets = {
              minMoisture: zoneConfig.moistureThresholds?.minMoisture,
              maxMoisture: zoneConfig.moistureThresholds?.maxMoisture,
              source: "fallback_error",
            };
            log.warn("Falling back to static moisture thresholds", {
              sensor_id,
              zoneId: zoneConfig.zoneId,
              message: error.message,
            });
          }

          const readingData = {
            zoneId: zoneConfig.zoneId,
            sensorId: sensor_id,
            moisturePercentage: sensors.soil_moisture.value,
            rawValue: 0,
            temperature: sensors.environmental?.temperature?.valid
              ? sensors.environmental.temperature.value
              : null,
            relayStatus: relays?.irrigation || "auto",
            stageInfo: {
              stageName: targets?.stageName,
              dayInStage: targets?.dayInStage,
              targetMinMoisture: targets?.minMoisture,
              targetMaxMoisture: targets?.maxMoisture,
            },
          };

          const reading = new database.SoilMoistureReading(readingData);

          let shouldIrrigate = false;
          try {
            shouldIrrigate = await reading.shouldTriggerIrrigation();
            reading.irrigationTriggered = shouldIrrigate;
          } catch (error) {
            reading.irrigationTriggered = false;
            log.warn(
              "Error determining irrigation trigger; defaulting to false",
              {
                sensor_id,
                zoneId: zoneConfig.zoneId,
                message: error.message,
              }
            );
          }

          const saved = await reading.save();

          if (shouldIrrigate) {
            await database.ZoneConfig.findOneAndUpdate(
              { zoneId: zoneConfig.zoneId },
              { lastIrrigation: new Date() }
            );
          }

          responses.soil = {
            success: true,
            data: saved,
            irrigationTriggered: shouldIrrigate,
            zoneId: zoneConfig.zoneId,
          };

          log.info("Soil moisture processed (single-zone)", {
            sensor_id,
            zoneId: zoneConfig.zoneId,
            irrigationTriggered: shouldIrrigate,
            moisture: sensors.soil_moisture.value,
          });
        } else {
          responses.soil = {
            success: false,
            error: `No zone configuration found for zoneId=${HARD_ZONE_ID}`,
          };
          log.warn("No zone configuration found for hardcoded zone", {
            sensor_id,
            zoneId: HARD_ZONE_ID,
          });
        }
      } catch (error) {
        errors.push({ type: "soil", error: error.message });
        log.error("Error processing soil moisture", {
          sensor_id,
          message: error.message,
          stack: error.stack,
        });
      }
    }

    // ===== Environmental =====
    if (sensors.environmental && sensors.environmental.valid) {
      try {
        const envData = {
          sensorId: sensor_id,
          location: location || "field_station_1",
          temperatureCelsius: sensors.environmental.temperature?.valid
            ? sensors.environmental.temperature.value
            : null,
          humidityPercent: sensors.environmental.humidity?.valid
            ? sensors.environmental.humidity.value
            : null,
          timestamp: new Date(),
        };

        const envReading = new database.EnvironmentalReading(envData);
        await envReading.save();

        responses.environmental = { success: true, data: envReading };

        log.info("Environmental data processed", {
          sensor_id,
          temperatureCelsius: envData.temperatureCelsius,
          humidityPercent: envData.humidityPercent,
          location: envData.location,
        });
      } catch (error) {
        errors.push({ type: "environmental", error: error.message });
        log.error("Error processing environmental data", {
          sensor_id,
          message: error.message,
          stack: error.stack,
        });
      }
    }

    // ===== Atomically pop a queued command for this sensor =====
    const popped = await PendingCommand.findOneAndUpdate(
      { sensorId: sensor_id, status: "queued" },
      { $set: { status: "dequeued", dequeuedAt: new Date() } },
      { sort: { createdAt: 1 }, new: true }
    );
    if (popped) {
      manualCommand = {
        action: popped.action,
        target: popped.target,
        trigger: popped.trigger,
        timestamp: popped.createdAt,
      };
    }

    // ===== Response =====
    const response = {
      success: true,
      sensor_id,
      responses,
      errors: errors.length > 0 ? errors : undefined,
      message: "Multi-sensor reading processed",
      timestamp: new Date(),
    };
    if (manualCommand) response.manualCommand = manualCommand;

    log.info("POST /api/sensors/reading success", {
      sensor_id,
      hasErrors: errors.length > 0,
      errorCount: errors.length,
      includedCommand: !!manualCommand,
    });

    res.status(201).json(response);
  } catch (error) {
    log.error("Error processing unified sensor reading", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: "Failed to process sensor reading",
      message: error.message,
    });
  }
});

// =========================================
// GET /api/sensors/pending-commands/:sensorId
// =========================================
router.get("/pending-commands/:sensorId", async (req, res) => {
  try {
    const { sensorId } = req.params;

    const cmd = await PendingCommand.findOneAndUpdate(
      { sensorId, status: "queued" },
      { $set: { status: "dequeued", dequeuedAt: new Date() } },
      { sort: { createdAt: 1 }, new: true }
    );

    if (cmd) {
      return res.json({
        success: true,
        hasCommand: true,
        manualCommand: {
          action: cmd.action,
          target: cmd.target,
          trigger: cmd.trigger,
          timestamp: cmd.createdAt,
        },
      });
    }

    res.json({ success: true, hasCommand: false });
  } catch (error) {
    res.status(500).json({
      error: "Failed to check pending commands",
      message: error.message,
    });
  }
});

// =========================================
// POST /api/sensors/command
// =========================================
router.post("/command", async (req, res) => {
  try {
    const { sensor_id, action, target, trigger = "manual" } = req.body;

    log.info("POST /api/sensors/command received", {
      sensor_id,
      action,
      target,
      trigger,
    });

    if (!sensor_id || !action || !target) {
      return res
        .status(400)
        .json({ error: "Missing required fields: sensor_id, action, target" });
    }
    if (!["start", "stop"].includes(action)) {
      return res
        .status(400)
        .json({ error: "Invalid action. Must be 'start' or 'stop'" });
    }
    if (!["water_pump", "irrigation"].includes(target)) {
      return res.status(400).json({
        error: "Invalid target. Must be 'water_pump' or 'irrigation'",
      });
    }

    const cmd = await PendingCommand.create({
      sensorId: sensor_id,
      action,
      target,
      trigger,
      status: "queued",
    });

    log.info("Queued command (DB)", { sensor_id, action, target, trigger });

    res.json({
      success: true,
      data: {
        id: cmd._id,
        sensorId: sensor_id,
        action,
        target,
        trigger,
        queued: true,
        timestamp: cmd.createdAt,
      },
      message: `Command queued for nRF9160 sensor ${sensor_id}`,
    });
  } catch (error) {
    log.error("Error queuing unified command", {
      message: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .json({ error: "Failed to queue command", message: error.message });
  }
});

// =========================================
// POST /api/sensors/command/ack  (optional but recommended)
// body: { sensor_id, action, target, success: boolean }
// =========================================
router.post("/command/ack", async (req, res) => {
  try {
    const { sensor_id, action, target, success = true } = req.body;

    const doc = await PendingCommand.findOneAndUpdate(
      { sensorId: sensor_id, action, target, status: "dequeued" },
      {
        $set: {
          status: success ? "executed" : "dequeued",
          executedAt: success ? new Date() : null,
        },
      },
      { sort: { dequeuedAt: -1 }, new: true }
    );

    return res.json({ success: true, updated: !!doc });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================
// GET /api/sensors/status/:sensorId
// =========================================
router.get("/status/:sensorId", async (req, res) => {
  try {
    const { sensorId } = req.params;

    const tankConfig = await database.TankConfig.findOne({ sensorId });
    const zoneConfig = await database.ZoneConfig.findOne({
      zoneId: HARD_ZONE_ID,
    });

    let waterStatus = null;
    let soilStatus = null;

    if (tankConfig) {
      const latestWaterReading = await database.getLatestWaterReading(
        tankConfig.tankId
      );
      waterStatus = {
        tankId: tankConfig.tankId,
        location: tankConfig.location,
        tankHeightCm: tankConfig.tankHeightCm, // for UI %
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

    const queuedCount = await PendingCommand.countDocuments({
      sensorId,
      status: "queued",
    });

    res.json({
      success: true,
      data: {
        sensorId,
        water: waterStatus,
        soil: soilStatus,
        hasPendingCommands: queuedCount > 0,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to get sensor status", message: error.message });
  }
});

// =========================================
// GET /api/sensors/history/:sensorId
// ?param=temperature|humidity|soil|water_level|water_distance|all
// &from&to&agg=raw|min|max|avg&interval=15m|1h|2d|1w
// =========================================
router.get("/history/:sensorId", async (req, res) => {
  const { sensorId } = req.params;

  const { param = "all", from, to, agg = "raw", interval = "1h" } = req.query;

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

  if (isNaN(start.getTime()) || isNaN(end.getTime()))
    return res.status(400).json({
      success: false,
      error: "Invalid 'from' or 'to' date. Use ISO timestamps.",
    });
  if (start > end)
    return res
      .status(400)
      .json({ success: false, error: "'from' must be <= 'to'" });

  const aggNorm = String(agg).toLowerCase();
  const allowedAgg = new Set(["raw", "min", "max", "avg"]);
  if (!allowedAgg.has(aggNorm))
    return res.status(400).json({
      success: false,
      error: "Invalid 'agg'. Use raw, min, max, or avg",
    });

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
  const resolved =
    ALIASES[String(param).toLowerCase()] || String(param).toLowerCase();

  const SERIES = {
    temperature: {
      collection: () => database.EnvironmentalReading,
      field: "temperatureCelsius",
      matchBy: "sensor",
    },
    humidity: {
      collection: () => database.EnvironmentalReading,
      field: "humidityPercent",
      matchBy: "sensor",
    },
    soil: {
      collection: () => database.SoilMoistureReading,
      field: "moisturePercentage",
      matchBy: "sensor",
    },
    water_level: {
      collection: () => database.WaterReading,
      field: "waterLevelCm",
      matchBy: "tank",
    },
    water_distance: {
      collection: () => database.WaterReading,
      field: "distanceCm",
      matchBy: "tank",
    },
  };

  const timeMatch = {
    $or: [
      { timestamp: { $gte: start, $lte: end } },
      { createdAt: { $gte: start, $lte: end } },
    ],
  };

  const buildAggWithMatch = (field, match) => {
    if (aggNorm === "raw") {
      return [
        { $match: match },
        { $addFields: { ts: { $ifNull: ["$timestamp", "$createdAt"] } } },
        { $sort: { ts: 1 } },
        { $project: { _id: 0, ts: 1, value: `$${field}` } },
      ];
    }
    return [
      { $match: match },
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

  const tankConfigForSensor = async (sid) => {
    try {
      return await database.TankConfig.findOne({ sensorId: sid });
    } catch {
      return null;
    }
  };

  const fetchSeries = async (key) => {
    const spec = SERIES[key];
    if (!spec) throw new Error(`Unknown series: ${key}`);
    const Model = spec.collection();

    let match;
    if (spec.matchBy === "tank") {
      const tcfg = await tankConfigForSensor(sensorId);
      if (!tcfg) return [];
      match = { tankId: tcfg.tankId, ...timeMatch };
    } else {
      match = { sensorId, ...timeMatch };
    }

    return Model.aggregate(buildAggWithMatch(spec.field, match));
  };

  try {
    let result;
    if (resolved === "all") {
      const keys = Object.keys(SERIES);
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
        interval: `${binSize}${unit[0]}`,
      },
      readings: result,
    });
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ success: false, error: "Failed to fetch history" });
  }
});

// =========================================
// GET /api/sensors/health
// =========================================
router.get("/health", async (req, res) => {
  try {
    const totalSensors =
      (await database.TankConfig.countDocuments({ sensorId: { $ne: null } })) +
      (await database.ZoneConfig.countDocuments({ sensorId: { $ne: null } }));

    const queued = await PendingCommand.aggregate([
      { $match: { status: "queued" } },
      { $group: { _id: "$sensorId", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        status: "healthy",
        totalConfiguredSensors: totalSensors,
        pendingCommands: queued.reduce((a, b) => a + b.count, 0),
        queuedSensors: queued.map((d) => d._id),
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
