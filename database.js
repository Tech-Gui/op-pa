const mongoose = require("mongoose");
const { WaterReading, TankConfig } = require("./models/water");
const {
  SoilMoistureReading,
  ZoneConfig,
  CropProfile,
  IrrigationLog,
} = require("./models/soilMoisture");
require("dotenv").config();

// MongoDB connection string - can be set via environment variable
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/smart_farming";

// Database connection function
async function init() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
    console.log("Database:", mongoose.connection.name);

    // Create default tank configuration if it doesn't exist
    await createDefaultTank();

    // Create default crop profiles if they don't exist
    await createDefaultCropProfiles();

    // Create sample zones if none exist
    await createSampleZones();
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

// Create comprehensive crop profiles with detailed growth stages
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
            description:
              "Reduced moisture to encourage flowering and prevent blossom end rot",
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
            description: "Increased moisture for fruit sizing and development",
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
            description:
              "Lower moisture to concentrate flavors and prevent splitting",
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
            description:
              "High moisture for early leaf development and root establishment",
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
      {
        cropType: "maize",
        name: "Maize/Corn",
        duration: 110,
        description:
          "High-yielding corn variety with critical water needs during tasseling",
        waterRequirements: "high",
        temperatureRange: { min: 16, max: 35 },
        stages: [
          {
            name: "Germination",
            startDay: 1,
            endDay: 10,
            minMoisture: 75,
            maxMoisture: 85,
            color: "#F59E0B",
            description: "High moisture for uniform seed germination",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Vegetative Growth",
            startDay: 11,
            endDay: 50,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#D97706",
            description:
              "Steady moisture for stalk elongation and leaf development",
            irrigationFrequency: "medium",
            isCritical: false,
          },
          {
            name: "Tasseling",
            startDay: 51,
            endDay: 70,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#B45309",
            description:
              "Critical moisture period for pollination and silk emergence",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Grain Filling",
            startDay: 71,
            endDay: 100,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#92400E",
            description:
              "Moderate moisture for kernel development and starch accumulation",
            irrigationFrequency: "medium",
            isCritical: false,
          },
          {
            name: "Maturity",
            startDay: 101,
            endDay: 110,
            minMoisture: 50,
            maxMoisture: 60,
            color: "#78350F",
            description:
              "Reduced moisture for grain hardening and moisture reduction",
            irrigationFrequency: "low",
            isCritical: false,
          },
        ],
      },
      {
        cropType: "peppers",
        name: "Peppers",
        duration: 100,
        description: "Heat-loving crop with steady water requirements",
        waterRequirements: "medium",
        temperatureRange: { min: 20, max: 32 },
        stages: [
          {
            name: "Seedling",
            startDay: 1,
            endDay: 21,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#EF4444",
            description:
              "High moisture for root establishment in warm conditions",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Vegetative Growth",
            startDay: 22,
            endDay: 56,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#DC2626",
            description:
              "Consistent moisture for plant development and branching",
            irrigationFrequency: "medium",
            isCritical: false,
          },
          {
            name: "Flowering",
            startDay: 57,
            endDay: 80,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#B91C1C",
            description:
              "Controlled moisture for flower set and early fruit development",
            irrigationFrequency: "medium",
            isCritical: true,
          },
          {
            name: "Fruit Development",
            startDay: 81,
            endDay: 100,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#991B1B",
            description:
              "Adequate moisture for fruit sizing and wall thickness",
            irrigationFrequency: "medium",
            isCritical: false,
          },
        ],
      },
      {
        cropType: "beans",
        name: "Green Beans",
        duration: 80,
        description: "Nitrogen-fixing legume with moderate water needs",
        waterRequirements: "medium",
        temperatureRange: { min: 15, max: 29 },
        stages: [
          {
            name: "Germination",
            startDay: 1,
            endDay: 10,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#22C55E",
            description:
              "Adequate moisture for seed germination without waterlogging",
            irrigationFrequency: "medium",
            isCritical: true,
          },
          {
            name: "Vegetative Growth",
            startDay: 11,
            endDay: 45,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#16A34A",
            description:
              "Moderate moisture for vine development and nitrogen fixation",
            irrigationFrequency: "medium",
            isCritical: false,
          },
          {
            name: "Flowering & Pod Set",
            startDay: 46,
            endDay: 65,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#15803D",
            description:
              "Increased moisture for flower development and pod formation",
            irrigationFrequency: "high",
            isCritical: true,
          },
          {
            name: "Pod Fill",
            startDay: 66,
            endDay: 80,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#166534",
            description: "Consistent moisture for bean development within pods",
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
      } else {
        // Update existing profile with new fields if they don't exist
        await CropProfile.findOneAndUpdate(
          { cropType: profileData.cropType },
          {
            $set: {
              description: profileData.description,
              waterRequirements: profileData.waterRequirements,
              temperatureRange: profileData.temperatureRange,
            },
          }
        );
        console.log(`Crop profile updated: ${profileData.name}`);
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
          plantingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
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
          sensorId: null, // Will be assigned when ESP32 connects
          relayId: "relay_001",
          notes: "Sample tomato zone for testing",
        },
        {
          zoneId: "zone_002",
          name: "South Field - Lettuce",
          fieldName: "South Field",
          area: 100,
          cropType: "lettuce",
          plantingDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
          moistureThresholds: {
            minMoisture: 70,
            maxMoisture: 80,
          },
          irrigationSettings: {
            enabled: true,
            durationMinutes: 30,
            cooldownMinutes: 120,
            useStaticThresholds: false,
          },
          sensorId: null,
          relayId: "relay_002",
          notes: "Sample lettuce zone for testing",
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

// Water reading functions (existing)
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
    const readings = await WaterReading.getByDateRange(
      tankId,
      startDate,
      endDate
    );
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
  insertWaterReading,
  getAllWaterReadings,
  getLatestWaterReading,
  getTankConfig,
  updateTankConfig,
  getReadingsByDateRange,
  getTankStats,
  getAllTanks,
  close,
  // Export water models
  WaterReading,
  TankConfig,
  // Export soil moisture models
  SoilMoistureReading,
  ZoneConfig,
  CropProfile,
  IrrigationLog,
};
