const mongoose = require("mongoose");

// Environmental Reading Schema
const environmentalReadingSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      index: true,
    },
    location: {
      type: String,
      default: "Unknown",
    },
    temperatureCelsius: {
      type: Number,
      required: true,
    },
    humidityPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    uvIndex: {
      type: Number,
      default: null,
      min: 0,
    },
    uvRiskLevel: {
      type: String,
      enum: ["Low", "Moderate", "High", "Very High", "Extreme"],
      default: "Low",
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

// Environmental Sensor Configuration Schema
const environmentalSensorConfigSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      unique: true,
    },
    location: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    calibration: {
      temperatureOffset: { type: Number, default: 0 },
      humidityOffset: { type: Number, default: 0 },
      uvOffset: { type: Number, default: 0 },
    },
    alertThresholds: {
      minTemperature: { type: Number, default: 5 },
      maxTemperature: { type: Number, default: 40 },
      minHumidity: { type: Number, default: 20 },
      maxHumidity: { type: Number, default: 85 },
      maxUvIndex: { type: Number, default: 8 },
    },
    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
    lastSeen: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Environmental Alert Schema
const environmentalAlertSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      index: true,
    },
    alertType: {
      type: String,
      enum: [
        "temperature_high",
        "temperature_low",
        "humidity_high",
        "humidity_low",
        "uv_high",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    value: {
      type: Number,
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
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

// Static methods
environmentalReadingSchema.statics.getLatestBySensor = function (sensorId) {
  return this.findOne({ sensorId }).sort({ timestamp: -1 });
};

environmentalSensorConfigSchema.statics.updateLastSeen = function (sensorId, readingData) {
  return this.findOneAndUpdate(
    { sensorId },
    {
      lastSeen: new Date(),
      $setOnInsert: {
        location: readingData.location || "Unknown",
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );
};

const EnvironmentalReading = mongoose.model("EnvironmentalReading", environmentalReadingSchema);
const EnvironmentalSensorConfig = mongoose.model("EnvironmentalSensorConfig", environmentalSensorConfigSchema);
const EnvironmentalAlert = mongoose.model("EnvironmentalAlert", environmentalAlertSchema);

module.exports = {
  EnvironmentalReading,
  EnvironmentalSensorConfig,
  EnvironmentalAlert,
};
