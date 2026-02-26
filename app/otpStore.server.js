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

  // const response = await fetch('https://api.brevo.com/v3/smtp/email', {
  //   method: 'POST',
  //   headers: {
  //     'api-key': apiKey,
  //     'Content-Type': 'application/json',
  //     'accept': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     sender: {
  //       name: senderName,
  //       email: senderEmail
  //     },
  //     to: [
  //       {
  //         email: email,
  //         name: email.split('@')[0] // Optional: extract name from email
  //       }
  //     ],
  //     subject: "Your Warranty Activation OTP",
  //     textContent: `Your OTP code is: ${code}. It is valid for 10 minutes.`,
  //     htmlContent: `
  //       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  //         <h2 style="color: #333;">Warranty Activation OTP</h2>
  //         <p>Your One-Time Password for warranty activation is:</p>
  //         <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
  //           <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #2563eb;">${code}</span>
  //         </div>
  //         <p>This OTP is valid for <strong>10 minutes</strong>.</p>
  //         <p>If you didn't request this code, please ignore this email.</p>
  //         <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  //         <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
  //       </div>
  //     `,
  //     // Optional: Add tags for tracking
  //     tags: ['otp', 'warranty-activation']
  //   })
  // });


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
        name: email.split('@')[0]
      }
    ],
    subject: "Your Warranty Activation OTP",
    textContent: `Your OTP code is: ${code}. It is valid for 10 minutes.`,
    htmlContent: `<!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Your Warranty Activation OTP</title>
                  <style>
                    body { 
                      font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; 
                      margin: 0; 
                      padding: 0; 
                      background-color: #f9f9f9; 
                    }
                    .body { 
                      width: 100%; 
                      background-color: #f9f9f9; 
                    }
                    table { 
                      border-collapse: collapse; 
                      width: 100%; 
                    }
                    td { 
                      font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; 
                    }
                    .header-row { 
                      background-color: #ffffff; 
                    }
                    .header__cell { 
                      padding: 20px 0; 
                      background-color: #ffffff; 
                    }
                    .container { 
                      width: 560px; 
                      margin: 0 auto; 
                    }
                    .shop-name__text { 
                      font-size: 24px; 
                      font-weight: 500; 
                      color: #333333; 
                      margin: 0; 
                      line-height: 1.2; 
                    }
                    .shop-name__text a { 
                      color: #333333; 
                      text-decoration: none; 
                    }
                    .order-number__text { 
                      font-size: 14px; 
                      color: #7d7d7d; 
                      line-height: 1.5; 
                    }
                    .content { 
                      background-color: #ffffff; 
                    }
                    .content__cell { 
                      padding: 40px 0; 
                      background-color: #ffffff; 
                    }
                    h2 { 
                      font-size: 24px; 
                      font-weight: 400; 
                      color: #333333; 
                      margin: 0 0 20px 0; 
                      line-height: 1.3; 
                    }
                    p { 
                      font-size: 16px; 
                      color: #4f4f4f; 
                      margin: 0 0 20px 0; 
                      line-height: 1.5; 
                    }
                    .otp-container { 
                      background: #f5f5f5; 
                      padding: 30px 20px; 
                      text-align: center; 
                      margin: 20px 0; 
                      border-radius: 8px; 
                    }
                    .otp-code { 
                      font-size: 42px; 
                      font-weight: 600; 
                      letter-spacing: 12px; 
                      color: #2563eb; 
                      line-height: 1.3; 
                    }
                    .validity-note { 
                      font-weight: 500; 
                      color: #333333; 
                    }
                    hr { 
                      border: none; 
                      border-top: 1px solid #e8e8e8; 
                      margin: 30px 0; 
                    }
                    .footer { 
                      background-color: #f9f9f9; 
                    }
                    .footer__cell { 
                      padding: 30px 0; 
                    }
                    .disclaimer__subtext { 
                      font-size: 14px; 
                      color: #7d7d7d; 
                      margin: 0; 
                    }
                    .disclaimer__subtext a { 
                      color: #7d7d7d; 
                    }
                    @media (max-width: 600px) {
                      .container { 
                        width: 100% !important; 
                        padding: 0 20px !important; 
                      }
                      .otp-code { 
                        font-size: 32px; 
                        letter-spacing: 8px; 
                      }
                    }
                  </style>
                </head>
                <body>
                  <table class="body" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <!-- Header -->
                        <table class="header-row" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td class="header__cell" align="center">
                              <table class="container" width="560" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td>
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td class="shop-name__cell" align="left">
                                          <h1 class="shop-name__text">
                                            <a href="${shopUrl || '#'}">${shopName || 'Your Store'}</a>
                                          </h1>
                                        </td>
                                        <td align="right">
                                          <span class="order-number__text">Warranty Activation</span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Main Content -->
                        <table class="content" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td class="content__cell" align="center">
                              <table class="container" width="560" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td>
                                    <h2>Warranty Activation OTP</h2>
                                    <p>Hi ${customerName || 'there'},</p>
                                    <p>Your One-Time Password for warranty activation is:</p>
                                    <div class="otp-container">
                                      <span class="otp-code">${code}</span>
                                    </div>
                                    <p>This OTP is valid for <span class="validity-note">10 minutes</span>.</p>
                                    <p>If you didn't request this code, please ignore this email or contact us immediately.</p>
                                    <hr>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Footer -->
                        <table class="footer" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td class="footer__cell" align="center">
                              <table class="container" width="560" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td>
                                    <p class="disclaimer__subtext">
                                      If you have any questions, contact us at 
                                      <a href="mailto:${senderEmail}">${senderEmail}</a>
                                    </p>
                                    <p class="disclaimer__subtext" style="margin-top: 10px;">
                                      This is an automated message, please do not reply.
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>`
                  })
     });





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