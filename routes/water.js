const express = require("express");
const router = express.Router();
const database = require("../database");

// In-memory store for pending pump commands (like irrigation system)
const pendingPumpCommands = new Map();

// Store for ESP32 connections (for real-time commands)
const esp32Connections = new Map();

// POST /api/water/reading - Enhanced with command checking
router.post("/reading", async (req, res) => {
  try {
    const { distance_cm, tank_id, relay_status, sensor_id } = req.body;

    // Validate required fields
    if (distance_cm === undefined || distance_cm === null) {
      return res.status(400).json({
        error: "Missing required field: distance_cm",
      });
    }

    let tankId = tank_id || "main_tank";

    // If sensor_id is provided, try to find the tank assigned to this sensor
    if (sensor_id && !tank_id) {
      const tankConfig = await database.TankConfig.findOne({
        sensorId: sensor_id,
      });
      if (tankConfig) {
        tankId = tankConfig.tankId;
      }
    }

    // Get tank configuration to calculate water level
    const tankConfig = await database.getTankConfig(tankId);

    let water_level_cm = null;

    if (tankConfig) {
      // Calculate water level: tank_height - distance_from_sensor
      water_level_cm = Math.max(0, tankConfig.tankHeightCm - distance_cm);
    }

    const readingData = {
      tankId,
      sensorId: sensor_id || null,
      distanceCm: parseFloat(distance_cm),
      waterLevelCm: water_level_cm,
      relayStatus: relay_status || "unknown",
    };

    const result = await database.insertWaterReading(readingData);

    // CHECK FOR PENDING MANUAL PUMP COMMANDS
    let manualCommand = null;
    if (sensor_id && pendingPumpCommands.has(sensor_id)) {
      manualCommand = pendingPumpCommands.get(sensor_id);
      pendingPumpCommands.delete(sensor_id); // Remove after retrieving
      console.log(
        `Sending pump command to ${sensor_id}: ${manualCommand.action}`
      );
    }

    // Prepare response
    const response = {
      success: true,
      data: result.data,
      message: "Water reading saved successfully",
    };

    // Add manual command if exists
    if (manualCommand) {
      response.manualCommand = {
        action: manualCommand.action,
        timestamp: manualCommand.timestamp,
        trigger: "manual_web_app",
        pumpControl: true,
      };
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("Error inserting reading:", error);
    res.status(500).json({
      error: "Failed to save reading",
      message: error.message,
    });
  }
});

// POST /api/water/pump-control - Remote pump control
router.post("/pump-control", async (req, res) => {
  try {
    const { tank_id, action, force_manual = false } = req.body;

    if (!tank_id || !action || !["start", "stop"].includes(action)) {
      return res.status(400).json({
        error: "Invalid parameters. Provide tank_id and action (start/stop)",
      });
    }

    const tankConfig = await database.TankConfig.findOne({ tankId: tank_id });
    if (!tankConfig) {
      return res.status(404).json({
        error: "Tank not found",
      });
    }

    // Get latest water level reading
    const latestReading = await database.getLatestWaterReading(tank_id);
    const waterLevel = latestReading ? latestReading.waterLevelCm : 0;

    // SEND COMMAND TO ESP32
    let commandSent = false;
    if (tankConfig.sensorId) {
      // Store command for ESP32 to pick up on next reading
      const command = {
        action: action,
        timestamp: new Date(),
        tankId: tank_id,
        trigger: force_manual ? "manual_override" : "manual",
        commandType: "pump_control",
      };

      pendingPumpCommands.set(tankConfig.sensorId, command);
      commandSent = true;

      console.log(
        `Queued ${action} pump command for ESP32 ${tankConfig.sensorId} (Tank: ${tank_id})`
      );
    }

    // Log the pump action
    const pumpLog = new database.PumpLog({
      tankId: tank_id,
      action,
      trigger: force_manual ? "manual_override" : "manual",
      waterLevelCm: waterLevel,
      distanceCm: latestReading ? latestReading.distanceCm : null,
      sensorId: tankConfig.sensorId,
    });

    await pumpLog.save();

    res.json({
      success: true,
      data: {
        tankId: tank_id,
        action,
        trigger: force_manual ? "manual_override" : "manual",
        waterLevel,
        commandSent,
        sensorId: tankConfig.sensorId,
        timestamp: new Date(),
      },
      message: `Pump ${action} command ${
        commandSent ? "sent to ESP32" : "logged (no ESP32 connection)"
      }`,
    });
  } catch (error) {
    console.error("Error controlling pump:", error);
    res.status(500).json({
      error: "Failed to control pump",
      message: error.message,
    });
  }
});

// GET /api/water/pending-commands/:sensorId - For ESP32 to check for commands
router.get("/pending-commands/:sensorId", async (req, res) => {
  try {
    const { sensorId } = req.params;

    if (pendingPumpCommands.has(sensorId)) {
      const command = pendingPumpCommands.get(sensorId);
      pendingPumpCommands.delete(sensorId); // Remove after sending

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
    console.error("Error checking pending pump commands:", error);
    res.status(500).json({
      error: "Failed to check pending commands",
      message: error.message,
    });
  }
});

// POST /api/water/pump-control/bulk - Control multiple tank pumps
router.post("/pump-control/bulk", async (req, res) => {
  try {
    const { action, tank_ids = [] } = req.body;

    if (!action || !["start", "stop"].includes(action)) {
      return res.status(400).json({
        error: "Invalid action. Must be 'start' or 'stop'",
      });
    }

    const results = [];
    const errors = [];

    // If no specific tanks provided, get all tanks
    let targetTanks = tank_ids;
    if (targetTanks.length === 0) {
      const allTanks = await database.TankConfig.find({ isActive: true });
      targetTanks = allTanks.map((tank) => tank.tankId);
    }

    // Process each tank
    for (const tankId of targetTanks) {
      try {
        const tankConfig = await database.TankConfig.findOne({ tankId });
        if (!tankConfig) {
          errors.push({ tankId, error: "Tank not found" });
          continue;
        }

        // Only process tanks that have sensors assigned
        if (!tankConfig.sensorId) {
          errors.push({ tankId, error: "No sensor assigned" });
          continue;
        }

        // Queue command for ESP32
        const command = {
          action: action,
          timestamp: new Date(),
          tankId: tankId,
          trigger: "bulk_operation",
          commandType: "pump_control",
        };

        pendingPumpCommands.set(tankConfig.sensorId, command);

        // Log the action
        const pumpLog = new database.PumpLog({
          tankId: tankId,
          action,
          trigger: "bulk_operation",
          waterLevelCm: 0, // Will be updated by ESP32
          sensorId: tankConfig.sensorId,
        });

        await pumpLog.save();

        results.push({
          tankId,
          sensorId: tankConfig.sensorId,
          action,
          status: "queued",
        });
      } catch (error) {
        errors.push({ tankId, error: error.message });
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
      message: `Bulk pump ${action} operation queued for ${results.length} tanks`,
    });
  } catch (error) {
    console.error("Error in bulk pump control:", error);
    res.status(500).json({
      error: "Failed to execute bulk pump control",
      message: error.message,
    });
  }
});

// GET /api/water/pump-status - Get pump status for a tank
router.get("/pump-status", async (req, res) => {
  try {
    const { tank_id } = req.query;

    if (!tank_id) {
      return res.status(400).json({
        error: "tank_id is required",
      });
    }

    // Get latest pump log
    const latestLog = await database.PumpLog.findOne({
      tankId: tank_id,
    }).sort({
      timestamp: -1,
    });

    const latestReading = await database.getLatestWaterReading(tank_id);
    const tankConfig = await database.TankConfig.findOne({ tankId: tank_id });

    let isPumping = false;
    let pumpStartTime = null;

    if (latestLog && latestLog.action === "start") {
      const stopLog = await database.PumpLog.findOne({
        tankId: tank_id,
        action: "stop",
        timestamp: { $gt: latestLog.timestamp },
      });

      if (!stopLog) {
        isPumping = true;
        pumpStartTime = latestLog.timestamp;
      }
    }

    res.json({
      success: true,
      data: {
        tankId: tank_id,
        isPumping,
        pumpStartTime,
        latestReading,
        tankConfig: tankConfig
          ? {
              location: tankConfig.location,
              maxCapacity: tankConfig.maxCapacityLiters,
              sensorId: tankConfig.sensorId,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error getting pump status:", error);
    res.status(500).json({
      error: "Failed to get pump status",
      message: error.message,
    });
  }
});

// GET /api/water/system/status - Overall water system status
router.get("/system/status", async (req, res) => {
  try {
    const totalTanks = await database.TankConfig.countDocuments({
      isActive: true,
    });
    const tanksWithSensors = await database.TankConfig.countDocuments({
      isActive: true,
      sensorId: { $ne: null, $ne: "" },
    });

    // Get recent pump activities
    const recentPumpActions = await database.PumpLog.find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .select("tankId action trigger timestamp waterLevelCm");

    // Count active pumps (start without corresponding stop)
    const startLogs = await database.PumpLog.aggregate([
      { $match: { action: "start" } },
      { $sort: { tankId: 1, timestamp: -1 } },
      { $group: { _id: "$tankId", latestStart: { $first: "$$ROOT" } } },
    ]);

    const stopLogs = await database.PumpLog.aggregate([
      { $match: { action: "stop" } },
      { $sort: { tankId: 1, timestamp: -1 } },
      { $group: { _id: "$tankId", latestStop: { $first: "$$ROOT" } } },
    ]);

    const stopMap = new Map(
      stopLogs.map((log) => [log._id, log.latestStop.timestamp])
    );

    const activePumps = startLogs.filter((startLog) => {
      const tankId = startLog._id;
      const startTime = startLog.latestStart.timestamp;
      const stopTime = stopMap.get(tankId);

      return !stopTime || startTime > stopTime;
    });

    // Get pending commands count
    const pendingCommandsCount = pendingPumpCommands.size;

    res.json({
      success: true,
      data: {
        tanks: {
          total: totalTanks,
          withSensors: tanksWithSensors,
          withoutSensors: totalTanks - tanksWithSensors,
        },
        pumps: {
          activePumps: activePumps.length,
          recentActivity: recentPumpActions,
        },
        commands: {
          pending: pendingCommandsCount,
          queuedSensors: Array.from(pendingPumpCommands.keys()),
        },
        system: {
          uptime: process.uptime(),
          timestamp: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Error getting water system status:", error);
    res.status(500).json({
      error: "Failed to get system status",
      message: error.message,
    });
  }
});

// GET /api/water/commands/queue - View current pump command queue
router.get("/commands/queue", async (req, res) => {
  try {
    const queueArray = Array.from(pendingPumpCommands.entries()).map(
      ([sensorId, command]) => ({
        sensorId,
        ...command,
        queuedFor:
          ((Date.now() - command.timestamp.getTime()) / 1000).toFixed(1) + "s",
      })
    );

    // Get tank info for each queued command
    const enrichedQueue = await Promise.all(
      queueArray.map(async (item) => {
        try {
          const tank = await database.TankConfig.findOne({
            sensorId: item.sensorId,
          });
          return {
            ...item,
            tankLocation: tank?.location || "Unknown",
            tankId: tank?.tankId || "Unknown",
          };
        } catch (error) {
          return {
            ...item,
            tankLocation: "Error",
            tankId: "Error",
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        queueSize: pendingPumpCommands.size,
        commands: enrichedQueue.sort((a, b) => a.timestamp - b.timestamp),
      },
    });
  } catch (error) {
    console.error("Error getting pump command queue:", error);
    res.status(500).json({
      error: "Failed to retrieve command queue",
      message: error.message,
    });
  }
});

// DELETE /api/water/commands/clear - Clear pump command queue
router.delete("/commands/clear", async (req, res) => {
  try {
    const { sensor_id } = req.query;

    if (sensor_id) {
      // Clear specific sensor command
      const hadCommand = pendingPumpCommands.has(sensor_id);
      pendingPumpCommands.delete(sensor_id);

      res.json({
        success: true,
        message: hadCommand
          ? `Pump command cleared for sensor ${sensor_id}`
          : `No pump command found for sensor ${sensor_id}`,
        cleared: hadCommand ? 1 : 0,
      });
    } else {
      // Clear all commands
      const clearedCount = pendingPumpCommands.size;
      pendingPumpCommands.clear();

      res.json({
        success: true,
        message: `All pump commands cleared from queue`,
        cleared: clearedCount,
      });
    }
  } catch (error) {
    console.error("Error clearing pump commands:", error);
    res.status(500).json({
      error: "Failed to clear commands",
      message: error.message,
    });
  }
});

// Enhanced relay control endpoint
router.post("/relay", async (req, res) => {
  try {
    const { action, tank_id } = req.body;

    if (!action || !["on", "off", "toggle"].includes(action.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid action. Use "on", "off", or "toggle"',
      });
    }

    const tankConfig = await database.TankConfig.findOne({ tankId: tank_id });
    if (!tankConfig) {
      return res.status(404).json({
        error: "Tank not found",
      });
    }

    // For toggle action, determine current state
    let finalAction = action.toLowerCase();
    if (finalAction === "toggle") {
      const latestReading = await database.getLatestWaterReading(tank_id);
      const currentState = latestReading?.relayStatus === "on";
      finalAction = currentState ? "off" : "on";
    }

    // Map to pump control actions
    const pumpAction = finalAction === "on" ? "start" : "stop";

    // Use the existing pump control logic
    if (tankConfig.sensorId) {
      const command = {
        action: pumpAction,
        timestamp: new Date(),
        tankId: tank_id,
        trigger: "relay_control",
        commandType: "pump_control",
      };

      pendingPumpCommands.set(tankConfig.sensorId, command);

      console.log(
        `Relay control: Queued ${pumpAction} pump command for ESP32 ${tankConfig.sensorId}`
      );
    }

    res.json({
      success: true,
      message: `Pump ${pumpAction} command queued via relay control`,
      tankId: tank_id,
      action: finalAction,
      pumpAction: pumpAction,
      timestamp: new Date().toISOString(),
      commandSent: !!tankConfig.sensorId,
    });
  } catch (error) {
    console.error("Error processing relay command:", error);
    res.status(500).json({
      error: "Failed to process relay command",
      message: error.message,
    });
  }
});

// All existing endpoints remain the same...
// GET /api/water/readings
router.get("/readings", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const tankId = req.query.tank_id;

    let readings;
    if (tankId) {
      readings = await database.WaterReading.find({ tankId })
        .sort({ timestamp: -1 })
        .limit(limit);
    } else {
      readings = await database.getAllWaterReadings(limit);
    }

    res.json({
      success: true,
      count: readings.length,
      data: readings,
    });
  } catch (error) {
    console.error("Error getting readings:", error);
    res.status(500).json({
      error: "Failed to retrieve readings",
      message: error.message,
    });
  }
});

// GET /api/water/latest
router.get("/latest", async (req, res) => {
  try {
    const tankId = req.query.tank_id || "main_tank";

    const reading = await database.getLatestWaterReading(tankId);

    if (!reading) {
      return res.status(404).json({
        error: "No readings found",
        tankId,
      });
    }

    res.json({
      success: true,
      data: reading,
    });
  } catch (error) {
    console.error("Error getting latest reading:", error);
    res.status(500).json({
      error: "Failed to retrieve latest reading",
      message: error.message,
    });
  }
});

// GET /api/water/tank-config
router.get("/tank-config", async (req, res) => {
  try {
    const tankId = req.query.tank_id || "main_tank";

    const config = await database.getTankConfig(tankId);

    if (!config) {
      return res.status(404).json({
        error: "Tank configuration not found",
        tankId,
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("Error getting tank config:", error);
    res.status(500).json({
      error: "Failed to retrieve tank configuration",
      message: error.message,
    });
  }
});

// GET /api/water/tanks
router.get("/tanks", async (req, res) => {
  try {
    const tanks = await database.getAllTanks();

    res.json({
      success: true,
      count: tanks.length,
      data: tanks,
    });
  } catch (error) {
    console.error("Error getting all tanks:", error);
    res.status(500).json({
      error: "Failed to retrieve tank configurations",
      message: error.message,
    });
  }
});

// PUT /api/water/tank-config
router.put("/tank-config", async (req, res) => {
  try {
    const {
      tank_id,
      tank_height_cm,
      tank_radius_cm,
      max_capacity_liters,
      min_threshold_cm,
      location,
      sensor_id,
    } = req.body;

    if (!tank_id) {
      return res.status(400).json({
        error: "Missing required field: tank_id",
      });
    }

    const updateData = {};
    if (tank_height_cm !== undefined) updateData.tankHeightCm = tank_height_cm;
    if (tank_radius_cm !== undefined) updateData.tankRadiusCm = tank_radius_cm;
    if (max_capacity_liters !== undefined)
      updateData.maxCapacityLiters = max_capacity_liters;
    if (min_threshold_cm !== undefined)
      updateData.minThresholdCm = min_threshold_cm;
    if (location !== undefined) updateData.location = location;
    if (sensor_id !== undefined) {
      updateData.sensorId = sensor_id;
      updateData.sensorAssignedAt = sensor_id ? new Date() : null;
    }

    const updatedConfig = await database.updateTankConfig(tank_id, updateData);

    res.json({
      success: true,
      data: updatedConfig,
      message: "Tank configuration updated successfully",
    });
  } catch (error) {
    console.error("Error updating tank config:", error);
    res.status(500).json({
      error: "Failed to update tank configuration",
      message: error.message,
    });
  }
});

// POST /api/water/assign-sensor - Assign sensor to tank
router.post("/assign-sensor", async (req, res) => {
  try {
    const { tank_id, sensor_id } = req.body;

    if (!tank_id || !sensor_id) {
      return res.status(400).json({
        error: "Missing required fields: tank_id and sensor_id",
      });
    }

    // Check if sensor is already assigned to another tank
    const existingAssignment = await database.TankConfig.findOne({
      sensorId: sensor_id,
      tankId: { $ne: tank_id },
    });

    if (existingAssignment) {
      return res.status(400).json({
        error: `Sensor ${sensor_id} is already assigned to tank ${existingAssignment.tankId}`,
      });
    }

    // Update tank with sensor assignment
    const updatedConfig = await database.updateTankConfig(tank_id, {
      sensorId: sensor_id,
      sensorAssignedAt: new Date(),
    });

    if (!updatedConfig) {
      return res.status(404).json({
        error: "Tank not found",
      });
    }

    res.json({
      success: true,
      data: updatedConfig,
      message: `Sensor ${sensor_id} assigned to tank ${tank_id} successfully`,
    });
  } catch (error) {
    console.error("Error assigning sensor:", error);
    res.status(500).json({
      error: "Failed to assign sensor",
      message: error.message,
    });
  }
});

// DELETE /api/water/unassign-sensor - Remove sensor assignment from tank
router.delete("/unassign-sensor", async (req, res) => {
  try {
    const { tank_id, sensor_id } = req.body;

    if (!tank_id && !sensor_id) {
      return res.status(400).json({
        error: "Must provide either tank_id or sensor_id",
      });
    }

    let query = {};
    if (tank_id) query.tankId = tank_id;
    if (sensor_id) query.sensorId = sensor_id;

    const tankConfig = await database.TankConfig.findOne(query);

    if (!tankConfig) {
      return res.status(404).json({
        error: "Tank configuration not found",
      });
    }

    // Remove sensor assignment
    const updatedConfig = await database.updateTankConfig(tankConfig.tankId, {
      sensorId: null,
      sensorAssignedAt: null,
    });

    res.json({
      success: true,
      data: updatedConfig,
      message: `Sensor unassigned from tank ${tankConfig.tankId} successfully`,
    });
  } catch (error) {
    console.error("Error unassigning sensor:", error);
    res.status(500).json({
      error: "Failed to unassign sensor",
      message: error.message,
    });
  }
});

// GET /api/water/sensor-assignments - Get all sensor assignments
router.get("/sensor-assignments", async (req, res) => {
  try {
    const assignments = await database.TankConfig.find({
      sensorId: { $ne: null },
    }).select("tankId sensorId sensorAssignedAt location");

    res.json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    console.error("Error getting sensor assignments:", error);
    res.status(500).json({
      error: "Failed to retrieve sensor assignments",
      message: error.message,
    });
  }
});

// GET /api/water/readings/range - Get readings by date range
router.get("/readings/range", async (req, res) => {
  try {
    const { tank_id, start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: "Missing required parameters: start_date and end_date",
      });
    }

    const tankId = tank_id || "main_tank";
    const readings = await database.getReadingsByDateRange(
      tankId,
      start_date,
      end_date
    );

    res.json({
      success: true,
      count: readings.length,
      data: readings,
      query: {
        tankId,
        startDate: start_date,
        endDate: end_date,
      },
    });
  } catch (error) {
    console.error("Error getting readings by date range:", error);
    res.status(500).json({
      error: "Failed to retrieve readings by date range",
      message: error.message,
    });
  }
});

// GET /api/water/stats - Get tank statistics
router.get("/stats", async (req, res) => {
  try {
    const tankId = req.query.tank_id || "main_tank";
    const hours = parseInt(req.query.hours) || 24;

    const stats = await database.getTankStats(tankId, hours);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting tank stats:", error);
    res.status(500).json({
      error: "Failed to retrieve tank statistics",
      message: error.message,
    });
  }
});

// POST /api/water/relay - Control relay (placeholder for future use)
router.post("/relay", async (req, res) => {
  try {
    const { action, tank_id } = req.body;

    if (!action || !["on", "off"].includes(action.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid action. Use "on" or "off"',
      });
    }

    // For now, just log the request
    // In the future, this could send MQTT messages or HTTP requests to ESP32
    console.log(
      `Relay control request: ${action} for tank ${tank_id || "main_tank"}`
    );

    res.json({
      success: true,
      message: `Relay ${action} command logged`,
      tankId: tank_id || "main_tank",
      action: action.toLowerCase(),
      timestamp: new Date().toISOString(),
      note: "This is a placeholder endpoint. Relay control not yet implemented.",
    });
  } catch (error) {
    console.error("Error processing relay command:", error);
    res.status(500).json({
      error: "Failed to process relay command",
      message: error.message,
    });
  }
});

module.exports = router;
