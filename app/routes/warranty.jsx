import React, { useState, useEffect } from "react";
import "../styles/warranty.css"; 

export default function WarrantyPage() {
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpToken, setOtpToken] = useState(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  
  // Address states
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addressFields, setAddressFields] = useState({
    street: "",
    town: "",
    country: "",
    postal_code: ""
  });

  // Debounce address search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (addressSearch.trim().length > 2) {
        searchAddresses(addressSearch);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(delayDebounceFn);
  }, [addressSearch]);

  // Search addresses using OpenStreetMap Nominatim API (FREE)
  const searchAddresses = async (query) => {
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'YourAppName/1.0 (your@email.com)' // Required by Nominatim
          }
        }
      );
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        setAddressSuggestions(data);
        setShowSuggestions(true);
      } else {
        setAddressSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error("Address search error:", err);
      setAddressSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle address selection
  const handleSelectAddress = (suggestion) => {
    const address = suggestion.address;
    
    // Extract address components from OpenStreetMap response
    let street = "";
    let town = "";
    let country = "";
    let postalCode = "";

    // Build street address
    if (address.road) {
      street = address.road;
      if (address.house_number) {
        street += ` ${address.house_number}`;
      }
    } else if (address.pedestrian) {
      street = address.pedestrian;
    }

    // Get town/city (prioritize in this order)
    town = address.city || 
           address.town || 
           address.village || 
           address.municipality || 
           address.county || 
           "";

    // Get country
    country = address.country || "";

    // Get postal code
    postalCode = address.postcode || "";

    // Update address fields
    setAddressFields({
      street: street || "",
      town: town || "",
      country: country || "",
      postal_code: postalCode || ""
    });

    // Clear search and suggestions
    setAddressSearch("");
    setAddressSuggestions([]);
    setShowSuggestions(false);
    
    setStatus("Address selected and auto-filled!");
    setStatusType("success");
  };

  // Handle manual changes to address fields
  const handleAddressFieldChange = (field, value) => {
    setAddressFields(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.postal-address-search')) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Your existing functions (unchanged)
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
        setOtpSent(true);
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
        setOtpSent(false);
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

    // Add address fields to the submission
    Object.assign(body, addressFields);

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
      <h1>Warranty Activation</h1>
      <p className="paragraph">Please provide your personal and order details to activate your product warranty.</p>
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
              placeholder="Full Name"
              required
            />
          </div>
          
          <div className="email-verification-section">
            {!emailVerified && (
              <>
                {!otpSent ? (
                  <>
                    <div className="warranty-field">
                      <label htmlFor="warranty-email">Email</label>
                      <input
                        id="warranty-email"
                        className="warranty-input"
                        type="email"
                        name="customer_email"
                        required
                        value={email}
                        placeholder="Email Address"
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
                    <div className="warranty-field">
                      <label htmlFor="warranty-otp">Enter OTP</label>
                      <input
                        id="warranty-otp"
                        className="warranty-input"
                        type="text"
                        name="otp"
                        required
                        value={otp}
                        placeholder="Enter OTP"
                        onChange={(e) => setOtp(e.target.value)}
                        
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
           <p className="flexpara"><input type="checkbox" name="termsformarketing" id="termsformarketing" required /> I agree to receive marketing communications from Mobitel regarding products, services, offers, and promotions. I understand that I can unsubscribe at any time.</p>
          <div className="warranty-field">
            <label htmlFor="phone">Phone Number</label>
            <input
              id="phone"
              className="warranty-input"
              type="tel"
              name="phone"
              placeholder="Phone Number"
              required
            />
          </div>

          {/* Address Search with Autocomplete */}
          <div className="postal-address-search">
            <div className="warranty-field">
              <label htmlFor="search_address">Search Address</label>
              <div className="address-autocomplete-container">
                <input
                  id="search_address"
                  className="warranty-input"
                  type="text"
                  value={addressSearch}
                  placeholder="Search for your address..."
                  onChange={(e) => setAddressSearch(e.target.value)}
                  name="search_address"
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="address-suggestions-dropdown">
                    {isSearching && <div className="suggestion-loading">Searching...</div>}
                    
                    {addressSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleSelectAddress(suggestion)}
                      >
                        <div className="suggestion-main">
                          {suggestion.display_name.split(',').slice(0, 2).join(',')}
                        </div>
                        <div className="suggestion-details">
                          {suggestion.display_name.split(',').slice(2, 4).join(',')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="warranty-actions otp-actions">
              <button 
                className="warranty-button secondary" 
                type="button"
                onClick={() => {
                  if (addressSearch.trim()) {
                    searchAddresses(addressSearch);
                  }
                }}
                disabled={!addressSearch.trim()}
              >
                {isSearching ? "Searching..." : "Find Address"}
              </button>
            </div>
          </div>

          {/* Address Fields - Auto-filled from search */}
          <div className="warranty-field">
            <label htmlFor="street">Street Address</label>
            <input
              id="street"
              className="warranty-input"
              type="text"
              name="street"
              required
              value={addressFields.street}
              placeholder="Street Address"
              onChange={(e) => handleAddressFieldChange('street', e.target.value)}
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
              value={addressFields.town}
              placeholder="Town / City"
              onChange={(e) => handleAddressFieldChange('town', e.target.value)}
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
              value={addressFields.country}
              placeholder="Country"
              onChange={(e) => handleAddressFieldChange('country', e.target.value)}
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
              value={addressFields.postal_code}
              placeholder="Postal Code"
              onChange={(e) => handleAddressFieldChange('postal_code', e.target.value)}
            />
          </div>

          <h2>Order Details</h2>

          <div className="warranty-field labelupper908">
            <label htmlFor="purchase_source">Purchase Source</label>
            <select
              id="purchase_source"
              className="warranty-select"
              name="purchase_source"
              required
            >
              <option value="">Select...</option>
              <option>Amazon</option>
              <option>Ebay</option>
              <option>Mobitel Website</option>
              <option>Others</option>
            </select>
          </div>

          <div className="warranty-field labelupper908">
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
              placeholder="Order / Invoice Number"
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
              placeholder="Product Name"
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
              placeholder="Product Serial Number"
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