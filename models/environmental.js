// Add this to your database.js file with your other schemas

const mongoose = require("mongoose");

const environmentalReadingSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      index: true,
    },
    location: {
      type: String,
      default: "field_station_1",
    },
    temperature: {
      type: Number,
      validate: {
        validator: function (v) {
          return v === null || (v >= -50 && v <= 80); // Reasonable temperature range in Celsius
        },
        message: "Temperature must be between -50°C and 80°C",
      },
    },
    humidity: {
      type: Number,
      validate: {
        validator: function (v) {
          return v === null || (v >= 0 && v <= 100); // Humidity percentage
        },
        message: "Humidity must be between 0% and 100%",
      },
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for efficient querying
environmentalReadingSchema.index({ sensorId: 1, timestamp: -1 });
environmentalReadingSchema.index({ location: 1, timestamp: -1 });

// Static method to get latest reading by sensor
environmentalReadingSchema.statics.getLatestBySensor = function (sensorId) {
  return this.findOne({ sensorId }).sort({ timestamp: -1 });
};

// Static method to get readings by date range
environmentalReadingSchema.statics.getByDateRange = function (
  sensorId,
  startDate,
  endDate
) {
  const query = {
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  if (sensorId) {
    query.sensorId = sensorId;
  }

  return this.find(query).sort({ timestamp: -1 });
};

// Static method to get environmental statistics
environmentalReadingSchema.statics.getStats = function (sensorId, hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        sensorId: sensorId,
        timestamp: { $gte: startTime },
      },
    },
    {
      $group: {
        _id: null,
        readingCount: { $sum: 1 },
        avgTemperature: { $avg: "$temperature" },
        minTemperature: { $min: "$temperature" },
        maxTemperature: { $max: "$temperature" },
        avgHumidity: { $avg: "$humidity" },
        minHumidity: { $min: "$humidity" },
        maxHumidity: { $max: "$humidity" },
        latestReading: { $last: "$$ROOT" },
      },
    },
  ]);
};

const EnvironmentalReading = mongoose.model(
  "EnvironmentalReading",
  environmentalReadingSchema
);

// Add this to your module.exports
module.exports = {
  // ... your existing exports
  EnvironmentalReading,
  // ... rest of exports
};
