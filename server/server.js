require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 6105;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3105';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Connect to SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) return console.error("❌ Failed to connect:", err.message);
  console.log('✅ Connected to SQLite database.');
});

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    roll TEXT,
    branch TEXT,
    year TEXT,
    contact TEXT
  )
`, (err) => {
  if (err) console.error("❌ Error creating users table:", err.message);
  else console.log("✅ Users table ready.");
});

// Create datacheck table
db.run(`
  CREATE TABLE IF NOT EXISTS datacheck (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    roll TEXT,
    branch TEXT,
    year TEXT,
    dateReceived TEXT,
    platform TEXT,
    sender TEXT,
    contact TEXT,
    category TEXT,
    flags TEXT,
    responded TEXT,
    personalDetails TEXT,
    genuineRating TEXT,
    message TEXT,
    status TEXT
  )
`, (err) => {
  if (err) console.error("❌ Error creating datacheck table:", err.message);
  else console.log("✅ Datacheck table ready.");
});

// Insert complaint data
app.post('/api/user-check-data', (req, res) => {
  const {
    name, roll, branch, year, dateReceived,
    platform, sender, contact, category,
    flags, responded, personalDetails,
    genuineRating, message
  } = req.body;

  const flagsString = JSON.stringify(flags);

  const sql = `
    INSERT INTO datacheck (
      name, roll, branch, year, dateReceived,
      platform, sender, contact, category,
      flags, responded, personalDetails, genuineRating, message, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    name, roll, branch, year, dateReceived,
    platform, sender, contact, category,
    flagsString, responded, personalDetails, genuineRating, message, 'null'
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("❌ DB Insert Error:", err.message);
      return res.status(500).send(err.message);
    }
    console.log("✅ Data inserted, ID:", this.lastID);
    res.json({ success: true, id: this.lastID });
  });
});

// Get all datacheck entries
app.get('/api/datas', (req, res) => {
  db.all('SELECT * FROM datacheck', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Get all users
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Add user
app.post('/api/users', (req, res) => {
  const { name, roll, branch, year, contact } = req.body;

  const sql = `
    INSERT INTO users (name, roll, branch, year, contact)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [name, roll, branch, year, contact], function (err) {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true, id: this.lastID });
  });
});

// Update status
app.put('/api/update-status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const sql = `UPDATE datacheck SET status = ? WHERE id = ?`;
  db.run(sql, [status, id], function (err) {
    if (err) {
      console.error("❌ Error updating status:", err.message);
      return res.status(500).send(err.message);
    }
    console.log(`✅ Status updated for ID ${id} to ${status}`);
    res.json({ success: true });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
