const mongoose = require("mongoose");
// database.js
const PendingCommand = require("./models/PendingCommand");

require("dotenv").config();

// MongoDB connection string - can be set via environment variable
const MONGODB_URI = process.env.MONGODB_URI;

// ==============================
// WATER SYSTEM MODELS
// ==============================

// ==============================
// MODELS (Imported from unified models directory)
// ==============================
const { WaterReading, TankConfig, PumpLog } = require("./models/water");
const { SoilMoistureReading, ZoneConfig, CropProfile, IrrigationLog } = require("./models/soilMoisture");
const { EnvironmentalReading, EnvironmentalSensorConfig, EnvironmentalAlert } = require("./models/environmental");

// ==============================
// ADD INDEXES (Ensure consistent indexing across models)
// ==============================
// Note: Basic indexes are now defined in models/*.js for portability.

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
        // maxCapacityLiters will be calculated by pre-save hook (~9424L)
        minThresholdCm: 20,
        location: "Main Field",
        sensorId: "351901936740061", // Default sensor ID
        isActive: true,
      });

      await defaultTank.save();
      console.log("Default tank configuration created with automated capacity calculation");
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
    // Recalculate capacity if height or radius is provided
    if (updateData.tankHeightCm || updateData.tankRadiusCm) {
      const h = updateData.tankHeightCm || 100; // Fallback or fetch existing
      const r = updateData.tankRadiusCm || 50;
      
      // If one is missing from updateData, we ideally fetch existing first
      // But for simplicity in this helper, let's just ensure we have both
      if (updateData.tankHeightCm && updateData.tankRadiusCm) {
        updateData.maxCapacityLiters = Math.round(
          (Math.PI * Math.pow(updateData.tankRadiusCm, 2) * updateData.tankHeightCm) / 1000
        );
      }
    }

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
  PendingCommand,
};
