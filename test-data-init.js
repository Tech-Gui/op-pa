// // test-data-init.js
// // Run this script to initialize test data and fix existing zones

// const mongoose = require("mongoose");
// const database = require("./database"); // Adjust path as needed

// // Sample crop profiles
// const sampleCropProfiles = [
//   {
//     cropType: "tomato",
//     name: "Tomato",
//     duration: 90,
//     description: "Standard tomato growing cycle from seedling to harvest",
//     stages: [
//       {
//         name: "Germination",
//         startDay: 1,
//         endDay: 14,
//         minMoisture: 70,
//         maxMoisture: 80,
//         color: "#10B981",
//         description: "Seeds need consistent moisture for germination",
//         irrigationFrequency: "high",
//         isCritical: true,
//       },
//       {
//         name: "Seedling",
//         startDay: 15,
//         endDay: 30,
//         minMoisture: 65,
//         maxMoisture: 75,
//         color: "#3B82F6",
//         description: "Young plants establishing root system",
//         irrigationFrequency: "medium",
//         isCritical: false,
//       },
//       {
//         name: "Vegetative Growth",
//         startDay: 31,
//         endDay: 50,
//         minMoisture: 60,
//         maxMoisture: 70,
//         color: "#8B5CF6",
//         description: "Plant focuses on leaf and stem development",
//         irrigationFrequency: "medium",
//         isCritical: false,
//       },
//       {
//         name: "Flowering",
//         startDay: 51,
//         endDay: 70,
//         minMoisture: 65,
//         maxMoisture: 75,
//         color: "#F59E0B",
//         description: "Critical flowering stage, consistent moisture needed",
//         irrigationFrequency: "high",
//         isCritical: true,
//       },
//       {
//         name: "Fruit Development",
//         startDay: 71,
//         endDay: 90,
//         minMoisture: 60,
//         maxMoisture: 70,
//         color: "#EF4444",
//         description: "Fruits developing, moderate water needs",
//         irrigationFrequency: "medium",
//         isCritical: false,
//       },
//     ],
//     temperatureRange: { min: 18, max: 28 },
//     waterRequirements: "high",
//     isActive: true,
//   },
//   {
//     cropType: "lettuce",
//     name: "Lettuce",
//     duration: 45,
//     description: "Fast-growing leafy green crop",
//     stages: [
//       {
//         name: "Germination",
//         startDay: 1,
//         endDay: 7,
//         minMoisture: 75,
//         maxMoisture: 85,
//         color: "#10B981",
//         description: "High moisture for quick germination",
//         irrigationFrequency: "high",
//         isCritical: true,
//       },
//       {
//         name: "Seedling",
//         startDay: 8,
//         endDay: 20,
//         minMoisture: 70,
//         maxMoisture: 80,
//         color: "#3B82F6",
//         description: "Establishing young plants",
//         irrigationFrequency: "high",
//         isCritical: false,
//       },
//       {
//         name: "Leaf Development",
//         startDay: 21,
//         endDay: 45,
//         minMoisture: 65,
//         maxMoisture: 75,
//         color: "#8B5CF6",
//         description: "Main growth phase for leafy vegetables",
//         irrigationFrequency: "medium",
//         isCritical: false,
//       },
//     ],
//     temperatureRange: { min: 12, max: 22 },
//     waterRequirements: "medium",
//     isActive: true,
//   },
//   {
//     cropType: "test_crop",
//     name: "Test Crop",
//     duration: 60,
//     description: "Simple test crop for development and testing",
//     stages: [
//       {
//         name: "Early Stage",
//         startDay: 1,
//         endDay: 20,
//         minMoisture: 60,
//         maxMoisture: 80,
//         color: "#10B981",
//         description: "Initial growth stage",
//         irrigationFrequency: "medium",
//         isCritical: false,
//       },
//       {
//         name: "Mid Stage",
//         startDay: 21,
//         endDay: 40,
//         minMoisture: 50,
//         maxMoisture: 70,
//         color: "#3B82F6",
//         description: "Middle development stage",
//         irrigationFrequency: "medium",
//         isCritical: false,
//       },
//       {
//         name: "Late Stage",
//         startDay: 41,
//         endDay: 60,
//         minMoisture: 40,
//         maxMoisture: 60,
//         color: "#8B5CF6",
//         description: "Final growth stage",
//         irrigationFrequency: "low",
//         isCritical: false,
//       },
//     ],
//     temperatureRange: { min: 15, max: 30 },
//     waterRequirements: "medium",
//     isActive: true,
//   },
// ];

// async function initializeTestData() {
//   try {
//     console.log("🌱 Initializing crop profiles...");

//     // Create crop profiles
//     for (const profile of sampleCropProfiles) {
//       await database.CropProfile.findOneAndUpdate(
//         { cropType: profile.cropType },
//         profile,
//         { upsert: true, new: true }
//       );
//       console.log(`✅ Created/Updated crop profile: ${profile.name}`);
//     }

//     console.log("\n🔧 Fixing existing zones...");

