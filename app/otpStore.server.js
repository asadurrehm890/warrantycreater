import crypto from "crypto";

const otpMap = new Map();

// Function to send email via Brevo API
async function sendBrevoEmail(email, code) {
  const apiKey = process.env.EMAIL_PASS; // This is correct
  const senderEmail = process.env.EMAIL_FROM;
  const senderName = "Mobitel";
  
  // Fix: Check for EMAIL_PASS instead of BREVO_API_KEY
  if (!apiKey) {
    throw new Error("EMAIL_PASS is not configured");
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
          name: email.split('@')[0]
        }
      ],
      subject: "Your Mobitel Warranty Activation Code (Valid for 10 Minutes)",
      textContent: `Your OTP code is: ${code}. It is valid for 10 minutes.`,
      htmlContent: `<!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Your Mobitel Warranty Activation Code</title>
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
                      color: #ed1d24; 
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
                                            <a href="https://mobitel.uk/"><img src="https://cdn.shopify.com/s/files/1/0990/1559/0226/files/Mobitel-logoResized.png?v=3337" width="100" height="86.66" /></a>
                                          </h1>
                                        </td>
                                        <td align="right">
                                          <span class="order-number__text"></span>
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
                                    
                                    <p>Your One-Time Password for warranty activation is:</p>
                                    <div class="otp-container">
                                      <span class="otp-code">${code}</span>
                                    </div>
                                    <p>This OTP is valid for <span class="validity-note">10 minutes</span>.</p>
                                    
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
                                  <p> If you didn't request this code, please ignore this email or contact us at <a href="mailto:info@mobitel.uk">info@mobitel.uk</a></p>
                                    
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

  // Fix: Get response data properly
  let responseData;
  try {
    responseData = await response.json();
  } catch (e) {
    responseData = { message: 'Could not parse response' };
  }

  if (!response.ok) {
    console.error('Brevo API Error Details:', {
      status: response.status,
      statusText: response.statusText,
      error: responseData
    });
    throw new Error(`Failed to send email: ${responseData.message || response.statusText || 'Unknown error'}`);
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
  // Fix: Check for EMAIL_PASS instead of BREVO_API_KEY
  console.log('Environment check:', {
    hasEmailPass: !!process.env.EMAIL_PASS,
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