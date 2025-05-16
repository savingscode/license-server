require("dotenv").config();

// license-server.js (MongoDB Edition)
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// MongoDB Connection
const DB_URL = process.env.DB_URL;
mongoose
  .connect(DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB:", err.message);
  });

// License Schema
const licenseSchema = new mongoose.Schema({
  licenseKey: { type: String, unique: true, required: true },
  email: { type: String, required: true },
  valid: { type: Boolean, default: true },
  deviceId: { type: [String], default: [] },
  lastUsed: { type: Date, default: null },
});

const License = mongoose.model("License", licenseSchema);

app.post("/validate", async (req, res) => {
  const { licenseKey, deviceId } = req.body;

  if (!licenseKey || !deviceId) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const license = await License.findOne({ licenseKey });

    if (!license || !license.valid) {
      return res
        .status(403)
        .json({ success: false, message: "Invalid license" });
    }

    if (!Array.isArray(license.deviceId)) {
      license.deviceId = license.deviceId ? [license.deviceId] : [];
    }

    const alreadyUsed = license.deviceId.includes(deviceId);

    if (!alreadyUsed) {
      // Check if limit exceeded
      if (license.deviceId.length >= 1) {
        license.valid = false;
        await license.save();
        return res.status(403).json({
          success: false,
          message: "License revoked: used on multiple devices.",
        });
      }
      license.deviceId.push(deviceId);
    }

    license.lastUsed = new Date();
    await license.save();

    res.json({ success: true, message: "License validated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Generate License Endpoint
app.post("/generate", async (req, res) => {
  const { email, licenseKey } = req.body;
  console.log(email, licenseKey);

  if (!email || !licenseKey) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const existing = await License.findOne({ licenseKey });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "License already exists" });
    }

    const newLicense = new License({ email, licenseKey });
    await newLicense.save();

    res.json({ success: true, message: "License created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error creating license" });
  }
});

// Admin: Summary stats
app.get("/licenses/summary", async (req, res) => {
  try {
    const totalLicenses = await License.countDocuments();
    const activeLicenses = await License.countDocuments({ valid: true });
    const revokedLicenses = await License.countDocuments({ valid: false });

    res.json({
      totalLicenses,
      activeLicenses,
      revokedLicenses,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Error generating summary" });
  }
});

// Admin: Get all license data
app.get("/licenses", async (req, res) => {
  try {
    const licenses = await License.find().sort({ lastUsed: -1 });
    res.json(licenses);
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching licenses" });
  }
});

// Admin: Revoke a license
app.post("/licenses/revoke", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res
      .status(400)
      .json({ success: false, message: "Missing license key" });
  }

  try {
    const license = await License.findOne({ licenseKey });

    if (!license) {
      return res
        .status(404)
        .json({ success: false, message: "License not found" });
    }

    if (!license.valid) {
      return res
        .status(400)
        .json({ success: false, message: "License is already revoked" });
    }

    license.valid = false;
    await license.save();

    res.json({ success: true, message: "License revoked successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error revoking license" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ License server running on http://localhost:${PORT}`);
});
