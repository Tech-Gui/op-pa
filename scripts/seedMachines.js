require("dotenv").config();
const mongoose = require("mongoose");
const Building = require("../models/Building");
const Machine = require("../models/Machine");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const plantA = await Building.findOneAndUpdate(
    { name: "Manufacturing Plant A" },
    { name: "Manufacturing Plant A", latitude: -26.2041, longitude: 28.0473 },
    { upsert: true, new: true }
  );

  const devices = [
    { name: "Unit 01", deviceId: "AA:BB:CC:DD:EE:01", buildingId: plantA._id },
    { name: "Unit 02", deviceId: "AA:BB:CC:DD:EE:02", buildingId: plantA._id },
    { name: "Unit 03", deviceId: "AA:BB:CC:DD:EE:03", buildingId: plantA._id },
  ];

  for (const d of devices) {
    await Machine.findOneAndUpdate(
      { deviceId: d.deviceId },
      { ...d },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log("Seed complete");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
