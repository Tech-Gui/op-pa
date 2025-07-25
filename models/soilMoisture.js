const mongoose = require("mongoose");

// Soil Moisture Reading Schema
const soilMoistureReadingSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      default: "main_zone",
      required: true,
      index: true, // Index for faster queries
    },
    sensorId: {
      type: String,
      required: true,
      index: true,
    },
    moisturePercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    rawValue: {
      type: Number,
      required: true,
    },
    temperature: {
      type: Number,
      default: null,
    },
    relayStatus: {
      type: String,
      enum: ["on", "off", "auto"],
      default: "auto",
    },
    irrigationTriggered: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true, // Index for time-based queries
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// Zone Configuration Schema
const zoneConfigSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    fieldName: {
      type: String,
      required: true,
    },
    area: {
      type: Number,
      required: true,
    },
    cropType: {
      type: String,
      required: true,
      enum: ["tomatoes", "maize", "lettuce", "peppers", "custom"],
    },
    plantingDate: {
      type: Date,
      required: true,
    },
    moistureThresholds: {
      minMoisture: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      maxMoisture: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
    },
    irrigationSettings: {
      enabled: {
        type: Boolean,
        default: true,
      },
      durationMinutes: {
        type: Number,
        default: 30,
      },
      cooldownMinutes: {
        type: Number,
        default: 120,
      },
    },
    sensorId: {
      type: String,
      default: null,
    },
    relayId: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastIrrigation: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Crop Profile Schema
const cropProfileSchema = new mongoose.Schema(
  {
    cropType: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    stages: [
      {
        name: String,
        days: Number,
        minMoisture: Number,
        maxMoisture: Number,
        color: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Irrigation Log Schema
const irrigationLogSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: true,
      index: true,
    },
    relayId: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["start", "stop"],
      required: true,
    },
    trigger: {
      type: String,
      enum: ["automatic", "manual", "scheduled"],
      required: true,
    },
    moistureLevel: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      default: null, // Will be set when irrigation stops
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

// Add compound index for efficient queries
soilMoistureReadingSchema.index({ zoneId: 1, timestamp: -1 });

// Virtual for calculating water volume (if tank config is available)
soilMoistureReadingSchema.virtual("estimatedVolumeLiters").get(function () {
  if (this.moisturePercentage && this.populated("zoneConfig")) {
    // This could be expanded to calculate estimated water needed
    return null;
  }
  return null;
});

// Virtual for calculating moisture status
soilMoistureReadingSchema.virtual("moistureStatus").get(function () {
  if (this.moisturePercentage >= 70) return "optimal";
  if (this.moisturePercentage >= 50) return "good";
  if (this.moisturePercentage >= 30) return "low";
  return "critical";
});

// Static method to get latest reading for a zone
soilMoistureReadingSchema.statics.getLatestByZone = function (zoneId) {
  return this.findOne({ zoneId }).sort({ timestamp: -1 });
};

// Static method to get readings in date range
soilMoistureReadingSchema.statics.getByDateRange = function (
  zoneId,
  startDate,
  endDate
) {
  return this.find({
    zoneId,
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  }).sort({ timestamp: -1 });
};

// Static method to get zone statistics
soilMoistureReadingSchema.statics.getZoneStats = async function (
  zoneId,
  hours = 24
) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);

  const readings = await this.find({
    zoneId,
    timestamp: { $gte: startDate },
    moisturePercentage: { $ne: null },
  });

  if (readings.length === 0) {
    return {
      zoneId,
      readingCount: 0,
      averageMoisture: null,
      minMoisture: null,
      maxMoisture: null,
      latestReading: null,
    };
  }

  const moistureValues = readings.map((r) => r.moisturePercentage);
  const latest = await this.getLatestByZone(zoneId);

  return {
    zoneId,
    readingCount: readings.length,
    averageMoisture:
      Math.round(
        (moistureValues.reduce((a, b) => a + b, 0) / moistureValues.length) *
          100
      ) / 100,
    minMoisture: Math.min(...moistureValues),
    maxMoisture: Math.max(...moistureValues),
    latestReading: latest,
    periodHours: hours,
  };
};

// Instance method to check if water level is low
soilMoistureReadingSchema.methods.isLowMoisture = async function () {
  const ZoneConfig = mongoose.model("ZoneConfig");
  const zoneConfig = await ZoneConfig.findOne({ zoneId: this.zoneId });
  if (!zoneConfig || !this.moisturePercentage) return false;

  return this.moisturePercentage <= zoneConfig.moistureThresholds.minMoisture;
};

// Instance method to check if irrigation should be triggered
soilMoistureReadingSchema.methods.shouldTriggerIrrigation = async function () {
  const ZoneConfig = mongoose.model("ZoneConfig");
  const zoneConfig = await ZoneConfig.findOne({ zoneId: this.zoneId });
  if (!zoneConfig || !zoneConfig.irrigationSettings.enabled) return false;

  // Check if moisture is below threshold
  if (this.moisturePercentage >= zoneConfig.moistureThresholds.minMoisture)
    return false;

  // Check cooldown period
  if (zoneConfig.lastIrrigation) {
    const cooldownMs =
      zoneConfig.irrigationSettings.cooldownMinutes * 60 * 1000;
    const timeSinceLastIrrigation =
      Date.now() - zoneConfig.lastIrrigation.getTime();
    if (timeSinceLastIrrigation < cooldownMs) return false;
  }

  return true;
};

// Pre-save middleware to calculate moisture status
soilMoistureReadingSchema.pre("save", async function (next) {
  // You can add any pre-save logic here
  // For example, validation or calculations
  next();
});

// Create models
const SoilMoistureReading = mongoose.model(
  "SoilMoistureReading",
  soilMoistureReadingSchema
);
const ZoneConfig = mongoose.model("ZoneConfig", zoneConfigSchema);
const CropProfile = mongoose.model("CropProfile", cropProfileSchema);
const IrrigationLog = mongoose.model("IrrigationLog", irrigationLogSchema);

module.exports = {
  SoilMoistureReading,
  ZoneConfig,
  CropProfile,
  IrrigationLog,
};
