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

// ---------------------------
// ✅ BREVO SMTP Setup
// ---------------------------
const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST, // smtp-relay.brevo.com
  port: Number(process.env.BREVO_SMTP_PORT || 587),
  secure: false, // port 587 = false
  auth: {
    user: process.env.BREVO_SMTP_USER, // Brevo SMTP login
    pass: process.env.BREVO_SMTP_PASS, // Brevo SMTP key
  },
});

// ✅ Send Email function
async function sendEmail(to, subject, message) {
  if (!to) return;

  try {
    const info = await transporter.sendMail({
      from: `"Jairam Yoga" <${process.env.BREVO_SMTP_USER}>`,
      to,
      subject,
      text: message,
    });

    console.log("✅ Email Sent:", info.messageId);
  } catch (err) {
    console.log("❌ Email Send Failed:", err.message);
  }
}

// ---------------------------
// ✅ WEBHOOK (MUST BE RAW)
// ---------------------------
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("WEBHOOK HIT ✅");

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

    if (expectedSignature !== signature) {
      console.log("❌ Invalid Signature");
      return res.status(400).send("Invalid signature ❌");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload.event;

    const payment = payload.payload.payment?.entity;
    const amount = (payment?.amount || 0) / 100;

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
    }

    // ❌ FAILED
    if (event === "payment.failed") {
      await sendEmail(
        email,
        "Payment Failed ❌ (Jairam Yoga)",
        `Hi ${name},\n\nYour payment of ₹${amount} failed.\n\nPlease try again.\n\n- Team Jairam Yoga`
      );
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

// ✅ Static files serve
app.use(express.static(__dirname));

// ✅ Homepage = phase1.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "phase1.html"));
});

// ✅ Create Order (₹1)
app.post("/create-order", async (req, res) => {
  try {
    const order = await razorpay.orders.create({
      amount: 100,
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
app.get("/test-mail", async (req, res) => {
  try {
    await sendEmail(
      "YOUR_EMAIL@gmail.com",
      "Test Mail from Render ✅",
      "Bhai agar ye mail aa gayi to SMTP working hai 🔥"
    );

    res.send("Mail sent ✅");
  } catch (err) {
    console.log("❌ Email Send Failed:", err.message);
    res.status(500).send("Mail failed ❌");
  }
});


