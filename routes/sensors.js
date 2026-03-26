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
    const { sensor_id, sensors, relays, automation, config, location } = req.body;

    log.info("POST /api/sensors/reading received", {
      sensor_id,
      hasSensors: !!sensors,
      hasAutomation: !!automation,
      hasConfig: !!config,
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
          // PROACTIVE FIX: If this is the only sensor and we have a main_tank unassigned, link them.
          const mainTank = await database.TankConfig.findOne({ tankId: "main_tank" });
          if (mainTank && (!mainTank.sensorId || mainTank.sensorId === "unassigned")) {
            mainTank.sensorId = sensor_id;
            await mainTank.save();
            log.info("Auto-assigned sensor to main_tank", { sensor_id });
            tankConfig = mainTank; // Continue processing with this tank
          }
        }

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

          responses.water_processed = true; // Mark as processed for this request

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

          responses.soil_processed = true; // Mark as processed for this request

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

    // ===== FALLBACK: PROCESS RELAY STATUS & AUTOMATION EVEN IF SENSORS WERE INVALID =====
    try {
      // 1. Sync Automation / Config Settings
      if (automation || config) {
        const updates = {};
        if (automation?.water_pump)
          updates.automationEnabled = automation.water_pump === "on";
        if (config?.report_interval)
          updates.reportInterval = config.report_interval;

        if (Object.keys(updates).length > 0) {
          await database.TankConfig.findOneAndUpdate(
            { sensorId: sensor_id },
            { $set: updates }
          );
        }

        if (automation?.irrigation) {
          await database.ZoneConfig.findOneAndUpdate(
            { zoneId: HARD_ZONE_ID },
            { $set: { automationEnabled: automation.irrigation === "on" } }
          );
        }
      }

      // 2. Record Water Pump Status if not already done
      if (relays?.water_pump && !responses.water_processed) {
        const tankConfig = await database.TankConfig.findOne({
          sensorId: sensor_id,
        });
        if (tankConfig) {
          await database.insertWaterReading({
            tankId: tankConfig.tankId,
            sensorId: sensor_id,
            distanceCm: null,
            waterLevelCm: null,
            relayStatus: relays.water_pump,
            isStatusOnly: true,
          });
          log.info("Recorded relay-only water status update", {
            sensor_id,
            status: relays.water_pump,
          });
        }
      }

      // 3. Record Irrigation Status if not already done
      if (relays?.irrigation && !responses.soil_processed) {
        await new database.SoilMoistureReading({
          zoneId: HARD_ZONE_ID,
          sensorId: sensor_id,
          moisturePercentage: null,
          relayStatus: relays.irrigation,
          isStatusOnly: true,
        }).save();
        log.info("Recorded relay-only soil status update", {
          sensor_id,
          status: relays.irrigation,
        });
      }
    } catch (err) {
      log.error("Error in relay/automation fallback sync", {
        error: err.message,
      });
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
        trigger: popped.action === "set_automation" || popped.action === "set_interval" ? popped.value : popped.trigger,
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
          trigger: cmd.action === "set_automation" || cmd.action === "set_interval" ? cmd.value : cmd.trigger,
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
    if (!["start", "stop", "set_automation"].includes(action)) {
      return res
        .status(400)
        .json({ error: "Invalid action. Must be 'start', 'stop', or 'set_automation'" });
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

    // ENFORCE AUTOMATION OVERRIDE: 
    // If a manual start/stop command is sent, ensure we also disable automation
    if (action === "start" || action === "stop") {
      try {
        await PendingCommand.create({
          sensorId: sensor_id,
          action: "set_automation",
          target,
          trigger: "manual_override",
          value: "off",
          status: "queued",
        });

        if (target === "water_pump") {
          await database.TankConfig.findOneAndUpdate(
            { sensorId: sensor_id },
            { $set: { automationEnabled: false } }
          );
        } else if (target === "irrigation") {
          // Applies to the default/hardcoded zone
          await database.ZoneConfig.findOneAndUpdate(
            {},
            { $set: { automationEnabled: false } }
          );
        }
        log.info("Queued automation override and updated DB", { target });
      } catch (err) {
        log.error("Failed to apply automation override", { error: err.message });
      }
    }

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
// POST /api/sensors/automation
// =========================================
router.post("/automation", async (req, res) => {
  try {
    const { sensor_id, target, enabled } = req.body;

    log.info("POST /api/sensors/automation received", {
      sensor_id,
      target,
      enabled,
    });

    if (!sensor_id || !target || typeof enabled !== "boolean") {
      return res.status(400).json({
        error:
          "Missing required fields: sensor_id, target (water_pump|irrigation), enabled (boolean)",
      });
    }
    if (!["water_pump", "irrigation"].includes(target)) {
      return res.status(400).json({
        error: "Invalid target. Must be 'water_pump' or 'irrigation'",
      });
    }

    const cmd = await PendingCommand.create({
      sensorId: sensor_id,
      action: "set_automation",
      target,
      trigger: "manual",
      value: enabled ? "on" : "off",
      status: "queued",
    });

    log.info("Queued automation command (DB)", {
      sensor_id,
      target,
      enabled,
    });

    res.json({
      success: true,
      data: {
        id: cmd._id,
        sensorId: sensor_id,
        action: "set_automation",
        target,
        enabled,
        queued: true,
        timestamp: cmd.createdAt,
      },
      message: `Automation ${enabled ? "enabled" : "disabled"} for ${target} on sensor ${sensor_id}`,
    });
  } catch (error) {
    log.error("Error queuing automation command", {
      message: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .json({ error: "Failed to queue automation command", message: error.message });
  }
});

// =========================================
// POST /api/sensors/interval
// =========================================
router.post("/interval", async (req, res) => {
  try {
    const { sensor_id, interval } = req.body;

    log.info("POST /api/sensors/interval received", { sensor_id, interval });

    if (!sensor_id || !interval || isNaN(interval)) {
      return res.status(400).json({
        error: "Missing required fields: sensor_id and interval (numeric)",
      });
    }

    const intervalNum = parseInt(interval, 10);
    if (intervalNum < 10 || intervalNum > 3600) {
      return res.status(400).json({
        error: "Invalid interval. Must be between 10 and 3600 seconds.",
      });
    }

    const cmd = await PendingCommand.create({
      sensorId: sensor_id,
      action: "set_interval",
      target: "environmental_sensor",
      trigger: "manual",
      value: String(intervalNum),
      status: "queued",
    });

    log.info("Queued interval command (DB)", { sensor_id, intervalNum });

    res.json({
      success: true,
      data: {
        id: cmd._id,
        sensorId: sensor_id,
        action: "set_interval",
        interval: intervalNum,
        queued: true,
        timestamp: cmd.createdAt,
      },
      message: `Interval update to ${intervalNum}s queued for sensor ${sensor_id}`,
    });
  } catch (error) {
    log.error("Error queuing interval command", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to queue interval command", message: error.message });
  }
});
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

    let tankConfig = await database.TankConfig.findOne({ sensorId });
    
    // Fallback: if no sensor mapping, but we only have one tank (main_tank), use it
    if (!tankConfig) {
      tankConfig = await database.TankConfig.findOne({ tankId: "main_tank" });
    }

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
          tankHeightCm: tankConfig.tankHeightCm,
          maxCapacityLiters: tankConfig.maxCapacityLiters, // Added for frontend accuracy
          automationEnabled: tankConfig.automationEnabled ?? true,
          reportInterval: tankConfig.reportInterval ?? 1,
          latestReading: latestWaterReading,
        };
    }

    if (zoneConfig) {
      const latestSoilReading =
        await database.SoilMoistureReading.getLatestByZone(zoneConfig.zoneId);
      soilStatus = {
        zoneId: zoneConfig.zoneId,
        zoneName: zoneConfig.name,
        automationEnabled: zoneConfig.automationEnabled ?? true,
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
        config: {
          report_interval: 60, // Default or fetch from latest reading if available
        },
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
