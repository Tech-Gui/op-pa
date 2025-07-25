const mongoose = require("mongoose");

// Crop Profile Schema - Updated with detailed stage information
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
      required: true, // Total days from planting to harvest
    },
    description: {
      type: String,
      default: "",
    },
    stages: [
      {
        name: {
          type: String,
          required: true,
        },
        startDay: {
          type: Number,
          required: true,
        },
        endDay: {
          type: Number,
          required: true,
        },
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
        color: {
          type: String,
          default: "#6B7280",
        },
        description: {
          type: String,
          default: "",
        },
        // Optional irrigation frequency for this stage
        irrigationFrequency: {
          type: String,
          enum: ["low", "medium", "high"],
          default: "medium",
        },
        // Critical stage indicator
        isCritical: {
          type: Boolean,
          default: false,
        },
      },
    ],
    // Environmental preferences
    temperatureRange: {
      min: { type: Number, default: 15 },
      max: { type: Number, default: 30 },
    },
    // Water requirements
    waterRequirements: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
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

// Zone Configuration Schema - Updated to reference crop profiles
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
      ref: "CropProfile", // Reference to crop profile
    },
    plantingDate: {
      type: Date,
      required: true,
    },
    // Static fallback thresholds (used if no crop profile or override needed)
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
    // Current stage tracking
    currentStage: {
      stageName: String,
      stageIndex: Number,
      dayInStage: Number,
      startDate: Date,
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
      // Override to use static thresholds instead of crop profile
      useStaticThresholds: {
        type: Boolean,
        default: false,
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
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Soil Moisture Reading Schema - Enhanced
const soilMoistureReadingSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      default: "main_zone",
      required: true,
      index: true,
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
    // Stage information at time of reading
    stageInfo: {
      stageName: String,
      dayInStage: Number,
      targetMinMoisture: Number,
      targetMaxMoisture: Number,
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

// Irrigation Log Schema - Enhanced
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
      enum: ["automatic", "manual", "scheduled", "stage_change"],
      required: true,
    },
    moistureLevel: {
      type: Number,
      required: true,
    },
    targetMoisture: {
      type: Number,
      default: null,
    },
    duration: {
      type: Number,
      default: null, // Will be set when irrigation stops
    },
    // Stage context
    stageInfo: {
      stageName: String,
      dayInStage: Number,
      dayInCrop: Number,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for calculating current stage from planting date
zoneConfigSchema.virtual("growthStage").get(function () {
  if (!this.plantingDate || !this.populated("cropProfile")) {
    return null;
  }

  const daysSincePlanting = Math.floor(
    (Date.now() - this.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const cropProfile = this.populated("cropProfile");

  if (!cropProfile || !cropProfile.stages) return null;

  // Find current stage
  for (let i = 0; i < cropProfile.stages.length; i++) {
    const stage = cropProfile.stages[i];
    if (
      daysSincePlanting >= stage.startDay &&
      daysSincePlanting <= stage.endDay
    ) {
      return {
        stage: stage,
        stageIndex: i,
        dayInStage: daysSincePlanting - stage.startDay + 1,
        dayInCrop: daysSincePlanting,
        progress: (daysSincePlanting / cropProfile.duration) * 100,
      };
    }
  }

  // If past all stages, return last stage
  const lastStage = cropProfile.stages[cropProfile.stages.length - 1];
  return {
    stage: lastStage,
    stageIndex: cropProfile.stages.length - 1,
    dayInStage: daysSincePlanting - lastStage.startDay + 1,
    dayInCrop: daysSincePlanting,
    progress: 100,
  };
});

// Method to get current moisture targets based on growth stage
zoneConfigSchema.methods.getCurrentMoistureTargets = async function () {
  if (this.irrigationSettings.useStaticThresholds) {
    return {
      minMoisture: this.moistureThresholds.minMoisture,
      maxMoisture: this.moistureThresholds.maxMoisture,
      source: "static",
    };
  }

  // Get crop profile
  const CropProfile = mongoose.model("CropProfile");
  const cropProfile = await CropProfile.findOne({ cropType: this.cropType });

  if (!cropProfile) {
    return {
      minMoisture: this.moistureThresholds.minMoisture,
      maxMoisture: this.moistureThresholds.maxMoisture,
      source: "fallback",
    };
  }

  const daysSincePlanting = Math.floor(
    (Date.now() - this.plantingDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Find current stage
  for (const stage of cropProfile.stages) {
    if (
      daysSincePlanting >= stage.startDay &&
      daysSincePlanting <= stage.endDay
    ) {
      return {
        minMoisture: stage.minMoisture,
        maxMoisture: stage.maxMoisture,
        stageName: stage.name,
        stageDescription: stage.description,
        dayInStage: daysSincePlanting - stage.startDay + 1,
        source: "crop_profile",
      };
    }
  }

  // If past all stages, use last stage
  const lastStage = cropProfile.stages[cropProfile.stages.length - 1];
  return {
    minMoisture: lastStage.minMoisture,
    maxMoisture: lastStage.maxMoisture,
    stageName: lastStage.name,
    stageDescription: lastStage.description,
    dayInStage: daysSincePlanting - lastStage.startDay + 1,
    source: "crop_profile_final",
  };
};

// Enhanced irrigation triggering method
soilMoistureReadingSchema.methods.shouldTriggerIrrigation = async function () {
  const ZoneConfig = mongoose.model("ZoneConfig");
  const zoneConfig = await ZoneConfig.findOne({ zoneId: this.zoneId });
  if (!zoneConfig || !zoneConfig.irrigationSettings.enabled) return false;

  // Get current moisture targets (stage-based or static)
  const targets = await zoneConfig.getCurrentMoistureTargets();

  // Check if moisture is below threshold
  if (this.moisturePercentage >= targets.minMoisture) return false;

  // Check cooldown period
  if (zoneConfig.lastIrrigation) {
    const cooldownMs =
      zoneConfig.irrigationSettings.cooldownMinutes * 60 * 1000;
    const timeSinceLastIrrigation =
      Date.now() - zoneConfig.lastIrrigation.getTime();
    if (timeSinceLastIrrigation < cooldownMs) return false;
  }

  // Store stage info for this reading
  this.stageInfo = {
    stageName: targets.stageName,
    dayInStage: targets.dayInStage,
    targetMinMoisture: targets.minMoisture,
    targetMaxMoisture: targets.maxMoisture,
  };

  return true;
};

// Add compound indexes
soilMoistureReadingSchema.index({ zoneId: 1, timestamp: -1 });
zoneConfigSchema.index({ cropType: 1, isActive: 1 });
cropProfileSchema.index({ cropType: 1, isActive: 1 });

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
