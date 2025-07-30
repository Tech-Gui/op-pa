const mongoose = require("mongoose");

// Environmental Reading Schema
const environmentalReadingSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    location: {
      type: String,
      default: "Unknown Location",
      index: true,
      trim: true,
    },
    temperatureCelsius: {
      type: Number,
      required: true,
      min: -50,
      max: 80,
      validate: {
        validator: function (v) {
          return !isNaN(v) && isFinite(v);
        },
        message: "Temperature must be a valid number",
      },
    },
    humidityPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      validate: {
        validator: function (v) {
          return !isNaN(v) && isFinite(v);
        },
        message: "Humidity must be a valid number",
      },
    },
    uvIndex: {
      type: Number,
      required: true,
      min: 0,
      max: 15,
      validate: {
        validator: function (v) {
          return !isNaN(v) && isFinite(v);
        },
        message: "UV Index must be a valid number",
      },
    },
    uvRiskLevel: {
      type: String,
      enum: ["Low", "Moderate", "High", "Very High", "Extreme"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "environmental_readings",
  }
);

// Add compound indexes for better query performance
environmentalReadingSchema.index({ sensorId: 1, timestamp: -1 });
environmentalReadingSchema.index({ location: 1, timestamp: -1 });
environmentalReadingSchema.index({ timestamp: -1 });
environmentalReadingSchema.index({ sensorId: 1, location: 1, timestamp: -1 });

// Static methods for environmental readings
environmentalReadingSchema.statics.getLatestBySensor = function (sensorId) {
  return this.findOne({ sensorId }).sort({ timestamp: -1 });
};

environmentalReadingSchema.statics.getLatestByLocation = function (location) {
  return this.findOne({ location }).sort({ timestamp: -1 });
};

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

environmentalReadingSchema.statics.getSensorStats = function (
  sensorId,
  hours = 24
) {
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
};

environmentalReadingSchema.statics.getLocationStats = function (
  location,
  hours = 24
) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        location: location,
        timestamp: { $gte: startTime },
      },
    },
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
};

// Environmental Sensor Configuration Schema
const environmentalSensorConfigSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    calibration: {
      temperatureOffset: {
        type: Number,
        default: 0,
        min: -10,
        max: 10,
      },
      humidityOffset: {
        type: Number,
        default: 0,
        min: -20,
        max: 20,
      },
      uvOffset: {
        type: Number,
        default: 0,
        min: -5,
        max: 5,
      },
    },
    alertThresholds: {
      minTemperature: {
        type: Number,
        default: -10,
      },
      maxTemperature: {
        type: Number,
        default: 45,
      },
      minHumidity: {
        type: Number,
        default: 20,
      },
      maxHumidity: {
        type: Number,
        default: 90,
      },
      maxUvIndex: {
        type: Number,
        default: 8,
      },
    },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
    installationDate: {
      type: Date,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastReading: {
      temperature: Number,
      humidity: Number,
      uvIndex: Number,
      timestamp: Date,
    },
  },
  {
    timestamps: true,
    collection: "environmental_sensor_configs",
  }
);

// Static methods for sensor configuration
environmentalSensorConfigSchema.statics.getActiveSensors = function () {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return this.find({
    lastSeen: { $gte: twentyFourHoursAgo },
    isActive: true,
  }).sort({ lastSeen: -1 });
};

environmentalSensorConfigSchema.statics.updateLastSeen = function (
  sensorId,
  readingData
) {
  return this.findOneAndUpdate(
    { sensorId },
    {
      lastSeen: new Date(),
      lastReading: {
        temperature: readingData.temperatureCelsius,
        humidity: readingData.humidityPercent,
        uvIndex: readingData.uvIndex,
        timestamp: new Date(),
      },
      location: readingData.location,
      isActive: true,
    },
    { upsert: true, new: true }
  );
};

// Environmental Alert Schema (for future use)
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
        "uv_extreme",
        "sensor_offline",
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "warning",
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    value: {
      type: Number,
    },
    threshold: {
      type: Number,
    },
    isResolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
    },
    location: {
      type: String,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "environmental_alerts",
  }
);

// Add index for active alerts
environmentalAlertSchema.index({ isResolved: 1, timestamp: -1 });
environmentalAlertSchema.index({ sensorId: 1, alertType: 1, isResolved: 1 });

// Instance methods
environmentalReadingSchema.methods.getUVRiskLevel = function () {
  const uvIndex = this.uvIndex;
  if (uvIndex < 3) return "Low";
  else if (uvIndex < 6) return "Moderate";
  else if (uvIndex < 8) return "High";
  else if (uvIndex < 11) return "Very High";
  else return "Extreme";
};

environmentalReadingSchema.methods.isTemperatureNormal = function (
  minTemp = -10,
  maxTemp = 45
) {
  return (
    this.temperatureCelsius >= minTemp && this.temperatureCelsius <= maxTemp
  );
};

environmentalReadingSchema.methods.isHumidityNormal = function (
  minHumidity = 20,
  maxHumidity = 90
) {
  return (
    this.humidityPercent >= minHumidity && this.humidityPercent <= maxHumidity
  );
};

// Pre-save middleware to auto-calculate UV risk level
environmentalReadingSchema.pre("save", function (next) {
  if (this.uvIndex !== undefined && !this.uvRiskLevel) {
    this.uvRiskLevel = this.getUVRiskLevel();
  }
  next();
});

// Virtual for temperature in Fahrenheit
environmentalReadingSchema.virtual("temperatureFahrenheit").get(function () {
  return (this.temperatureCelsius * 9) / 5 + 32;
});

// Virtual for formatted timestamp
environmentalReadingSchema.virtual("formattedTimestamp").get(function () {
  return this.timestamp.toISOString();
});

// Ensure virtuals are included in JSON output
environmentalReadingSchema.set("toJSON", { virtuals: true });
environmentalReadingSchema.set("toObject", { virtuals: true });

// Create models
const EnvironmentalReading = mongoose.model(
  "EnvironmentalReading",
  environmentalReadingSchema
);
const EnvironmentalSensorConfig = mongoose.model(
  "EnvironmentalSensorConfig",
  environmentalSensorConfigSchema
);
const EnvironmentalAlert = mongoose.model(
  "EnvironmentalAlert",
  environmentalAlertSchema
);

module.exports = {
  EnvironmentalReading,
  EnvironmentalSensorConfig,
  EnvironmentalAlert,
};
