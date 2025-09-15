const Machine = require("../models/Machine");
const History = require("../models/MachineStatusHistory");

const OFFLINE_MINUTES = Number(process.env.HEARTBEAT_OFFLINE_MINUTES || 5);

async function sweepOffline() {
  try {
    const cutoff = new Date(Date.now() - OFFLINE_MINUTES * 60 * 1000);
    const candidates = await Machine.find({
      $or: [{ lastHeartbeatAt: { $lt: cutoff } }, { lastHeartbeatAt: null }],
      $or: [{ plcOn: true }, { status: { $ne: "offline" } }],
    });

    for (const m of candidates) {
      m.plcOn = false;
      m.sensor1 = false;
      m.sensor2 = false;
      m.sensor3 = false;
      m.status = "offline";
      await m.save();
      await History.create({
        machineId: m._id,
        sensor1: false,
        sensor2: false,
        sensor3: false,
        plcOn: false,
        status: "offline",
      });
    }
  } catch (e) {
    console.error("sweepOffline error", e);
  }
}

function startMachineSweeper() {
  // run every 60s
  setInterval(() => {
    sweepOffline();
  }, 60 * 1000);
}

module.exports = { startMachineSweeper };
