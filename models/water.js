const mongoose = require("mongoose");

// Enhanced Water Reading Schema with sensor assignment
const waterReadingSchema = new mongoose.Schema(
  {
    tankId: {
      type: String,
      default: "main_tank",
      required: true,
      index: true,
    },
    sensorId: {
      type: String,
      default: null,
      index: true, // Index for sensor-based queries
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
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Enhanced Tank Configuration Schema with sensor assignment
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
      min: 10,
    },
    tankRadiusCm: {
      type: Number,
      required: true,
      min: 5,
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
    sensorId: {
      type: String,
      default: null,
      index: true, // Index for sensor assignment queries
    },
    sensorAssignedAt: {
      type: Date,
      default: null,
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

// NEW: Pump Log Schema for tracking pump operations
const pumpLogSchema = new mongoose.Schema(
  {
    tankId: {
      type: String,
      required: true,
      index: true,
    },
    sensorId: {
      type: String,
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: ["start", "stop"],
      required: true,
    },
    trigger: {
      type: String,
      enum: [
        "manual",
        "manual_override",
        "automatic_low_water",
        "automatic_high_water",
        "safety_timeout",
        "bulk_operation",
        "relay_control",
        "fallback_auto",
      ],
      required: true,
    },
    waterLevelCm: {
      type: Number,
      default: null,
      min: 0,
    },
    distanceCm: {
      type: Number,
      default: null,
      min: 0,
    },
    duration: {
      type: Number, // Duration in minutes (calculated for stop actions)
      default: null,
      min: 0,
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

// Add compound indexes for efficient queries
waterReadingSchema.index({ tankId: 1, timestamp: -1 });
waterReadingSchema.index({ sensorId: 1, timestamp: -1 });
pumpLogSchema.index({ tankId: 1, timestamp: -1 });
pumpLogSchema.index({ tankId: 1, action: 1, timestamp: -1 });

// Virtual for calculating water volume
waterReadingSchema.virtual("estimatedVolumeLiters").get(function () {
  if (this.waterLevelCm && this.populated("tankConfig")) {
    const radiusCm = this.tankConfig.tankRadiusCm;
    const heightCm = this.waterLevelCm;
    const volumeCm3 = Math.PI * Math.pow(radiusCm, 2) * heightCm;
    return Math.round(volumeCm3 / 1000);
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

// Static method to get latest reading by sensor
waterReadingSchema.statics.getLatestBySensor = function (sensorId) {
  return this.findOne({ sensorId }).sort({ timestamp: -1 });
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

// NEW: Pump Log Static Methods

// Get latest pump action for a tank
pumpLogSchema.statics.getLatestByTank = function (tankId) {
  return this.findOne({ tankId }).sort({ timestamp: -1 });
};

// Get pump session duration
pumpLogSchema.statics.calculatePumpSession = async function (
  tankId,
  startLogId
) {
  const startLog = await this.findById(startLogId);
  if (!startLog || startLog.action !== "start") return null;

  const stopLog = await this.findOne({
    tankId,
    action: "stop",
    timestamp: { $gt: startLog.timestamp },
  }).sort({ timestamp: 1 });

  if (!stopLog) return null;

  const durationMs = stopLog.timestamp - startLog.timestamp;
  const durationMinutes = Math.round(durationMs / 60000);

  return {
    startLog,
    stopLog,
    durationMinutes,
  };
};

// Get pump statistics for a tank
pumpLogSchema.statics.getPumpStats = async function (tankId, hours = 24) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);

  const logs = await this.find({
    tankId,
    timestamp: { $gte: startDate },
  }).sort({ timestamp: 1 });

  if (logs.length === 0) {
    return {
      tankId,
      totalSessions: 0,
      totalRunTimeMinutes: 0,
      averageSessionMinutes: 0,
      manualActivations: 0,
      autoActivations: 0,
      periodHours: hours,
    };
  }

  let sessions = [];
  let currentSession = null;

  // Group start/stop pairs into sessions
  for (const log of logs) {
    if (log.action === "start") {
      currentSession = { start: log, stop: null };
    } else if (log.action === "stop" && currentSession) {
      currentSession.stop = log;
      sessions.push(currentSession);
      currentSession = null;
    }
  }

  // Calculate statistics
  const completedSessions = sessions.filter((s) => s.stop);
  const totalRunTime = completedSessions.reduce((total, session) => {
    const duration = (session.stop.timestamp - session.start.timestamp) / 60000;
    return total + duration;
  }, 0);

  const manualActivations = logs.filter(
    (log) =>
      log.action === "start" &&
      ["manual", "manual_override", "bulk_operation"].includes(log.trigger)
  ).length;

  const autoActivations = logs.filter(
    (log) => log.action === "start" && log.trigger.includes("automatic")
  ).length;

  return {
    tankId,
    totalSessions: completedSessions.length,
    totalRunTimeMinutes: Math.round(totalRunTime),
    averageSessionMinutes:
      completedSessions.length > 0
        ? Math.round(totalRunTime / completedSessions.length)
        : 0,
    manualActivations,
    autoActivations,
    periodHours: hours,
    incompleteSessions: sessions.length - completedSessions.length,
  };
};

// Check if pump is currently running
pumpLogSchema.statics.isPumpRunning = async function (tankId) {
  const latestStart = await this.findOne({
    tankId,
    action: "start",
  }).sort({ timestamp: -1 });

  if (!latestStart) return false;

  const latestStop = await this.findOne({
    tankId,
    action: "stop",
    timestamp: { $gt: latestStart.timestamp },
  });

  return !latestStop; // Pump is running if there's no stop after the latest start
};

// Pre-save middleware to calculate duration for stop actions
pumpLogSchema.pre("save", async function (next) {
  if (this.action === "stop" && !this.duration) {
    try {
      const latestStart = await this.constructor
        .findOne({
          tankId: this.tankId,
          action: "start",
          timestamp: { $lt: this.timestamp },
        })
        .sort({ timestamp: -1 });

      if (latestStart) {
        const durationMs = this.timestamp - latestStart.timestamp;
        this.duration = Math.round(durationMs / 60000); // Convert to minutes
      }
    } catch (error) {
      console.warn("Could not calculate pump duration:", error.message);
    }
  }
  next();
});

// Create models
const WaterReading = mongoose.model("WaterReading", waterReadingSchema);
const TankConfig = mongoose.model("TankConfig", tankConfigSchema);
const PumpLog = mongoose.model("PumpLog", pumpLogSchema);

module.exports = {
  WaterReading,
  TankConfig,
  PumpLog,
};
