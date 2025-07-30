const express = require("express");
const router = express.Router();
const database = require("../database");

// POST /api/environmental/reading - Submit new environmental reading
router.post("/reading", async (req, res) => {
  try {
    const {
      temperature_celsius,
      humidity_percent,
      uv_index,
      uv_risk_level,
      sensor_id,
      location,
    } = req.body;

    // Validate required fields
    if (
      temperature_celsius === undefined ||
      humidity_percent === undefined ||
      uv_index === undefined
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: temperature_celsius, humidity_percent, uv_index",
      });
    }

    // Validate ranges
    if (temperature_celsius < -50 || temperature_celsius > 80) {
      return res.status(400).json({
        error: "Temperature out of valid range (-50°C to 80°C)",
      });
    }

    if (humidity_percent < 0 || humidity_percent > 100) {
      return res.status(400).json({
        error: "Humidity out of valid range (0% to 100%)",
      });
    }

    if (uv_index < 0 || uv_index > 15) {
      return res.status(400).json({
        error: "UV Index out of valid range (0 to 15)",
      });
    }

    const readingData = {
      sensorId: sensor_id || "unknown",
      location: location || "Unknown Location",
      temperatureCelsius: parseFloat(temperature_celsius),
      humidityPercent: parseFloat(humidity_percent),
      uvIndex: parseFloat(uv_index),
      uvRiskLevel: uv_risk_level || getUVRiskLevel(parseFloat(uv_index)),
      timestamp: new Date(),
    };

    const result = await database.insertEnvironmentalReading(readingData);

    res.status(201).json({
      success: true,
      data: result.data,
      message: "Environmental reading saved successfully",
    });
  } catch (error) {
    console.error("Error inserting environmental reading:", error);
    res.status(500).json({
      error: "Failed to save environmental reading",
      message: error.message,
    });
  }
});

// GET /api/environmental/readings - Get all environmental readings
router.get("/readings", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const sensorId = req.query.sensor_id;
    const location = req.query.location;

    let query = {};
    if (sensorId) query.sensorId = sensorId;
    if (location) query.location = location;

    const readings = await database.EnvironmentalReading.find(query)
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: readings.length,
      data: readings,
    });
  } catch (error) {
    console.error("Error getting environmental readings:", error);
    res.status(500).json({
      error: "Failed to retrieve environmental readings",
      message: error.message,
    });
  }
});

// GET /api/environmental/latest - Get latest environmental reading
router.get("/latest", async (req, res) => {
  try {
    const sensorId = req.query.sensor_id;
    const location = req.query.location;

    let query = {};
    if (sensorId) query.sensorId = sensorId;
    if (location) query.location = location;

    const reading = await database.EnvironmentalReading.findOne(query).sort({
      timestamp: -1,
    });

    if (!reading) {
      return res.status(404).json({
        error: "No environmental readings found",
        query,
      });
    }

    res.json({
      success: true,
      data: reading,
    });
  } catch (error) {
    console.error("Error getting latest environmental reading:", error);
    res.status(500).json({
      error: "Failed to retrieve latest environmental reading",
      message: error.message,
    });
  }
});

// GET /api/environmental/stats - Get environmental statistics
router.get("/stats", async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const sensorId = req.query.sensor_id;
    const location = req.query.location;

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    let matchQuery = { timestamp: { $gte: startTime } };
    if (sensorId) matchQuery.sensorId = sensorId;
    if (location) matchQuery.location = location;

    const stats = await database.EnvironmentalReading.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          avgTemperature: { $avg: "$temperatureCelsius" },
          minTemperature: { $min: "$temperatureCelsius" },
          maxTemperature: { $max: "$temperatureCelsius" },
          avgHumidity: { $avg: "$humidityPercent" },
          minHumidity: { $min: "$humidityPercent" },
          maxHumidity: { $max: "$humidityPercent" },
          avgUvIndex: { $avg: "$uvIndex" },
          minUvIndex: { $min: "$uvIndex" },
          maxUvIndex: { $max: "$uvIndex" },
          readingCount: { $sum: 1 },
          firstReading: { $min: "$timestamp" },
          lastReading: { $max: "$timestamp" },
        },
      },
    ]);

    const result = stats[0] || {
      avgTemperature: 0,
      minTemperature: 0,
      maxTemperature: 0,
      avgHumidity: 0,
      minHumidity: 0,
      maxHumidity: 0,
      avgUvIndex: 0,
      minUvIndex: 0,
      maxUvIndex: 0,
      readingCount: 0,
      firstReading: null,
      lastReading: null,
    };

    res.json({
      success: true,
      data: {
        ...result,
        timeRange: {
          hours: hours,
          startTime: startTime,
          endTime: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Error getting environmental stats:", error);
    res.status(500).json({
      error: "Failed to retrieve environmental statistics",
      message: error.message,
    });
  }
});

// GET /api/environmental/readings/range - Get readings by date range
router.get("/readings/range", async (req, res) => {
  try {
    const { start_date, end_date, sensor_id, location } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: "Missing required parameters: start_date and end_date",
      });
    }

    let query = {
      timestamp: {
        $gte: new Date(start_date),
        $lte: new Date(end_date),
      },
    };

    if (sensor_id) query.sensorId = sensor_id;
    if (location) query.location = location;

    const readings = await database.EnvironmentalReading.find(query).sort({
      timestamp: -1,
    });

    res.json({
      success: true,
      count: readings.length,
      data: readings,
      query: {
        startDate: start_date,
        endDate: end_date,
        sensorId: sensor_id,
        location: location,
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

// GET /api/environmental/locations - Get all monitored locations
router.get("/locations", async (req, res) => {
  try {
    const locations = await database.EnvironmentalReading.distinct("location");

    res.json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error) {
    console.error("Error getting locations:", error);
    res.status(500).json({
      error: "Failed to retrieve locations",
      message: error.message,
    });
  }
});

// GET /api/environmental/sensors - Get all active sensors
router.get("/sensors", async (req, res) => {
  try {
    // Get sensors with their latest readings
    const sensors = await database.EnvironmentalReading.aggregate([
      {
        $sort: { timestamp: -1 },
      },
      {
        $group: {
          _id: "$sensorId",
          location: { $first: "$location" },
          lastReading: { $first: "$timestamp" },
          latestTemperature: { $first: "$temperatureCelsius" },
          latestHumidity: { $first: "$humidityPercent" },
          latestUvIndex: { $first: "$uvIndex" },
          latestUvRiskLevel: { $first: "$uvRiskLevel" },
          readingCount: { $sum: 1 },
        },
      },
      {
        $project: {
          sensorId: "$_id",
          location: 1,
          lastReading: 1,
          latestTemperature: 1,
          latestHumidity: 1,
          latestUvIndex: 1,
          latestUvRiskLevel: 1,
          readingCount: 1,
          _id: 0,
        },
      },
      {
        $sort: { lastReading: -1 },
      },
    ]);

    res.json({
      success: true,
      count: sensors.length,
      data: sensors,
    });
  } catch (error) {
    console.error("Error getting sensors:", error);
    res.status(500).json({
      error: "Failed to retrieve sensors",
      message: error.message,
    });
  }
});

// Helper function to determine UV risk level
function getUVRiskLevel(uvIndex) {
  if (uvIndex < 3) return "Low";
  else if (uvIndex < 6) return "Moderate";
  else if (uvIndex < 8) return "High";
  else if (uvIndex < 11) return "Very High";
  else return "Extreme";
}

module.exports = router;
