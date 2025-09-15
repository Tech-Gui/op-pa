const mongoose = require("mongoose");

const historySchema = new mongoose.Schema(
  {
    machineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
      index: true,
    },
    sensor1: Boolean,
    sensor2: Boolean,
    sensor3: Boolean,
    status: {
      type: String,
      enum: ["operational", "warning", "critical", "offline"],
      required: true,
    },
    plcOn: Boolean,
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MachineStatusHistory", historySchema);
