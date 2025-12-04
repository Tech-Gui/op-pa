const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Building = require("../models/Building");
const Machine = require("../models/Machine");
const History = require("../models/MachineStatusHistory");

// ---------- helpers ----------
function computeStatus({ s1, s2, s3 }) {
  const active = Number(!!s1) + Number(!!s2) + Number(!!s3);
  if (active === 3) return "operational";
  if (active === 2) return "warning";
  if (active === 1) return "critical";
  return "offline";
}

function toSensorObj(m) {
  return { s1: !!m.sensor1, s2: !!m.sensor2, s3: !!m.sensor3 };
}

function toUiMachine(m) {
  return {
    id: m._id,
    name: m.name,
    sensors: { 1: m.sensor1, 2: m.sensor2, 3: m.sensor3 },
    status: m.status || computeStatus(toSensorObj(m)),
  };
}

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

// ---------- routes ----------

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
    if (Number.isNaN(now.getTime())) {
      return res.status(400).json({ ok: false, error: "invalid ts" });
    }

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
router.get("/buildings", async (_req, res, next) => {
  try {
    const buildings = await Building.find().sort({ _id: 1 }).lean();
    const result = [];
    for (const b of buildings) {
      const machines = await Machine.find({ buildingId: b._id })
        .sort({ _id: 1 })
        .lean();
      result.push({
        id: b._id,
        name: b.name,
        latitude: b.latitude,
        longitude: b.longitude,
        machines: machines.map(toUiMachine),
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---- GET /api/machines/by-device/:deviceId ----
router.get("/by-device/:deviceId", async (req, res, next) => {
  try {
    const m = await Machine.findOne({ deviceId: req.params.deviceId }).lean();
    if (!m) return res.status(404).json({ ok: false, error: "not_found" });
    res.json(toUiMachine(m));
  } catch (err) {
    next(err);
  }
});

// ---- GET /api/machines/uptime-series ----
router.get("/uptime-series", async (req, res, next) => {
  try {
    const range = String(req.query.range || "24h"); // "24h" | "7d" | "30d"
    const machines = await Machine.find({}).lean();

    // Current snapshot counts
    const counts = { operational: 0, warning: 0, critical: 0, offline: 0 };
    for (const m of machines) {
      const st = m.status || computeStatus(toSensorObj(m));
      if (counts[st] !== undefined) counts[st] += 1;
    }

    // Light synthetic series
    const now = Date.now();
    const pts = [];
    const pushPoint = (t) =>
      pts.push({
        ts: new Date(t).toISOString(),
        operational: counts.operational,
        warning: counts.warning,
        critical: counts.critical,
        offline: counts.offline,
      });

    if (range === "24h") {
      for (let i = 48; i >= 0; i--) pushPoint(now - i * 30 * 60 * 1000); // 30m
    } else if (range === "7d") {
      for (let i = 28; i >= 0; i--) pushPoint(now - i * 6 * 60 * 60 * 1000); // 6h
    } else {
      for (let i = 30; i >= 0; i--) pushPoint(now - i * 24 * 60 * 60 * 1000); // 1d
    }

    return res.json(pts);
  } catch (err) {
    next(err);
  }
});
// ---- GET /api/machines/:id (last, no regex in the path) ----
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // hard guard so "/uptime-series" never gets here AND bad ids 400
    if (!isObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid machine id" });
    }

    const machine = await Machine.findById(id).lean();
    if (!machine) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const sensors = {
      s1: !!machine.sensor1,
      s2: !!machine.sensor2,
      s3: !!machine.sensor3,
    };
    const status = machine.status || computeStatus(sensors);

    return res.json({
      id: String(machine._id),
      name: machine.name,
      deviceId: machine.deviceId,
      buildingId: String(machine.buildingId),
      sensors,
      status,
      createdAt: machine.createdAt,
      updatedAt: machine.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});
module.exports = router;
