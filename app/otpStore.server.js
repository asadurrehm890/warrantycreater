
import crypto from "crypto";
import nodemailer from "nodemailer";

const otpMap = new Map();

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: Number(587),
      secure: false, // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      
      tls: {
        minVersion: 'TLSv1.2',
      },

      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

export async function createOtp(email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000; 

  otpMap.set(token, { email, code, expiresAt });

  console.log(`Generated OTP for ${email}: ${code}`);

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Your Warranty Activation OTP",
      text: `Your OTP code is: ${code}. It is valid for 10 minutes.`,
      html: `<p>Your OTP code is: <strong>${code}</strong></p><p>It is valid for 10 minutes.</p>`,
    });
    console.log(`OTP email sent to ${email}`);
  } catch (err) {
    console.error("Error sending OTP email:", err);
   
  }

  return token;
}

export function verifyOtp(email, token, code) {
  const record = otpMap.get(token);
  if (!record) return false;
  if (record.email !== email) return false;
  if (record.expiresAt < Date.now()) {
    otpMap.delete(token);
    return false;
  }
  const ok = record.code === code;
  if (ok) otpMap.delete(token);
  return ok;
}