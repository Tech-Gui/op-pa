const express = require("express");
const router = express.Router();
const database = require("../database");

// POST /api/water/reading - Submit new water level reading
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

    res.status(201).json({
      success: true,
      data: result.data,
      message: "Water reading saved successfully",
    });
  } catch (error) {
    console.error("Error inserting reading:", error);
    res.status(500).json({
      error: "Failed to save reading",
      message: error.message,
    });
  }
});

// GET /api/water/readings - Get all water readings
router.get("/readings", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const tankId = req.query.tank_id;

    let readings;
    if (tankId) {
      // If tank_id specified, get readings for that tank only
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

// GET /api/water/latest - Get latest water reading
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

// GET /api/water/tank-config - Get tank configuration (single tank)
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

// GET /api/water/tanks - Get all tank configurations
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

// PUT /api/water/tank-config - Update tank configuration
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
