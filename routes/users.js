const express = require("express");
const prisma = require("../prisma/client");

const app = express.Router();
/// tiny helpers so you can create test users/admins quickly
app.post("/users", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "All fields are required" });
    }
    const user = await prisma.users.create({
      data: { username, email, password, owned: null },
    });
    res.json({ success: true, user });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ success: false, error: "Failed to create user" });
  }
});

app.post("/admins", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "All fields are required" });
    }
    const admin = await prisma.admin_users.create({
      data: { username, email, password },
    });
    res.json({ success: true, admin });
  } catch (err) {
    console.error("Create admin error:", err);
    res.status(500).json({ success: false, error: "Failed to create admin" });
  }
});

module.exports = app;
