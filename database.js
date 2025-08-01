const mongoose = require("mongoose");
require("dotenv").config();

// MongoDB connection string - can be set via environment variable
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/smart_farming";

// ==============================
// WATER SYSTEM MODELS
// ==============================

// Water Reading Schema
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
  },
  {
    timestamps: true,
  }
);

// Pump Log Schema
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

// ==============================
// SOIL MOISTURE MODELS
// ==============================

// Soil Moisture Reading Schema
const soilMoistureReadingSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: true,
      index: true,
    },
    sensorId: {
      type: String,
      default: null,
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
      default: 0,
    },
    temperature: {
      type: Number,
      default: null,
    },
    relayStatus: {
      type: String,
      enum: ["auto", "on", "off"],
      default: "auto",
    },
    irrigationTriggered: {
      type: Boolean,
      default: false,
    },
    stageInfo: {
      stageName: { type: String, default: null },
      dayInStage: { type: Number, default: null },
      targetMinMoisture: { type: Number, default: null },
      targetMaxMoisture: { type: Number, default: null },
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
      default: "Default Field",
    },
    area: {
      type: Number,
      default: 100,
    },
    cropType: {
      type: String,
      required: true,
    },
    plantingDate: {
      type: Date,
      default: Date.now,
    },
    moistureThresholds: {
      minMoisture: { type: Number, default: 60 },
      maxMoisture: { type: Number, default: 80 },
    },
    irrigationSettings: {
      enabled: { type: Boolean, default: true },
      durationMinutes: { type: Number, default: 30 },
      cooldownMinutes: { type: Number, default: 120 },
      useStaticThresholds: { type: Boolean, default: false },
    },
    sensorId: {
      type: String,
      default: null,
      index: true,
    },
    relayId: {
      type: String,
      default: null,
    },
    lastIrrigation: {
      type: Date,
      default: null,
    },
    notes: {
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
    description: {
      type: String,
      default: "",
    },
    waterRequirements: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    temperatureRange: {
      min: { type: Number, default: 15 },
      max: { type: Number, default: 30 },
    },
    stages: [
      {
        name: { type: String, required: true },
        startDay: { type: Number, required: true },
        endDay: { type: Number, required: true },
        minMoisture: { type: Number, required: true },
        maxMoisture: { type: Number, required: true },
        color: { type: String, default: "#10B981" },
        description: { type: String, default: "" },
        irrigationFrequency: {
          type: String,
          enum: ["low", "medium", "high"],
          default: "medium",
        },
        isCritical: { type: Boolean, default: false },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
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
      default: "unknown",
    },
    action: {
      type: String,
      enum: ["start", "stop"],
      required: true,
    },
    trigger: {
      type: String,
      enum: [
        "automatic",
        "manual",
        "manual_override",
        "bulk_operation",
        "schedule",
      ],
      required: true,
    },
    moistureLevel: {
      type: Number,
      default: 0,
    },
    targetMoisture: {
      type: Number,
      default: 60,
    },
    stageInfo: {
      stageName: { type: String, default: null },
      dayInStage: { type: Number, default: null },
      dayInCrop: { type: Number, default: null },
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
// ENVIRONMENTAL MODELS
// ==============================

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

// ==============================
// ADD INDEXES
// ==============================

// Water system indexes
waterReadingSchema.index({ tankId: 1, timestamp: -1 });
waterReadingSchema.index({ sensorId: 1, timestamp: -1 });
pumpLogSchema.index({ tankId: 1, timestamp: -1 });
pumpLogSchema.index({ tankId: 1, action: 1, timestamp: -1 });

// Soil moisture indexes
soilMoistureReadingSchema.index({ zoneId: 1, timestamp: -1 });
soilMoistureReadingSchema.index({ sensorId: 1, timestamp: -1 });
irrigationLogSchema.index({ zoneId: 1, timestamp: -1 });

// Environmental indexes
environmentalReadingSchema.index({ sensorId: 1, timestamp: -1 });
environmentalReadingSchema.index({ location: 1, timestamp: -1 });

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

// Soil Moisture static methods
soilMoistureReadingSchema.statics.getLatestByZone = function (zoneId) {
  return this.findOne({ zoneId }).sort({ timestamp: -1 });
};

soilMoistureReadingSchema.statics.getZoneStats = async function (
  zoneId,
  hours = 24
) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);

  const readings = await this.find({
    zoneId,
    timestamp: { $gte: startDate },
  });

  if (readings.length === 0) {
    return {
      zoneId,
      readingCount: 0,
      averageMoisture: 0,
      minMoisture: 0,
      maxMoisture: 0,
    };
  }

  const moistureLevels = readings.map((r) => r.moisturePercentage);

  return {
    zoneId,
    readingCount: readings.length,
    averageMoisture: Math.round(
      moistureLevels.reduce((a, b) => a + b, 0) / moistureLevels.length
    ),
    minMoisture: Math.min(...moistureLevels),
    maxMoisture: Math.max(...moistureLevels),
  };
};

// Zone Config methods
zoneConfigSchema.methods.getCurrentMoistureTargets = async function () {
  try {
    // If using static thresholds, return those
    if (this.irrigationSettings.useStaticThresholds) {
      return {
        minMoisture: this.moistureThresholds.minMoisture,
        maxMoisture: this.moistureThresholds.maxMoisture,
        source: "static_thresholds",
      };
    }

    // Try to get crop profile for stage-based targeting
    const cropProfile = await CropProfile.findOne({ cropType: this.cropType });

    if (!cropProfile || !this.plantingDate) {
      // Fallback to static thresholds
      return {
        minMoisture: this.moistureThresholds.minMoisture,
        maxMoisture: this.moistureThresholds.maxMoisture,
        source: "fallback_static",
      };
    }

    // Calculate days since planting
    const daysSincePlanting = Math.max(
      1,
      Math.floor(
        (Date.now() - this.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Find current stage
    const currentStage = cropProfile.stages.find(
      (stage) =>
        daysSincePlanting >= stage.startDay && daysSincePlanting <= stage.endDay
    );

    if (currentStage) {
      return {
        minMoisture: currentStage.minMoisture,
        maxMoisture: currentStage.maxMoisture,
        stageName: currentStage.name,
        stageDescription: currentStage.description,
        dayInStage: daysSincePlanting - currentStage.startDay + 1,
        source: "crop_profile",
      };
    }

    // If past all stages, use last stage
    if (daysSincePlanting > cropProfile.duration) {
      const lastStage = cropProfile.stages[cropProfile.stages.length - 1];
      return {
        minMoisture: lastStage.minMoisture,
        maxMoisture: lastStage.maxMoisture,
        stageName: lastStage.name + " (Extended)",
        stageDescription: lastStage.description,
        source: "crop_profile_extended",
      };
    }

    // Fallback to static
    return {
      minMoisture: this.moistureThresholds.minMoisture,
      maxMoisture: this.moistureThresholds.maxMoisture,
      source: "fallback_static",
    };
  } catch (error) {
    console.error("Error getting moisture targets:", error);
    return {
      minMoisture: this.moistureThresholds.minMoisture,
      maxMoisture: this.moistureThresholds.maxMoisture,
      source: "error_fallback",
    };
  }
};

// Environmental static methods
environmentalReadingSchema.statics.getLatestBySensor = function (sensorId) {
  return this.findOne({ sensorId }).sort({ timestamp: -1 });
};

environmentalReadingSchema.statics.getLatestByLocation = function (location) {
  return this.findOne({ location }).sort({ timestamp: -1 });
};

environmentalSensorConfigSchema.statics.getActiveSensors = function () {
  return this.find({ isActive: true }).sort({ lastSeen: -1 });
};

environmentalSensorConfigSchema.statics.updateLastSeen = function (
  sensorId,
  readingData
) {
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

// ==============================
// PRE-SAVE MIDDLEWARE
// ==============================

// Calculate water level if not provided
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

// Check if irrigation should be triggered
soilMoistureReadingSchema.methods.shouldTriggerIrrigation = async function () {
  try {
    const zoneConfig = await ZoneConfig.findOne({ zoneId: this.zoneId });
    if (!zoneConfig || !zoneConfig.irrigationSettings.enabled) {
      return false;
    }

    // Check cooldown period
    if (zoneConfig.lastIrrigation) {
      const cooldownMs =
        zoneConfig.irrigationSettings.cooldownMinutes * 60 * 1000;
      const timeSinceLastIrrigation =
        Date.now() - zoneConfig.lastIrrigation.getTime();
      if (timeSinceLastIrrigation < cooldownMs) {
        return false;
      }
    }

    // Get current moisture targets
    const targets = await zoneConfig.getCurrentMoistureTargets();

    // Trigger if below minimum threshold
    return this.moisturePercentage < targets.minMoisture;
  } catch (error) {
    console.error("Error checking irrigation trigger:", error);
    return false;
  }
};

// ==============================
// CREATE MODELS
// ==============================

const WaterReading = mongoose.model("WaterReading", waterReadingSchema);
const TankConfig = mongoose.model("TankConfig", tankConfigSchema);
const PumpLog = mongoose.model("PumpLog", pumpLogSchema);

const SoilMoistureReading = mongoose.model(
  "SoilMoistureReading",
  soilMoistureReadingSchema
);
const ZoneConfig = mongoose.model("ZoneConfig", zoneConfigSchema);
const CropProfile = mongoose.model("CropProfile", cropProfileSchema);
const IrrigationLog = mongoose.model("IrrigationLog", irrigationLogSchema);

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

// ==============================
// DATABASE CONNECTION & SETUP
// ==============================

async function init() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
    console.log("Database:", mongoose.connection.name);

    // Create default configurations
    await createDefaultTank();
    await createDefaultCropProfiles();
    await createSampleZones();
    await createSampleEnvironmentalSensors();
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

// Create default tank configuration
async function createDefaultTank() {
  try {
    const existingTank = await TankConfig.findOne({ tankId: "main_tank" });

    if (!existingTank) {
      const defaultTank = new TankConfig({
        tankId: "main_tank",
        tankHeightCm: 300,
        tankRadiusCm: 100,
        maxCapacityLiters: 5000,
        minThresholdCm: 20,
        location: "Main Field",
        isActive: true,
      });

      await defaultTank.save();
      console.log("Default tank configuration created");
    }
  } catch (error) {
    console.error("Error creating default tank:", error);
  }
}

// Create comprehensive crop profiles
async function createDefaultCropProfiles() {
  try {
    const profiles = [
      {
        cropType: "tomatoes",
        name: "Tomatoes",
        duration: 120,
        description:
          "Determinate tomato variety with high water needs during fruit development",
        waterRequirements: "high",
        temperatureRange: { min: 18, max: 29 },
        stages: [
          {
            name: "Seedling",
            startDay: 1,
            endDay: 14,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#10B981",
            description:
              "High moisture for germination and early root development",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Vegetative Growth",
            startDay: 15,
            endDay: 49,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#059669",
            description: "Steady moisture for leaf and stem development",
            irrigationFrequency: "medium",
            isCritical: false,
          },
          {
            name: "Flowering",
            startDay: 50,
            endDay: 70,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#047857",
            description: "Reduced moisture to encourage flowering",
            irrigationFrequency: "medium",
            isCritical: true,
          },
          {
            name: "Fruit Development",
            startDay: 71,
            endDay: 105,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#065F46",
            description: "Increased moisture for fruit sizing",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Ripening",
            startDay: 106,
            endDay: 120,
            minMoisture: 55,
            maxMoisture: 65,
            color: "#064E3B",
            description: "Lower moisture to concentrate flavors",
            irrigationFrequency: "low",
            isCritical: false,
          },
        ],
      },
      {
        cropType: "lettuce",
        name: "Lettuce",
        duration: 65,
        description: "Cool season leafy green with consistent water needs",
        waterRequirements: "medium",
        temperatureRange: { min: 10, max: 24 },
        stages: [
          {
            name: "Germination",
            startDay: 1,
            endDay: 7,
            minMoisture: 75,
            maxMoisture: 85,
            color: "#8B5CF6",
            description: "Very high moisture for rapid seed germination",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Seedling",
            startDay: 8,
            endDay: 21,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#7C3AED",
            description: "High moisture for early leaf development",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Vegetative Growth",
            startDay: 22,
            endDay: 49,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#6D28D9",
            description: "Consistent moisture for rapid leaf expansion",
            irrigationFrequency: "medium",
            isCritical: false,
          },
          {
            name: "Head Formation",
            startDay: 50,
            endDay: 65,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#5B21B6",
            description: "Controlled moisture for tight head development",
            irrigationFrequency: "medium",
            isCritical: false,
          },
        ],
      },
    ];

    for (const profileData of profiles) {
      const existingProfile = await CropProfile.findOne({
        cropType: profileData.cropType,
      });
      if (!existingProfile) {
        const profile = new CropProfile(profileData);
        await profile.save();
        console.log(`Crop profile created: ${profileData.name}`);
      }
    }
  } catch (error) {
    console.error("Error creating default crop profiles:", error);
  }
}

// Create sample zones for testing
async function createSampleZones() {
  try {
    const existingZones = await ZoneConfig.find();

    if (existingZones.length === 0) {
      const sampleZones = [
        {
          zoneId: "zone_001",
          name: "North Field - Tomatoes",
          fieldName: "North Field",
          area: 150,
          cropType: "tomatoes",
          plantingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          moistureThresholds: {
            minMoisture: 65,
            maxMoisture: 75,
          },
          irrigationSettings: {
            enabled: true,
            durationMinutes: 45,
            cooldownMinutes: 180,
            useStaticThresholds: false,
          },
          sensorId: null,
          relayId: "relay_001",
          notes: "Sample tomato zone for testing",
        },
      ];

      for (const zoneData of sampleZones) {
        const zone = new ZoneConfig(zoneData);
        await zone.save();
        console.log(`Sample zone created: ${zoneData.name}`);
      }
    }
  } catch (error) {
    console.error("Error creating sample zones:", error);
  }
}

// Create sample environmental sensor configurations
async function createSampleEnvironmentalSensors() {
  try {
    const existingSensors = await EnvironmentalSensorConfig.find();

    if (existingSensors.length === 0) {
      const sampleSensors = [
        {
          sensorId: "ENV_001",
          location: "North Field Weather Station",
          description:
            "Primary weather monitoring station for north field crops",
          isActive: true,
          calibration: {
            temperatureOffset: 0,
            humidityOffset: 0,
            uvOffset: 0,
          },
          alertThresholds: {
            minTemperature: 5,
            maxTemperature: 40,
            minHumidity: 25,
            maxHumidity: 85,
            maxUvIndex: 9,
          },
        },
      ];

      for (const sensorData of sampleSensors) {
        const sensor = new EnvironmentalSensorConfig(sensorData);
        await sensor.save();
        console.log(
          `Sample environmental sensor created: ${sensorData.location}`
        );
      }
    }
  } catch (error) {
    console.error("Error creating sample environmental sensors:", error);
  }
}

// ==============================
// DATABASE FUNCTIONS
// ==============================

// Water reading functions
async function insertWaterReading(data) {
  try {
    const reading = new WaterReading(data);
    const savedReading = await reading.save();
    return { success: true, data: savedReading };
  } catch (error) {
    console.error("Error inserting water reading:", error);
    throw error;
  }
}

async function getAllWaterReadings(limit = 100) {
  try {
    const readings = await WaterReading.find()
      .sort({ timestamp: -1 })
      .limit(limit);
    return readings;
  } catch (error) {
    console.error("Error getting all water readings:", error);
    throw error;
  }
}

async function getLatestWaterReading(tankId = "main_tank") {
  try {
    const reading = await WaterReading.getLatestByTank(tankId);
    return reading;
  } catch (error) {
    console.error("Error getting latest water reading:", error);
    throw error;
  }
}

async function getTankConfig(tankId = "main_tank") {
  try {
    const config = await TankConfig.findOne({ tankId });
    return config;
  } catch (error) {
    console.error("Error getting tank config:", error);
    throw error;
  }
}

async function updateTankConfig(tankId, updateData) {
  try {
    const updatedConfig = await TankConfig.findOneAndUpdate(
      { tankId },
      { ...updateData, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    return updatedConfig;
  } catch (error) {
    console.error("Error updating tank config:", error);
    throw error;
  }
}

async function getReadingsByDateRange(tankId, startDate, endDate) {
  try {
    const readings = await WaterReading.find({
      tankId,
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    }).sort({ timestamp: -1 });
    return readings;
  } catch (error) {
    console.error("Error getting readings by date range:", error);
    throw error;
  }
}

async function getTankStats(tankId, hours = 24) {
  try {
    const stats = await WaterReading.getTankStats(tankId, hours);
    return stats;
  } catch (error) {
    console.error("Error getting tank stats:", error);
    throw error;
  }
}

async function getAllTanks() {
  try {
    const tanks = await TankConfig.find({ isActive: true }).sort({
      createdAt: 1,
    });
    return tanks;
  } catch (error) {
    console.error("Error getting all tanks:", error);
    throw error;
  }
}

// Graceful shutdown
async function close() {
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  await close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  await close();
  process.exit(0);
});

// Connection event handlers
mongoose.connection.on("connected", () => {
  console.log("Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("Mongoose disconnected from MongoDB");
});

module.exports = {
  init,
  close,

  // Water management functions
  insertWaterReading,
  getAllWaterReadings,
  getLatestWaterReading,
  getTankConfig,
  updateTankConfig,
  getReadingsByDateRange,
  getTankStats,
  getAllTanks,

  // Export water models
  WaterReading,
  TankConfig,
  PumpLog,

  // Export soil moisture models
  SoilMoistureReading,
  ZoneConfig,
  CropProfile,
  IrrigationLog,

  // Export environmental models
  EnvironmentalReading,
  EnvironmentalSensorConfig,
  EnvironmentalAlert,
};
