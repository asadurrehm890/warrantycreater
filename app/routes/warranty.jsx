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
    country: "United Kingdom",
    postal_code: ""
  });
  const [selectedPostcode, setSelectedPostcode] = useState("");

  // Debounce address search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (addressSearch.trim().length > 2) {
        searchAddresses(addressSearch);
      } else {
        setAddressSuggestions([]);
        setShowSuggestions(false);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(delayDebounceFn);
  }, [addressSearch]);

  // Search addresses using Postcodes.io API
  const searchAddresses = async (query) => {
    setIsSearching(true);
    setShowSuggestions(false);
    
    try {
      let apiUrl = "";
      let isPostcodeQuery = false;
      
      // Clean the query - remove spaces and make uppercase for postcode detection
      const cleanQuery = query.replace(/\s+/g, '').toUpperCase();
      
      // Check if query looks like a postcode (UK postcode pattern)
      const postcodePattern = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;
      isPostcodeQuery = postcodePattern.test(cleanQuery);
      
      if (isPostcodeQuery) {
        // Query is a postcode - search for addresses by postcode
        apiUrl = `https://api.postcodes.io/postcodes/${cleanQuery}/autocomplete`;
      } else {
        // Query is a place name - search for postcodes by place
        apiUrl = `https://api.postcodes.io/postcodes?q=${encodeURIComponent(query)}`;
      }
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.result && data.result.length > 0) {
        // Format suggestions based on query type
        const formattedSuggestions = isPostcodeQuery 
          ? formatPostcodeSuggestions(data.result, cleanQuery)
          : formatPlaceSuggestions(data.result);
        
        setAddressSuggestions(formattedSuggestions);
        setShowSuggestions(true);
      } else {
        setAddressSuggestions([]);
        setShowSuggestions(false);
        if (addressSearch.trim().length > 0) {
          setStatus("No UK addresses found. Please try a different search.");
          setStatusType("error");
        }
      }
    } catch (err) {
      console.error("Address search error:", err);
      setAddressSuggestions([]);
      setShowSuggestions(false);
      setStatus("Address search service temporarily unavailable.");
      setStatusType("error");
    } finally {
      setIsSearching(false);
    }
  };

  // Format postcode suggestions
  const formatPostcodeSuggestions = (postcodes, originalQuery) => {
    return postcodes.map(postcode => ({
      type: 'postcode',
      value: postcode,
      display: postcode,
      searchable: postcode,
      originalQuery
    }));
  };

  // Format place suggestions
  const formatPlaceSuggestions = (places) => {
    return places.map(place => ({
      type: 'place',
      value: place.postcode,
      display: `${place.postcode} - ${place.parish || place.admin_district || place.region || ''}`,
      searchable: place.postcode,
      details: place
    }));
  };

  // Handle address selection - Get full address details for a postcode
  const handleSelectAddress = async (suggestion) => {
    setIsSearching(true);
    
    try {
      // Get full address details for the selected postcode
      const response = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(suggestion.value)}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to get address details: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.result) {
        const address = data.result;
        
        // Build street address
        let street = "";
        if (address.line_1) {
          street = address.line_1;
          if (address.line_2) {
            street += `, ${address.line_2}`;
          }
        } else if (address.thoroughfare) {
          street = address.thoroughfare;
        }
        
        // Get town/city
        let town = address.town || address.locality || address.admin_district || "";
        
        // If town is empty but we have parish or ward, use those
        if (!town && address.parish) {
          town = address.parish;
        } else if (!town && address.ward) {
          town = address.ward;
        }
        
        // Get county
        const county = address.county || address.admin_county || "";
        
        // Update address fields
        setAddressFields({
          street: street || "",
          town: town || "",
          country: "United Kingdom",
          postal_code: address.postcode || suggestion.value || ""
        });
        
        setSelectedPostcode(address.postcode || suggestion.value);
        
        // Clear search and suggestions
        setAddressSearch("");
        setAddressSuggestions([]);
        setShowSuggestions(false);
        
        setStatus("UK address selected and auto-filled!");
        setStatusType("success");
      }
    } catch (err) {
      console.error("Error fetching address details:", err);
      setStatus("Failed to load address details. Please enter manually.");
      setStatusType("error");
      
      // Still set the postcode if we have it
      if (suggestion.value) {
        setAddressFields(prev => ({
          ...prev,
          postal_code: suggestion.value
        }));
        setSelectedPostcode(suggestion.value);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Get full addresses for a postcode (for manual lookup button)
  const handleFindAddress = async () => {
    if (!addressSearch.trim()) return;
    
    setIsSearching(true);
    
    try {
      // Clean the postcode
      const cleanPostcode = addressSearch.replace(/\s+/g, '').toUpperCase();
      
      // Validate postcode first
      const validateResponse = await fetch(
        `https://api.postcodes.io/postcodes/${cleanPostcode}/validate`
      );
      
      const validateData = await validateResponse.json();
      
      if (!validateData.result) {
        setStatus("Invalid UK postcode format. Please check and try again.");
        setStatusType("error");
        return;
      }
      
      // Get addresses for this postcode
      const response = await fetch(
        `https://api.postcodes.io/postcodes/${cleanPostcode}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to get address: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.result) {
        const address = data.result;
        
        // Build street address
        let street = "";
        if (address.line_1) {
          street = address.line_1;
          if (address.line_2) {
            street += `, ${address.line_2}`;
          }
        } else if (address.thoroughfare) {
          street = address.thoroughfare;
        }
        
        // Get town/city
        let town = address.town || address.locality || address.admin_district || "";
        
        // Update address fields
        setAddressFields({
          street: street || "",
          town: town || "",
          country: "United Kingdom",
          postal_code: address.postcode || cleanPostcode
        });
        
        setSelectedPostcode(address.postcode || cleanPostcode);
        setAddressSearch("");
        
        setStatus("UK address found and auto-filled!");
        setStatusType("success");
      } else {
        setStatus("No addresses found for this postcode.");
        setStatusType("error");
      }
    } catch (err) {
      console.error("Error finding address:", err);
      setStatus("Unable to find address. Please enter details manually.");
      setStatusType("error");
    } finally {
      setIsSearching(false);
      setShowSuggestions(false);
    }
  };

  // Handle manual changes to address fields
  const handleAddressFieldChange = (field, value) => {
    const updatedFields = {
      ...addressFields,
      [field]: value
    };
    
    // Ensure country remains UK
    if (field === 'country' && !value.toLowerCase().includes('united kingdom')) {
      updatedFields.country = "United Kingdom";
      setStatus("Only UK addresses are accepted for warranty registration.");
      setStatusType("warning");
    }
    
    // If postal code changes, clear selected postcode
    if (field === 'postal_code') {
      setSelectedPostcode("");
    }
    
    setAddressFields(updatedFields);
  };

  // Validate UK postcode format
  const validatePostcode = (postcode) => {
    const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
    const pattern = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;
    return pattern.test(cleanPostcode);
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

    // Validate UK postcode
    if (!validatePostcode(addressFields.postal_code)) {
      setStatus("Please enter a valid UK postcode.");
      setStatusType("error");
      return;
    }

    // Ensure country is UK
    if (!addressFields.country.toLowerCase().includes('united kingdom')) {
      setStatus("Only UK addresses are accepted for warranty registration.");
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
      
      <div className="uk-address-notice">
        <p>📍 <strong>UK Address Required:</strong> This warranty registration is only available for UK residents.</p>
      </div>
      
      {/* Customer Information Section */}
      <section className="warranty-section">
        <h2>Personal Information</h2>
        <form className="warranty-form" onSubmit={handleSubmit}>
          <div className="warranty-field fulllwwidth">
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
          
          <div className="email-verification-section fulllwwidth">
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
                {/* <button 
                  className="warranty-button tertiary" 
                  onClick={handleEditEmail}
                  type="button"
                >
                  Change Email
                </button> */}
              </div>
            )}
          </div>
           
          <p className="flexpara">
            <input type="checkbox" name="termsformarketing" id="termsformarketing" required /> 
            I agree to receive marketing communications from Mobitel regarding products, services, offers, and promotions. I understand that I can unsubscribe at any time.
          </p>
          
          <div className="warranty-field">
            <label htmlFor="phone">UK Phone Number</label>
            <input
              id="phone"
              className="warranty-input"
              type="tel"
              name="phone"
              placeholder="e.g., 07123 456789"
              pattern="^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$"
              title="Please enter a valid UK phone number"
              required
            />
            <small className="input-hint">UK format: 07123 456789 or +44 7123 456789</small>
          </div>

          {/* UK Address Search with Postcodes.io */}
          <div className="postal-address-search">
            <div className="warranty-field">
              <label htmlFor="search_address">Search UK Address by Postcode</label>
              <div className="address-autocomplete-container">
                <input
                  id="search_address"
                  className="warranty-input"
                  type="text"
                  value={addressSearch}
                  placeholder="Enter UK postcode (e.g., SW1A 1AA) or town name"
                  onChange={(e) => setAddressSearch(e.target.value)}
                  name="search_address"
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="address-suggestions-dropdown uk-address-dropdown">
                    {isSearching && <div className="suggestion-loading">Searching UK addresses...</div>}
                    
                    {addressSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleSelectAddress(suggestion)}
                      >
                        <div className="suggestion-main">
                          <span className="postcode-badge">📮</span>
                          {suggestion.display}
                        </div>
                        <div className="suggestion-details">
                          <span className="uk-flag">🇬🇧</span> UK Address
                          {suggestion.type === 'postcode' && (
                            <span className="suggestion-type">Postcode</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <small className="input-hint">
                Enter a UK postcode (e.g., SW1A 1AA) or town name to find addresses
              </small>
            </div>
            
            <div className="warranty-actions otp-actions">
              <button 
                className="warranty-button secondary" 
                type="button"
                onClick={handleFindAddress}
                disabled={!addressSearch.trim() || isSearching}
              >
                {isSearching ? "Searching..." : "Find Address"}
              </button>
            </div>
            
            {selectedPostcode && (
              <div className="selected-postcode-info">
                <span className="selected-postcode-badge">
                  📍 Selected: {selectedPostcode}
                </span>
              </div>
            )}
          </div>

          {/* Address Fields - Auto-filled from search */}
          <h3>UK Address Details</h3>
          
          <div className="warranty-field">
            <label htmlFor="street">Street Address</label>
            <input
              id="street"
              className="warranty-input"
              type="text"
              name="street"
              required
              value={addressFields.street}
              placeholder="e.g., 123 High Street"
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
              placeholder="e.g., London"
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
              readOnly
              style={{backgroundColor: '#f0f0f0', cursor: 'not-allowed'}}
            />
            <small className="input-hint">Only UK addresses accepted for warranty</small>
          </div>
          
          <div className="warranty-field">
            <label htmlFor="postal_code">UK Postcode</label>
            <input
              id="postal_code"
              className="warranty-input"
              type="text"
              name="postal_code"
              required
              value={addressFields.postal_code}
              placeholder="e.g., SW1A 1AA"
              pattern="^[A-Za-z]{1,2}[0-9][A-Za-z0-9]? ?[0-9][A-Za-z]{2}$"
              title="Please enter a valid UK postcode"
              onChange={(e) => handleAddressFieldChange('postal_code', e.target.value)}
            />
            <small className="input-hint">Format: AB12 3CD or A1 2BC</small>
            {addressFields.postal_code && !validatePostcode(addressFields.postal_code) && (
              <small className="input-error">⚠️ Please enter a valid UK postcode format</small>
            )}
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
              <option>Amazon UK</option>
              <option>Ebay UK</option>
              <option>Mobitel Website</option>
              <option>Other UK Retailer</option>
              <option>Other International</option>
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
              max={new Date().toISOString().split('T')[0]}
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
              disabled={!emailVerified || !validatePostcode(addressFields.postal_code)}
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
                : statusType === "warning"
                ? "warranty-status--warning"
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