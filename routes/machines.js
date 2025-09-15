const express = require("express");
const router = express.Router();

const Building = require("../models/Building");
const Machine = require("../models/Machine");
const History = require("../models/MachineStatusHistory");

function computeStatus({ s1, s2, s3 }) {
  const active = Number(!!s1) + Number(!!s2) + Number(!!s3);
  if (active === 3) return "operational";
  if (active === 2) return "warning";
  if (active === 1) return "critical";
  return "offline";
}

// Shape for your React UI
function toUiMachine(m) {
  return {
    id: m._id,
    name: m.name,
    sensors: { 1: m.sensor1, 2: m.sensor2, 3: m.sensor3 },
    status: m.status,
  };
}

// ---- POST /api/machines/ingest ----
// Body: { device_id, s1, s2, s3, ts? }
router.post("/ingest", async (req, res) => {
  try {
    const { device_id, s1 = 0, s2 = 0, s3 = 0, ts } = req.body || {};
    if (!device_id)
      return res.status(400).json({ ok: false, error: "device_id required" });

    const sensors = { s1: !!Number(s1), s2: !!Number(s2), s3: !!Number(s3) };
    const status = computeStatus(sensors);
    const now = ts ? new Date(ts) : new Date();

    const machine = await Machine.findOne({ deviceId: device_id });
    if (!machine) {
      return res
        .status(404)
        .json({ ok: false, error: "Unknown device_id. Seed machine first." });
    }

    machine.sensor1 = sensors.s1;
    machine.sensor2 = sensors.s2;
    machine.sensor3 = sensors.s3;
    machine.status = status;
    machine.plcOn = true; // ESP alive implies PLC 5V present
    machine.lastHeartbeatAt = now;
    await machine.save();

    await History.create({
      machineId: machine._id,
      sensor1: sensors.s1,
      sensor2: sensors.s2,
      sensor3: sensors.s3,
      status,
      plcOn: true,
      at: now,
    });

    return res.json({
      ok: true,
      id: machine._id,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("ingest error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---- GET /api/machines/buildings ----
router.get("/buildings", async (_req, res) => {
  const buildings = await Building.find().sort({ _id: 1 });
  const result = [];
  for (const b of buildings) {
    const machines = await Machine.find({ buildingId: b._id }).sort({ _id: 1 });
    result.push({
      id: b._id,
      name: b.name,
      latitude: b.latitude,
      longitude: b.longitude,
      machines: machines.map(toUiMachine),
    });
  }
  res.json(result);
});

// ---- GET /api/machines/:id ----
router.get("/:id", async (req, res) => {
  const m = await Machine.findById(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "not_found" });
  res.json(toUiMachine(m));
});

// ---- GET /api/machines/by-device/:deviceId ----
router.get("/by-device/:deviceId", async (req, res) => {
  const m = await Machine.findOne({ deviceId: req.params.deviceId });
  if (!m) return res.status(404).json({ ok: false, error: "not_found" });
  res.json(toUiMachine(m));
});

module.exports = router;
