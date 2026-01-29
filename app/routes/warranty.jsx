import React, { useState } from "react";
import "../styles/warranty.css"; 

export default function WarrantyPage() {
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpToken, setOtpToken] = useState(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null); 

  // Track current step
  const [currentStep, setCurrentStep] = useState(1); // 1: Email, 2: OTP, 3: Form

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
        setCurrentStep(2); // Move to OTP step
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
        setCurrentStep(3); // Move to form step
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
    <main className="warranty-page">
      <h1>Warranty Activation</h1>

      {/* Step indicator */}
      <div className="step-indicator">
        <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
          <span className="step-number">1</span>
          <span className="step-label">Email</span>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">OTP</span>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Details</span>
        </div>
      </div>

      {/* Step 1: Email Verification */}
      <section className="warranty-section">
        <h2>Customer Email Verification</h2>
        
        {/* Step 1: Email Input (always visible until verified) */}
        {!emailVerified && (
          <form className="warranty-form" onSubmit={handleSendOtp}>
            <div className="warranty-field">
              <label htmlFor="warranty-email">Email</label>
              <input
                id="warranty-email"
                className="warranty-input"
                type="email"
                name="customer_email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="warranty-actions">
              <button className="warranty-button" type="submit">
                Request OTP
              </button>
            </div>
          </form>
        )}

        {/* Step 2: OTP Verification (only show after OTP is sent) */}
        {otpToken && !emailVerified && (
          <form
            className="warranty-form"
            onSubmit={handleVerifyOtp}
            style={{ marginTop: "0.75rem" }}
          >
            <div className="warranty-field">
              <label htmlFor="warranty-otp">Enter OTP</label>
              <input
                id="warranty-otp"
                className="warranty-input"
                type="text"
                name="otp"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <div className="warranty-actions">
              <button className="warranty-button secondary" type="submit">
                Verify OTP
              </button>
            </div>
          </form>
        )}

        {/* Show success message when email is verified */}
        {emailVerified && (
          <div className="verification-success">
            <p>✅ Email verified successfully!</p>
          </div>
        )}
      </section>

      {/* Step 3: Customer Information (only show after email verification) */}
      {emailVerified && (
        <section className="warranty-section">
          <h2>Customer Information</h2>
          <form className="warranty-form" onSubmit={handleSubmit}>
            <div className="warranty-field">
              <label htmlFor="full_name">Full Name</label>
              <input
                id="full_name"
                className="warranty-input"
                type="text"
                name="full_name"
                required
              />
            </div>
            <div className="warranty-field">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                className="warranty-input"
                type="tel"
                name="phone"
                required
              />
            </div>
            <div className="warranty-field">
              <label htmlFor="street">Street Address</label>
              <input
                id="street"
                className="warranty-input"
                type="text"
                name="street"
                required
              />
            </div>
            <div className="warranty-field">
              <label htmlFor="town">Town / City</label>
              <input
                id="town"
                className="warranty-input"
                type="text"
                name="town"
                required
              />
            </div>
            <div className="warranty-field">
              <label htmlFor="country">Country</label>
              <input
                id="country"
                className="warranty-input"
                type="text"
                name="country"
                required
              />
            </div>
            <div className="warranty-field">
              <label htmlFor="postal_code">Postal Code</label>
              <input
                id="postal_code"
                className="warranty-input"
                type="text"
                name="postal_code"
                required
              />
            </div>

            <h2>Order Details</h2>

            <div className="warranty-field">
              <label htmlFor="purchase_source">Purchase Source</label>
              <select
                id="purchase_source"
                className="warranty-select"
                name="purchase_source"
                required
              >
                <option value="">Select...</option>
                <option>Online Store</option>
                <option>Physical Store</option>
                <option>Third-Party Retailer</option>
              </select>
            </div>

            <div className="warranty-field">
              <label htmlFor="purchase_date">Purchase Date</label>
              <input
                id="purchase_date"
                className="warranty-input"
                type="date"
                name="purchase_date"
                required
              />
            </div>

            <div className="warranty-field">
              <label htmlFor="order_number">Order / Invoice Number</label>
              <input
                id="order_number"
                className="warranty-input"
                type="text"
                name="order_number"
                required
              />
            </div>

            <div className="warranty-field">
              <label htmlFor="product_name">Product Name</label>
              <input
                id="product_name"
                className="warranty-input"
                type="text"
                name="product_name"
                required
              />
            </div>

            <div className="warranty-field">
              <label htmlFor="serial_number">Product Serial Number</label>
              <input
                id="serial_number"
                className="warranty-input"
                type="text"
                name="serial_number"
                required
              />
            </div>

            <div className="warranty-actions">
              <button
                className="warranty-button"
                type="submit"
                disabled={!emailVerified}
              >
                Submit Warranty
              </button>
            </div>
          </form>
        </section>
      )}

      {status && (
        <p
          className={
            "warranty-status " +
            (statusType === "error"
              ? "warranty-status--error"
              : statusType === "success"
              ? "warranty-status--success"
              : "")
          }
        >
          {status}
        </p>
      )}
    </main>
  );
}