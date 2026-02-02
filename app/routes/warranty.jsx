import React, { useState } from "react";
import "../styles/warranty.css"; 

export default function WarrantyPage() {
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpToken, setOtpToken] = useState(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null);
  const [otpSent, setOtpSent] = useState(false); // New state to track OTP sent status

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
        setOtpSent(true); // Hide email input and show OTP input
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
        setOtpSent(false); // Hide OTP fields after successful verification
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

  // Function to reset email verification process
  function handleEditEmail() {
    setEmailVerified(false);
    setOtpSent(false);
    setOtpToken(null);
    setOtp("");
    setStatus(null);
    setStatusType(null);
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
          window.location.href="/thankyou";
        }, 1000);
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
      <h1>Warranty Activation / Product Query</h1>

      {/* Customer Information Section */}
      <section className="warranty-section">
        <h2>Personal Information</h2>
        <form className="warranty-form" onSubmit={handleSubmit}>
          <div className="warranty-field">
            <label htmlFor="full_name">Full Name</label>
            <input
              id="full_name"
              className="warranty-input"
              type="text"
              name="full_name"
              placeholder="Enter your full name"
              required
            />
          </div>
          
          <div className="email-verification-section">
            {!emailVerified && (
              <>
                {/* Show email input and request OTP button only when OTP not sent */}
                {!otpSent ? (
                  <>
                    <div className="warranty-field">
                      <label htmlFor="warranty-email">Email</label>
                      <input
                        id="warranty-email"
                        className="warranty-input"
                        type="email"
                        name="customer_email"
                        placeholder="Enter Email Address"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="warranty-actions otp-actions">
                      <button 
                        className="warranty-button" 
                        onClick={handleSendOtp}
                        disabled={!email.trim()}
                      >
                        Request OTP
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Show OTP input and verify button when OTP is sent */}
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
                        placeholder="Enter OTP sent to your email"
                      />
                    </div>
                    <div className="warranty-actions otp-actions">
                      <button 
                        className="warranty-button secondary" 
                        onClick={handleVerifyOtp}
                        disabled={!otp.trim()}
                      >
                        Verify OTP
                      </button>
                     
                    </div>
                  </>
                )}
              </>
            )}

            {emailVerified && (
              <div className="verification-success otp-actions">
                <p>Email verified successfully!</p>
                <button 
                  className="warranty-button tertiary" 
                  onClick={handleEditEmail}
                  type="button"
                >
                  Change Email
                </button>
              </div>
            )}
          </div>
          
          {/* Rest of your form fields remain the same */}
          <div className="warranty-field">
            <label htmlFor="phone">Phone Number</label>
            <input
              id="phone"
              className="warranty-input"
              type="tel"
              name="phone"
              placeholder="Enter your phone number"
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
              placeholder="Enter Street Address"
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
              placeholder="Enter Town / City"
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
              placeholder="Enter Country"
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
              placeholder="Enter Postal Code"
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
              placeholder="Enter Purchase Date"
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
              placeholder="Enter Order / Invoice Number"
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
              placeholder="Enter Product Name"
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
                placeholder="Enter Product Serial Number"
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
      </section>

      
    </main>
  );
}