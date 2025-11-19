// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const cron = require("node-cron");
const shortid = require("shortid");
const path = require("path");

// lowdb setup (simple JSON DB)
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync("db.json");
const db = low(adapter);

// defaults
db.defaults({ appointments: [], settings: { reminderHoursBefore: 24 } }).write();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Twilio config via env
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || "";
const USE_TWILIO = TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM;

let twilioClient = null;
if (USE_TWILIO) {
  const Twilio = require("twilio");
  twilioClient = new Twilio(TWILIO_SID, TWILIO_TOKEN);
  console.log("Twilio enabled");
} else {
  console.log("Twilio not configured — SMS will be logged to console (mock mode).");
}

// Helper to send SMS (or mock)
async function sendSms(to, body) {
  if (USE_TWILIO) {
    try {
      const msg = await twilioClient.messages.create({ body, from: TWILIO_FROM, to });
      console.log("SMS sent:", msg.sid);
      return msg.sid;
    } catch (e) {
      console.error("Twilio error:", e.message);
      return null;
    }
  } else {
    console.log(`[MOCK SMS] To: ${to} — ${body}`);
    return "MOCK";
  }
}

// Serve frontend static if exists (optional)
app.use(express.static(path.join(__dirname, "public")));

// API: book
app.post("/api/book", async (req, res) => {
  const { name, phone, service, date, time } = req.body;
  if (!name || !phone || !service || !date || !time) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // generate queue number (simple: count + 1)
  const todayKey = date; // group by date
  const todays = db.get("appointments").filter({ date }).value();
  const queueNumber = todays.length + 1;
  const id = shortid.generate();

  const appt = {
    id, name, phone, service, date, time,
    createdAt: new Date().toISOString(),
    queueNumber,
    status: "pending" // pending, called, served
  };

  db.get("appointments").push(appt).write();

  // send confirmation SMS
  const confMsg = `Your appointment is confirmed. Service: ${service}. Date: ${date} ${time}. Queue #: ${queueNumber}.`;
  sendSms(phone, confMsg);

  res.json({ success: true, queueNumber, id });
});

// API: get queue (pending only)
app.get("/api/queue", (req, res) => {
  const all = db.get("appointments").filter({ status: "pending" }).sortBy("createdAt").value();
  res.json(all);
});

// API: call next (marks next pending as "called" and sends SMS)
app.post("/api/callNext", async (req, res) => {
  const next = db.get("appointments").filter({ status: "pending" }).sortBy("createdAt").first().value();
  if (!next) return res.json({ success: false, message: "No pending appointments." });

  db.get("appointments").find({ id: next.id }).assign({ status: "called", calledAt: new Date().toISOString() }).write();

  const msg = `Dear ${next.name}, your queue number ${next.queueNumber} is being called. Please proceed to the counter.`;
  await sendSms(next.phone, msg);

  res.json({ success: true, message: `Called queue #${next.queueNumber}` });
});

// API: mark served
app.post("/api/served", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Missing id" });
  db.get("appointments").find({ id }).assign({ status: "served", servedAt: new Date().toISOString() }).write();
  res.json({ success: true });
});

// API: search
app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  if (!q) return res.json([]);
  const results = db.get("appointments").filter(a =>
    (a.name || "").toLowerCase().includes(q) ||
    (a.phone || "").toLowerCase().includes(q) ||
    (String(a.queueNumber)||"").includes(q)
  ).value();
  res.json(results);
});

// Scheduler: every minute check for appointments that need reminders
const reminderHours = db.get("settings.reminderHoursBefore").value() || 24;

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const appts = db.get("appointments").filter({ status: "pending" }).value();
    for (const a of appts) {
      // appointment datetime
      const apptDt = new Date(`${a.date}T${a.time}:00`);
      const diffHours = (apptDt - now) / (1000 * 60 * 60);

      // If within reminder window (approx equal to reminderHours, allow small window)
      if (diffHours <= reminderHours && diffHours > (reminderHours - 0.02)) {
        // send reminder once: mark as reminderSent to avoid duplicates
        if (!a.reminderSent) {
          const msg = `Reminder: Your appointment for ${a.service} is on ${a.date} ${a.time}. Queue #: ${a.queueNumber}.`;
          await sendSms(a.phone, msg);
          db.get("appointments").find({ id: a.id }).assign({ reminderSent: true }).write();
          console.log("Reminder sent for", a.id);
        }
      }
    }
  } catch (e) {
    console.error("Scheduler error", e.message);
  }
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CivicEase server running on port ${PORT}`);
  console.log(`Reminder window: ${reminderHours} hours before appointment`);
});
