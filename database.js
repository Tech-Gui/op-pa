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

// Create default crop profiles
async function createDefaultCropProfiles() {
  try {
    const profiles = [
      {
        cropType: "tomatoes",
        name: "Tomatoes",
        duration: 120,
        stages: [
          {
            name: "Seedling",
            days: 14,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#10B981",
          },
          {
            name: "Vegetative",
            days: 35,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#059669",
          },
          {
            name: "Flowering",
            days: 21,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#047857",
          },
          {
            name: "Fruit Development",
            days: 35,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#065F46",
          },
          {
            name: "Ripening",
            days: 15,
            minMoisture: 55,
            maxMoisture: 65,
            color: "#064E3B",
          },
        ],
      },
      {
        cropType: "maize",
        name: "Maize/Corn",
        duration: 110,
        stages: [
          {
            name: "Germination",
            days: 10,
            minMoisture: 75,
            maxMoisture: 85,
            color: "#F59E0B",
          },
          {
            name: "Vegetative",
            days: 40,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#D97706",
          },
          {
            name: "Tasseling",
            days: 20,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#B45309",
          },
          {
            name: "Grain Filling",
            days: 30,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#92400E",
          },
          {
            name: "Maturity",
            days: 10,
            minMoisture: 50,
            maxMoisture: 60,
            color: "#78350F",
          },
        ],
      },
      {
        cropType: "lettuce",
        name: "Lettuce",
        duration: 65,
        stages: [
          {
            name: "Seedling",
            days: 14,
            minMoisture: 75,
            maxMoisture: 85,
            color: "#8B5CF6",
          },
          {
            name: "Vegetative",
            days: 35,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#7C3AED",
          },
          {
            name: "Head Formation",
            days: 16,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#6D28D9",
          },
        ],
      },
      {
        cropType: "peppers",
        name: "Peppers",
        duration: 100,
        stages: [
          {
            name: "Seedling",
            days: 21,
            minMoisture: 70,
            maxMoisture: 80,
            color: "#EF4444",
          },
          {
            name: "Vegetative",
            days: 35,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#DC2626",
          },
          {
            name: "Flowering",
            days: 24,
            minMoisture: 60,
            maxMoisture: 70,
            color: "#B91C1C",
          },
          {
            name: "Fruit Development",
            days: 20,
            minMoisture: 65,
            maxMoisture: 75,
            color: "#991B1B",
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
        console.log(`Default crop profile created: ${profileData.name}`);
      }
    }
  } catch (error) {
    console.error("Error creating default crop profiles:", error);
  }
}

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
