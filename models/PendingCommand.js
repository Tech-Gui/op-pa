// models/PendingCommand.js
const mongoose = require("mongoose");

const pendingCommandSchema = new mongoose.Schema(
  {
    sensorId: { type: String, required: true, index: true },
    action: { type: String, enum: ["start", "stop"], required: true },
    target: {
      type: String,
      enum: ["water_pump", "irrigation"],
      required: true,
    },
    trigger: { type: String, default: "manual" },
    status: {
      type: String,
      enum: ["queued", "dequeued", "executed"],
      default: "queued",
      index: true,
    },
    dequeuedAt: { type: Date, default: null },
    executedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Optional TTL cleanup after 24h if never executed:
pendingCommandSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 }
);

module.exports = mongoose.model("PendingCommand", pendingCommandSchema);