//     // Fix existing zones with invalid planting dates
//     const zones = await database.ZoneConfig.find({});

//     for (const zone of zones) {
//       let needsUpdate = false;
//       const updates = {};

//       // Fix invalid planting dates
//       if (!zone.plantingDate || isNaN(zone.plantingDate.getTime())) {
//         updates.plantingDate = new Date();
//         needsUpdate = true;
//         console.log(`📅 Fixed planting date for zone: ${zone.zoneId}`);
//       }

//       // Ensure crop type exists
//       const cropProfile = await database.CropProfile.findOne({
//         cropType: zone.cropType,
//       });
//       if (!cropProfile) {
//         updates.cropType = "test_crop";
//         needsUpdate = true;
//         console.log(
//           `🌾 Updated crop type to 'test_crop' for zone: ${zone.zoneId}`
//         );
//       }

//       // Ensure moisture thresholds exist
//       if (!zone.moistureThresholds) {
//         updates.moistureThresholds = {
//           minMoisture: 60,
//           maxMoisture: 80,
//         };
//         needsUpdate = true;
//         console.log(`💧 Added moisture thresholds for zone: ${zone.zoneId}`);
//       }

//       // Ensure irrigation settings exist
//       if (!zone.irrigationSettings) {
//         updates.irrigationSettings = {
//           enabled: true,
//           durationMinutes: 30,
//           cooldownMinutes: 120,
//           useStaticThresholds: false,
//         };
//         needsUpdate = true;
//         console.log(`⚙️ Added irrigation settings for zone: ${zone.zoneId}`);
//       }

//       if (needsUpdate) {
//         await database.ZoneConfig.findOneAndUpdate(
//           { zoneId: zone.zoneId },
//           { $set: updates },
//           { new: true }
//         );
//         console.log(`✅ Updated zone: ${zone.zoneId}`);
//       }
//     }

//     // Create a test zone if none exist
//     const zoneCount = await database.ZoneConfig.countDocuments({});
//     if (zoneCount === 0) {
//       console.log("\n🏗️ Creating test zone...");

//       const testZone = new database.ZoneConfig({
//         zoneId: "test_zone",
//         name: "Test Zone",
//         fieldName: "Test Field",
//         area: 100,
//         cropType: "test_crop",
//         plantingDate: new Date(),
//         moistureThresholds: {
//           minMoisture: 60,
//           maxMoisture: 80,
//         },
//         irrigationSettings: {
//           enabled: true,
//           durationMinutes: 30,
//           cooldownMinutes: 120,
//           useStaticThresholds: false,
//         },
//         sensorId: "00:00:00:00:00:00",
//         relayId: "relay_001",
//         isActive: true,
//       });

//       await testZone.save();
//       console.log("✅ Created test zone");
//     }

//     console.log("\n🎉 Test data initialization complete!");
//     console.log("\nAvailable crop profiles:");
//     const profiles = await database.CropProfile.find({ isActive: true });
//     profiles.forEach((p) => {
//       console.log(
//         `  - ${p.name} (${p.cropType}): ${p.duration} days, ${p.stages.length} stages`
//       );
//     });

//     console.log("\nExisting zones:");
//     const allZones = await database.ZoneConfig.find({ isActive: true });
//     allZones.forEach((z) => {
//       console.log(
//         `  - ${z.name} (${z.zoneId}): ${
//           z.cropType
//         }, planted ${z.plantingDate?.toDateString()}`
//       );
//     });
//   } catch (error) {
//     console.error("❌ Error initializing test data:", error);
//     throw error;
//   }
// }

// // Function to test the getCurrentMoistureTargets method
// async function testMoistureTargets() {
//   try {
//     console.log("\n🧪 Testing moisture target calculations...");

//     const zones = await database.ZoneConfig.find({ isActive: true });

//     for (const zone of zones) {
//       console.log(`\nTesting zone: ${zone.name} (${zone.zoneId})`);
//       console.log(`Crop type: ${zone.cropType}`);
//       console.log(`Planting date: ${zone.plantingDate?.toDateString()}`);

//       try {
//         const targets = await zone.getCurrentMoistureTargets();
//         console.log("✅ Moisture targets:", targets);
//       } catch (error) {
//         console.error("❌ Error getting moisture targets:", error.message);
//       }
//     }
//   } catch (error) {
//     console.error("❌ Error testing moisture targets:", error);
//   }
// }

// // Export functions for use in other scripts
// module.exports = {
//   initializeTestData,
//   testMoistureTargets,
//   sampleCropProfiles,
// };

// // Run if this file is executed directly
// if (require.main === module) {
//   // Connect to MongoDB
//   mongoose
//     .connect(
//       process.env.MONGODB_URI || "mongodb://localhost:27017/soil_moisture_db"
//     )
//     .then(async () => {
//       console.log("🔌 Connected to MongoDB");
//       await initializeTestData();
//       await testMoistureTargets();
//       process.exit(0);
//     })
//     .catch((error) => {
//       console.error("❌ MongoDB connection error:", error);
//       process.exit(1);
//     });
// }
