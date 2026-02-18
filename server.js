const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config();

const app = express();

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Email setup (Gmail App Password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Send Email function
async function sendEmail(to, subject, message) {
  if (!to) return;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: message,
  });
}

// ---------------------------
// ✅ WEBHOOK (MUST BE RAW)
// ---------------------------
// ⚠️ This must come BEFORE express.json()
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("WEBHOOK HIT ✅"); // ✅ Confirm webhook hit

  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      console.log("❌ RAZORPAY_WEBHOOK_SECRET missing in ENV");
      return res.status(500).send("Webhook secret missing");
    }

    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    // ❌ Invalid webhook
    if (expectedSignature !== signature) {
      console.log("❌ Invalid Signature");
      console.log("Expected:", expectedSignature);
      console.log("Received:", signature);
      return res.status(400).send("Invalid signature ❌");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload.event;

    const payment = payload.payload.payment?.entity;
    const amount = (payment?.amount || 0) / 100;

    // 👇 User details frontend se "notes" me aayengi
    const notes = payment?.notes || {};
    const name = notes.customer_name || "Customer";
    const email = notes.customer_email || payment?.email;
    const phone = notes.customer_phone || payment?.contact;

    console.log("Webhook Event:", event);
    console.log("Customer:", name, email, phone);

    // ✅ SUCCESS
    if (event === "payment.captured" || event === "payment.authorized") {
      await sendEmail(
        email,
        "Payment Successful ✅ (Jairam Yoga)",
        `Hi ${name},\n\nYour payment of ₹${amount} was successful.\n\nThank you for joining Jairam Yoga Workshop.\n\n- Team Jairam Yoga`
      );

      console.log("✅ Success email sent to:", email);
    }

    // ❌ FAILED
    if (event === "payment.failed") {
      await sendEmail(
        email,
        "Payment Failed ❌ (Jairam Yoga)",
        `Hi ${name},\n\nYour payment of ₹${amount} failed.\n\nPlease try again.\n\n- Team Jairam Yoga`
      );

      console.log("⚠️ Failed email sent to:", email);
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.log("Webhook Error:", err.message);
    res.status(500).send("Webhook error");
  }
});

// ---------------------------
// Normal middleware AFTER webhook
// ---------------------------
app.use(cors());
app.use(express.json());

// ✅ Static files serve (images, css, etc.)
app.use(express.static(__dirname));

// ✅ Homepage = phase1.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "phase1.html"));
});

// ✅ Create Order (₹1)
app.post("/create-order", async (req, res) => {
  try {
    const order = await razorpay.orders.create({
      amount: 100, // ₹1
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
