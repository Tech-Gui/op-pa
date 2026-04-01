const mongoose = require("mongoose");

// ==============================
// SCHEMAS
// ==============================

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
      index: true,
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
      index: true,
    },
    sensorAssignedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    automationEnabled: {
      type: Boolean,
      default: true,
    },
    reportInterval: {
      type: Number,
      default: 1, // minutes
    },
    pumpOnDistanceCm: {
      type: Number,
      default: 250,
    },
    pumpOffDistanceCm: {
      type: Number,
      default: 50,
    },
    relayStatus: {
      type: String,
      enum: ["on", "off", "unknown"],
      default: "unknown",
    },
  },
  {
    timestamps: true,
  }
);

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
      type: Number, // Duration in minutes
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

// ==============================
// INDEXES
// ==============================

waterReadingSchema.index({ tankId: 1, timestamp: -1 });
waterReadingSchema.index({ sensorId: 1, timestamp: -1 });
pumpLogSchema.index({ tankId: 1, timestamp: -1 });
pumpLogSchema.index({ tankId: 1, action: 1, timestamp: -1 });

// ==============================
// STATIC METHODS
// ==============================

// Water Reading static methods
waterReadingSchema.statics.getLatestByTank = function (tankId) {
  return this.findOne({ tankId }).sort({ timestamp: -1 });
};

waterReadingSchema.statics.getLatestBySensor = function (sensorId) {
  return this.findOne({ sensorId }).sort({ timestamp: -1 });
};

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

// Pump Log static methods
pumpLogSchema.statics.getLatestByTank = function (tankId) {
  return this.findOne({ tankId }).sort({ timestamp: -1 });
};

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

  return !latestStop;
};

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

  for (const log of logs) {
    if (log.action === "start") {
      currentSession = { start: log, stop: null };
    } else if (log.action === "stop" && currentSession) {
      currentSession.stop = log;
      sessions.push(currentSession);
      currentSession = null;
    }
  }

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

// ==============================
// MIDDLEWARE (Hooks)
// ==============================

// Calculate water level if not provided
waterReadingSchema.pre("save", async function (next) {
  if (!this.waterLevelCm && this.distanceCm) {
    try {
      // Use this.constructor instead of mongoose.model if possible, but for TankConfig we need the model
      const tankConfig = await mongoose.model("TankConfig").findOne({ tankId: this.tankId });
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

// Calculate tank capacity from height and radius
tankConfigSchema.pre("save", function (next) {
  if (this.tankHeightCm && this.tankRadiusCm) {
    // V = π * r² * h / 1000 (cm³ to Liters)
    this.maxCapacityLiters = Math.round(
      (Math.PI * Math.pow(this.tankRadiusCm, 2) * this.tankHeightCm) / 1000
    );
  }
  next();
});

// Calculate pump duration for stop actions
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
        this.duration = Math.round(durationMs / 60000);
      }
    } catch (error) {
      console.warn("Could not calculate pump duration:", error.message);
    }
  }
  next();
});

// ==============================
// EXPORTS
// ==============================

const WaterReading = mongoose.models.WaterReading || mongoose.model("WaterReading", waterReadingSchema);
const TankConfig = mongoose.models.TankConfig || mongoose.model("TankConfig", tankConfigSchema);
const PumpLog = mongoose.models.PumpLog || mongoose.model("PumpLog", pumpLogSchema);

module.exports = {
  WaterReading,
  TankConfig,
  PumpLog,
};
