const mongoose = require("mongoose");

// Water Reading Schema
const waterReadingSchema = new mongoose.Schema(
  {
    tankId: {
      type: String,
      default: "main_tank",
      required: true,
      index: true, // Index for faster queries
    },
    distanceCm: {
      type: Number,
      required: true,
      min: 0,
    },
    waterLevelCm: {
      type: Number,
      default: null,
      min: 0,
    },
    relayStatus: {
      type: String,
      enum: ["on", "off", "unknown"],
      default: "unknown",
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

// Tank Configuration Schema
const tankConfigSchema = new mongoose.Schema(
  {
    tankId: {
      type: String,
      required: true,
      unique: true,
    },
    tankHeightCm: {
      type: Number,
      required: true,
      min: 10, // Minimum tank height
    },
    tankRadiusCm: {
      type: Number,
      required: true,
      min: 5, // Minimum tank radius
    },
    maxCapacityLiters: {
      type: Number,
      default: null,
      min: 0,
    },
    minThresholdCm: {
      type: Number,
      default: 20,
      min: 0,
    },
    location: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add compound index for efficient queries
waterReadingSchema.index({ tankId: 1, timestamp: -1 });

// Virtual for calculating water volume (if tank config is available)
waterReadingSchema.virtual("estimatedVolumeLiters").get(function () {
  if (this.waterLevelCm && this.populated("tankConfig")) {
    const radiusCm = this.tankConfig.tankRadiusCm;
    const heightCm = this.waterLevelCm;
    const volumeCm3 = Math.PI * Math.pow(radiusCm, 2) * heightCm;
    return Math.round(volumeCm3 / 1000); // Convert to liters
  }
  return null;
});

// Virtual for calculating fill percentage
waterReadingSchema.virtual("fillPercentage").get(function () {
  if (this.waterLevelCm && this.populated("tankConfig")) {
    const maxHeight = this.tankConfig.tankHeightCm;
    return Math.round((this.waterLevelCm / maxHeight) * 100);
  }
  return null;
});

// Static method to get latest reading for a tank
waterReadingSchema.statics.getLatestByTank = function (tankId) {
  return this.findOne({ tankId }).sort({ timestamp: -1 });
};

// Static method to get readings in date range
waterReadingSchema.statics.getByDateRange = function (
  tankId,
  startDate,
  endDate
) {
  return this.find({
    tankId,
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  }).sort({ timestamp: -1 });
};

// Static method to get tank statistics
waterReadingSchema.statics.getTankStats = async function (tankId, hours = 24) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);

  const readings = await this.find({
    tankId,
    timestamp: { $gte: startDate },
    waterLevelCm: { $ne: null },
  });

  if (readings.length === 0) {
    return {
      tankId,
      readingCount: 0,
      averageWaterLevel: null,
      minWaterLevel: null,
      maxWaterLevel: null,
      latestReading: null,
    };
  }

  const waterLevels = readings.map((r) => r.waterLevelCm);
  const latest = await this.getLatestByTank(tankId);

  return {
    tankId,
    readingCount: readings.length,
    averageWaterLevel:
      Math.round(
        (waterLevels.reduce((a, b) => a + b, 0) / waterLevels.length) * 100
      ) / 100,
    minWaterLevel: Math.min(...waterLevels),
    maxWaterLevel: Math.max(...waterLevels),
    latestReading: latest,
    periodHours: hours,
  };
};

// Instance method to check if water level is low
waterReadingSchema.methods.isLowLevel = async function () {
  const tankConfig = await TankConfig.findOne({ tankId: this.tankId });
  if (!tankConfig || !this.waterLevelCm) return false;

  return this.waterLevelCm <= tankConfig.minThresholdCm;
};

// Pre-save middleware to calculate water level if not provided
waterReadingSchema.pre("save", async function (next) {
  if (!this.waterLevelCm && this.distanceCm) {
    try {
      const tankConfig = await TankConfig.findOne({ tankId: this.tankId });
      if (tankConfig) {
        this.waterLevelCm = Math.max(
          0,
          tankConfig.tankHeightCm - this.distanceCm
        );
      }
    } catch (error) {
      console.warn("Could not calculate water level:", error.message);
    }
  }
  next();
});

// Create models
const WaterReading = mongoose.model("WaterReading", waterReadingSchema);
const TankConfig = mongoose.model("TankConfig", tankConfigSchema);

module.exports = {
  WaterReading,
  TankConfig,
};
