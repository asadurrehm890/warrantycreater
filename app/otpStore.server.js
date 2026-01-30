import crypto from "crypto";

const otpMap = new Map();

// Function to send email via Brevo API
async function sendBrevoEmail(email, code) {
  const apiKey = process.env.EMAIL_PASS;
  const senderEmail = process.env.EMAIL_FROM;
  const senderName = "Mobitel";
  
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }
  
  if (!senderEmail) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: email,
          name: email.split('@')[0] // Optional: extract name from email
        }
      ],
      subject: "Your Warranty Activation OTP",
      textContent: `Your OTP code is: ${code}. It is valid for 10 minutes.`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Warranty Activation OTP</h2>
          <p>Your One-Time Password for warranty activation is:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #2563eb;">${code}</span>
          </div>
          <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          <p>If you didn't request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      `,
      // Optional: Add tags for tracking
      tags: ['otp', 'warranty-activation']
    })
  });

  const responseData = await response.json();

  if (!response.ok) {
    console.error('Brevo API Error Details:', {
      status: response.status,
      statusText: response.statusText,
      error: responseData
    });
    throw new Error(`Failed to send email: ${responseData.message || 'Unknown error'}`);
  }

  console.log('Brevo API Response:', responseData);
  return responseData;
}

export async function createOtp(email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  otpMap.set(token, { email, code, expiresAt });

  console.log(`Generated OTP for ${email}: ${code}`);
  console.log('Environment check:', {
    hasBrevoKey: !!process.env.BREVO_API_KEY,
    hasEmailFrom: !!process.env.EMAIL_FROM
  });

  try {
    // Use Brevo API instead of SMTP
    await sendBrevoEmail(email, code);
    console.log(`✅ OTP email sent to ${email} via Brevo API`);
  } catch (err) {
    console.error("❌ Error sending OTP email via API:", {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    // Important: Log OTP in production for debugging
    console.log(`🔑 OTP for ${email}: ${code} (Token: ${token})`);
    
    // Optional: You might want to throw or handle this differently
    // throw err; // Uncomment if you want to propagate the error
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