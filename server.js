const path = require("path");
const dotenv = require("dotenv");
const express = require("express");
const bodyParser = require("body-parser");
const { createMollieClient } = require("@mollie/api-client");

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

// Local modules
const db = require("./utils/db");
const { setupSSE } = require("./utils/sse");
const { sendConfirmationEmail } = require("./utils/mailer");

// Routes
const paymentsRouter = require("./routes/payments");
const diagnosticsRouter = require("./routes/diagnostics");

const app = express();
const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const MOLLIE_KEY = process.env.MOLLIE_API_KEY;

if (!MOLLIE_KEY) {
  console.error("❌ Missing MOLLIE_API_KEY in .env");
  process.exit(1);
}

// Serve static payment files
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "live.html"));
});

const mollie = createMollieClient({ apiKey: MOLLIE_KEY });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// SSE setup
const { clients, broadcastPayment } = setupSSE(app);

// Routes
app.use("/diagnostics", diagnosticsRouter(BASE_URL, MOLLIE_KEY, db));
app.use("/", paymentsRouter(mollie, db, broadcastPayment, sendConfirmationEmail));

// Serve React frontend (if needed)
// app.use(express.static(path.join(__dirname, "../dist")));

app.get("/donatie", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/live", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "live.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
});
