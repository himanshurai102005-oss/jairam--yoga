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

// ✅ Nodemailer (Render safe config)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  // 🔥 IMPORTANT (Render timeout fix)
  pool: true,
  maxConnections: 1,
  maxMessages: 50,

  // ⏱ Timeouts
  connectionTimeout: 20000, // 20 sec
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

// ✅ Send Email function
async function sendEmail(to, subject, message) {
  if (!to) {
    console.log("❌ Email missing, cannot send");
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: message,
    });

    console.log("✅ Email Sent:", to);
  } catch (err) {
    console.log("❌ Email Send Failed:", err.message);
  }
}

// ---------------------------
// ✅ WEBHOOK (RAW BODY)
// ---------------------------
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
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

      // ❌ Invalid signature
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

      // ✅ IMPORTANT: Razorpay ko instant response
      res.json({ status: "ok" });

      // ✅ Background me email bhejna (timeout fix)
      setTimeout(async () => {
        if (event === "payment.captured" || event === "payment.authorized") {
          await sendEmail(
            email,
            "Payment Successful ✅ (Jairam Yoga)",
            `Hi ${name},\n\nYour payment of ₹${amount} was successful.\n\nThank you for joining Jairam Yoga Workshop.\n\n- Team Jairam Yoga`
          );
        }

        if (event === "payment.failed") {
          await sendEmail(
            email,
            "Payment Failed ❌ (Jairam Yoga)",
            `Hi ${name},\n\nYour payment of ₹${amount} failed.\n\nPlease try again.\n\n- Team Jairam Yoga`
          );
        }
      }, 0);
    } catch (err) {
      console.log("Webhook Error:", err.message);
      return res.status(500).send("Webhook error");
    }
  }
);

// ---------------------------
// Normal middleware AFTER webhook
// ---------------------------
app.use(cors());
app.use(express.json());

// ✅ Static files serve
app.use(express.static(__dirname));

// ✅ Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "phase1.html"));
});

// ✅ Create Order
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
