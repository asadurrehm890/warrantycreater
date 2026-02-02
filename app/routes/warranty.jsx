import React, { useState } from "react";
import "../styles/warranty.css"; 

export default function WarrantyPage() {
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpToken, setOtpToken] = useState(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null); 

  async function handleSendOtp(e) {
    e.preventDefault();
    setStatusType(null);
    setStatus("Sending OTP...");
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setOtpToken(data.token);
        setStatus("OTP sent. Check your email.");
        setStatusType("success");
      } else {
        setStatus(data.error || "Failed to send OTP.");
        setStatusType("error");
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to send OTP.");
      setStatusType("error");
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setStatusType(null);
    setStatus("Verifying OTP...");
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, token: otpToken }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setEmailVerified(true);
        setStatus("Email verified.");
        setStatusType("success");
      } else {
        setStatus(data.error || "Invalid OTP.");
        setStatusType("error");
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to verify OTP.");
      setStatusType("error");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!emailVerified) {
      setStatus("Please verify your email first.");
      setStatusType("error");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries());
    body.email = email;
    body.otpToken = otpToken;

    setStatusType(null);
    setStatus("Submitting warranty...");
    try {
      const res = await fetch("/api/submit-warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("Warranty submitted successfully.");
        setStatusType("success");
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setStatus(data.error || "Failed to submit warranty.");
        setStatusType("error");
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to submit warranty.");
      setStatusType("error");
    }
  }

  return (
    <main className="warranty-container">
      <div className="warranty-header">
        <h1>Warranty Activation & Support</h1>
        <p className="warranty-subtitle">Activate your product warranty or submit a product query</p>
      </div>

      <div className="warranty-content">
        {/* Email Verification Section */}
        <section className="warranty-card">
          <div className="card-header">
            <h2><span className="step-number">1</span> Email Verification</h2>
            <p className="card-description">We'll send a verification code to your email address</p>
          </div>
          
          <div className="card-body">
            {!emailVerified ? (
              <>
                <form className="form-grid" onSubmit={handleSendOtp}>
                  <div className="form-field">
                    <label htmlFor="warranty-email" className="form-label">
                      Email Address <span className="required">*</span>
                    </label>
                    <div className="input-with-button">
                      <input
                        id="warranty-email"
                        className="form-input"
                        type="email"
                        name="customer_email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                      />
                      <button className="form-button primary" type="submit">
                        Request OTP
                      </button>
                    </div>
                  </div>
                </form>

                {otpToken && (
                  <form className="form-grid" onSubmit={handleVerifyOtp}>
                    <div className="form-field">
                      <label htmlFor="warranty-otp" className="form-label">
                        Verification Code <span className="required">*</span>
                      </label>
                      <div className="input-with-button">
                        <input
                          id="warranty-otp"
                          className="form-input"
                          type="text"
                          name="otp"
                          required
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          placeholder="Enter 6-digit code"
                          maxLength="6"
                        />
                        <button className="form-button secondary" type="submit">
                          Verify OTP
                        </button>
                      </div>
                      <p className="field-hint">Enter the 6-digit code sent to your email</p>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className="verification-success">
                <div className="success-icon">✓</div>
                <div className="success-content">
                  <h3>Email Verified Successfully!</h3>
                  <p>Your email address has been verified. You can now proceed to fill out the warranty form.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Customer Information Section */}
        <section className="warranty-card" style={{ opacity: emailVerified ? 1 : 0.6 }}>
          <div className="card-header">
            <h2><span className="step-number">2</span> Customer Information</h2>
            <p className="card-description">Please fill in your personal details</p>
          </div>
          
          <div className="card-body">
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="full_name" className="form-label">
                    Full Name <span className="required">*</span>
                  </label>
                  <input
                    id="full_name"
                    className="form-input"
                    type="text"
                    name="full_name"
                    required
                    disabled={!emailVerified}
                    placeholder="John Smith"
                  />
                </div>
                
                <div className="form-field">
                  <label htmlFor="phone" className="form-label">
                    Phone Number <span className="required">*</span>
                  </label>
                  <input
                    id="phone"
                    className="form-input"
                    type="tel"
                    name="phone"
                    required
                    disabled={!emailVerified}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
              
              <div className="form-field">
                <label htmlFor="street" className="form-label">
                  Street Address <span className="required">*</span>
                </label>
                <input
                  id="street"
                  className="form-input"
                  type="text"
                  name="street"
                  required
                  disabled={!emailVerified}
                  placeholder="123 Main Street"
                />
              </div>
              
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="town" className="form-label">
                    Town / City <span className="required">*</span>
                  </label>
                  <input
                    id="town"
                    className="form-input"
                    type="text"
                    name="town"
                    required
                    disabled={!emailVerified}
                    placeholder="New York"
                  />
                </div>
                
                <div className="form-field">
                  <label htmlFor="country" className="form-label">
                    Country <span className="required">*</span>
                  </label>
                  <input
                    id="country"
                    className="form-input"
                    type="text"
                    name="country"
                    required
                    disabled={!emailVerified}
                    placeholder="United States"
                  />
                </div>
                
                <div className="form-field">
                  <label htmlFor="postal_code" className="form-label">
                    Postal Code <span className="required">*</span>
                  </label>
                  <input
                    id="postal_code"
                    className="form-input"
                    type="text"
                    name="postal_code"
                    required
                    disabled={!emailVerified}
                    placeholder="10001"
                  />
                </div>
              </div>
              
              <div className="section-divider">
                <h3>Order Details</h3>
              </div>
              
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="purchase_source" className="form-label">
                    Purchase Source <span className="required">*</span>
                  </label>
                  <select
                    id="purchase_source"
                    className="form-select"
                    name="purchase_source"
                    required
                    disabled={!emailVerified}
                  >
                    <option value="">Select source...</option>
                    <option value="Online Store">Online Store</option>
                    <option value="Physical Store">Physical Store</option>
                    <option value="Third-Party Retailer">Third-Party Retailer</option>
                  </select>
                </div>
                
                <div className="form-field">
                  <label htmlFor="purchase_date" className="form-label">
                    Purchase Date <span className="required">*</span>
                  </label>
                  <input
                    id="purchase_date"
                    className="form-input"
                    type="date"
                    name="purchase_date"
                    required
                    disabled={!emailVerified}
                  />
                </div>
              </div>
              
              <div className="form-field">
                <label htmlFor="order_number" className="form-label">
                  Order / Invoice Number <span className="required">*</span>
                </label>
                <input
                  id="order_number"
                  className="form-input"
                  type="text"
                  name="order_number"
                  required
                  disabled={!emailVerified}
                  placeholder="INV-123456"
                />
              </div>
              
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="product_name" className="form-label">
                    Product Name <span className="required">*</span>
                  </label>
                  <input
                    id="product_name"
                    className="form-input"
                    type="text"
                    name="product_name"
                    required
                    disabled={!emailVerified}
                    placeholder="Product Model/Name"
                  />
                </div>
                
                <div className="form-field">
                  <label htmlFor="serial_number" className="form-label">
                    Product Serial Number <span className="required">*</span>
                  </label>
                  <input
                    id="serial_number"
                    className="form-input"
                    type="text"
                    name="serial_number"
                    required
                    disabled={!emailVerified}
                    placeholder="SN123456789"
                  />
                </div>
              </div>
              
              <div className="form-actions">
                <button
                  className="submit-button"
                  type="submit"
                  disabled={!emailVerified}
                >
                  Submit Warranty Activation
                </button>
                <p className="form-note">
                  By submitting, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>
                </p>
              </div>
            </form>
          </div>
        </section>
      </div>

      {status && (
        <div className={`status-message ${statusType}`}>
          <div className="status-icon">
            {statusType === 'success' ? '✓' : '✗'}
          </div>
          <div className="status-content">
            <strong>{statusType === 'success' ? 'Success' : 'Error'}:</strong> {status}
          </div>
        </div>
      )}
    </main>
  );
}