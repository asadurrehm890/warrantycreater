import crypto from "crypto";

const otpMap = new Map();

// Brevo API implementation
async function sendBrevoEmail(email, code) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const SENDER_EMAIL = process.env.EMAIL_FROM;
  const SENDER_NAME = process.env.EMAIL_SENDER_NAME || "Your App";

  // Your Brevo sender email must be verified in Brevo dashboard
  const senderEmail = SENDER_EMAIL || 'no-reply@yourdomain.com';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: SENDER_NAME,
        email: senderEmail
      },
      to: [{
        email: email
      }],
      subject: "Your Warranty Activation OTP",
      textContent: `Your OTP code is: ${code}. It is valid for 10 minutes.`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Warranty Activation Code</h2>
          <p>Use the following OTP to activate your warranty:</p>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2563eb;">${code}</span>
          </div>
          <p><small>This code expires in 10 minutes.</small></p>
        </div>
      `
    })
  });

  const responseData = await response.json();

  if (!response.ok) {
    console.error('Brevo API Error:', {
      status: response.status,
      message: responseData.message,
      code: responseData.code
    });
    throw new Error(`Email failed: ${responseData.message || response.statusText}`);
  }

  console.log('Brevo API Success:', responseData);
  return responseData;
}

export async function createOtp(email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  otpMap.set(token, { email, code, expiresAt });

  console.log(`Generated OTP for ${email}: ${code}`);

  try {
    // Use Brevo API
    await sendBrevoEmail(email, code);
    console.log(`✅ OTP email sent to ${email} via Brevo API`);
  } catch (err) {
    console.error("❌ Error sending OTP email:", err.message);
    
    // Fallback for debugging - log OTP in production
    console.log(`🔑 OTP for ${email}: ${code} (Token: ${token})`);
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