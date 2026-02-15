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

// ✅ Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendEmail(to, subject, message) {
  if (!to) return;

  await transporter.sendMail({
    from: `"Jairam Yoga" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: message,
  });
}

// ---------------------------
// ✅ WEBHOOK (RAW BODY REQUIRED)
// ---------------------------
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers["x-razorpay-signature"];

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(req.body)
        .digest("hex");

      if (expectedSignature !== signature) {
        console.log("❌ Invalid signature");
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

      console.log("✅ Webhook Event:", event);
      console.log("Customer:", name, email, phone);

      // ✅ SUCCESS
      if (event === "payment.captured") {
        await sendEmail(
          email,
          "Payment Successful ✅ (Jairam Yoga)",
          `Hi ${name},\n\nYour payment of ₹${amount} was successful.\n\nYou are registered for Jairam Yoga Workshop.\n\nThank you!\n\n- Team Jairam Yoga`
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
  }
);

// ---------------------------
// Normal middleware AFTER webhook
// ---------------------------
app.use(cors());
app.use(express.json());

// ---------------------------
// Serve frontend
// ---------------------------
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---------------------------
// Create Order
// ---------------------------
app.post("/create-order", async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const order = await razorpay.orders.create({
      amount: 100,
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
      notes: {
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
      },
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
