// app/warrantyEmail.server.js
export async function sendWarrantyStatusEmail({
  email,
  customerName,
  productName,
  status,
  startDate,
  endDate,
  orderInvoiceNumber,
  serialNumber,
  purchaseDate,
  purchaseSource,
}) {
  const apiKey = process.env.EMAIL_PASS;
  const senderEmail = process.env.EMAIL_FROM;
  const senderName = "Mobitel";

  if (!apiKey) {
    throw new Error("EMAIL_PASS is not configured");
  }

  if (!senderEmail) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const safeCustomerName =
    customerName && customerName.trim().length > 0
      ? customerName
      : email.split("@")[0];

  const subject = `Your Mobitel Warranty Status: ${status || "Pending"}`;

  const textContent = `
Dear ${safeCustomerName},

This is an update about your Mobitel product warranty.

Product: ${productName || "N/A"}
Status: ${status || "Pending"}
Warranty start date: ${startDate || "N/A"}
Warranty end date: ${endDate || "N/A"}
Order / Invoice number: ${orderInvoiceNumber || "N/A"}
Serial number: ${serialNumber || "N/A"}
Purchase date: ${purchaseDate || "N/A"}
Purchase source: ${purchaseSource || "N/A"}

If you have any questions, please contact us at info@mobitel.uk.

Best regards,
Mobitel
`.trim();

  // HTML version – same header/footer styles as OTP, different body
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Mobitel Warranty Status</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; 
      margin: 0; 
      padding: 0; 
      background-color: #f9f9f9; 
    }
    .body { width: 100%; background-color: #f9f9f9; }
    table { border-collapse: collapse; width: 100%; }
    td { font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; }
    .header-row { background-color: #ffffff; }
    .header__cell { padding: 20px 0; background-color: #ffffff; }
    .container { width: 560px; margin: 0 auto; }
    .shop-name__text { font-size: 24px; font-weight: 500; color: #333333; margin: 0; line-height: 1.2; }
    .shop-name__text a { color: #333333; text-decoration: none; }
    .order-number__text { font-size: 14px; color: #7d7d7d; line-height: 1.5; }
    .content { background-color: #ffffff; }
    .content__cell { background-color: #ffffff; }
    h2 { font-size: 24px; font-weight: 400; color: #333333; margin: 0 0 20px 0; line-height: 1.3; }
    p { font-size: 16px; color: #4f4f4f; margin: 0 0 20px 0; line-height: 1.5; }
    .summary-box { 
      background: #f5f5f5; 
      padding: 20px; 
      margin: 20px 0; 
      border-radius: 8px; 
    }
    .summary-row { margin-bottom: 8px; }
    .summary-label { font-weight: 600; color: #333333; }
    .status-pill {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 14px;
      color: #ffffff;
    }
    .status-pending { background-color: #f59e0b; }
    .status-approved { background-color: #10b981; }
    .status-rejected { background-color: #ef4444; }
    .status-in-process { background-color: #3b82f6; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 30px 0; }
    .footer { background-color: #f9f9f9; }
    .footer__cell { padding: 30px 0; }
    .disclaimer__subtext { font-size: 14px; color: #7d7d7d; margin: 0; }
    .disclaimer__subtext a { color: #7d7d7d; }
    @media (max-width: 600px) {
      .container { 
        width: 100% !important; 
        padding: 0 20px !important; 
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
                            <a href="https://mobitel.uk/">
                              <img src="https://cdn.shopify.com/s/files/1/0990/1559/0226/files/Mobitel-logoResized.png?v=3337" width="100" height="86.66" />
                            </a>
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
                    <h2>Warranty status update</h2>
                    <p>Dear ${safeCustomerName},</p>
                    <p>
                      This is an update about your Mobitel product warranty. You can find the details of your warranty below.
                    </p>

                    <div class="summary-box">
                      <div class="summary-row">
                        <span class="summary-label">Product:</span>
                        <span> ${productName || "N/A"}</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Warranty status:</span>
                        <span>
                          <span class="status-pill ${
                            (status || "Pending").toLowerCase() === "approved"
                              ? "status-approved"
                              : (status || "Pending").toLowerCase() === "rejected"
                              ? "status-rejected"
                              : (status || "Pending").toLowerCase() === "in process"
                              ? "status-in-process"
                              : "status-pending"
                          }">
                            ${status || "Pending"}
                          </span>
                        </span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Warranty start date:</span>
                        <span> ${startDate || "N/A"}</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Warranty end date:</span>
                        <span> ${endDate || "N/A"}</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Order / Invoice #:</span>
                        <span> ${orderInvoiceNumber || "N/A"}</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Serial number:</span>
                        <span> ${serialNumber || "N/A"}</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Purchase date:</span>
                        <span> ${purchaseDate || "N/A"}</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">Purchase source:</span>
                        <span> ${purchaseSource || "N/A"}</span>
                      </div>
                    </div>

                    <p>
                      If any of the details above look incorrect, or if you have any questions, please reply to this email or contact us at <a href="mailto:info@mobitel.uk">info@mobitel.uk</a>.
                    </p>

                    <p>Best regards,<br/>Mobitel</p>

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
                      You’re receiving this message because you registered a product warranty with Mobitel.
                      If you didn’t expect this, please contact us at
                      <a href="mailto:info@mobitel.uk">info@mobitel.uk</a>.
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
</html>`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email,
          name: safeCustomerName,
        },
      ],
      subject,
      textContent,
      htmlContent,
    }),
  });

  let responseData;
  try {
    responseData = await response.json();
  } catch (e) {
    responseData = { message: "Could not parse response" };
  }

  if (!response.ok) {
    console.error("Brevo warranty email error:", {
      status: response.status,
      statusText: response.statusText,
      error: responseData,
    });
    throw new Error(
      `Failed to send warranty email: ${
        responseData.message || response.statusText || "Unknown error"
      }`,
    );
  }

  console.log("Brevo warranty email response:", responseData);
  return responseData;
}