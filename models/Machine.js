const mongoose = require("mongoose");

const MachineStatus = ["operational", "warning", "critical", "offline"];

const machineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    deviceId: { type: String, required: true, unique: true, index: true }, // ESP32 MAC
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },

    sensor1: { type: Boolean, default: false },
    sensor2: { type: Boolean, default: false },
    sensor3: { type: Boolean, default: false },

    status: {
      type: String,
      enum: MachineStatus,
      default: "offline",
      index: true,
    },
    plcOn: { type: Boolean, default: false },
    lastHeartbeatAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Machine", machineSchema);
