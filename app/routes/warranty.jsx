import React, { useState, useEffect } from "react";
import "../styles/warranty.css";
import { findFlagUrlByIso2Code } from "country-flags-svg";

export default function WarrantyPage() {
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpToken, setOtpToken] = useState(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null);
  const [otpSent, setOtpSent] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState("");

  // NEW: product typeahead states
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Address states
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addressFields, setAddressFields] = useState({
    street: "",
    town: "",
    country: "",
    postal_code: "",
  });

  // Phone number states - UPDATED
  const [phoneCountryCode, setPhoneCountryCode] = useState("+44");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  
  // For custom country selector
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState({
    code: "+44",
    country: "United Kingdom",
    isoCode: "GB"
  });

  // Static fallback list for countries
  const staticCountries = [
    { code: "+44", country: "United Kingdom", isoCode: "GB" },
    { code: "+1", country: "United States", isoCode: "US" },
    { code: "+61", country: "Australia", isoCode: "AU" },
    { code: "+91", country: "India", isoCode: "IN" },
    { code: "+49", country: "Germany", isoCode: "DE" },
    { code: "+33", country: "France", isoCode: "FR" },
    { code: "+86", country: "China", isoCode: "CN" },
    { code: "+81", country: "Japan", isoCode: "JP" },
    { code: "+65", country: "Singapore", isoCode: "SG" },
    { code: "+971", country: "United Arab Emirates", isoCode: "AE" },
    { code: "+41", country: "Switzerland", isoCode: "CH" },
    { code: "+39", country: "Italy", isoCode: "IT" },
    { code: "+34", country: "Spain", isoCode: "ES" },
    { code: "+31", country: "Netherlands", isoCode: "NL" },
    { code: "+32", country: "Belgium", isoCode: "BE" },
    { code: "+46", country: "Sweden", isoCode: "SE" },
    { code: "+47", country: "Norway", isoCode: "NO" },
    { code: "+45", country: "Denmark", isoCode: "DK" },
    { code: "+358", country: "Finland", isoCode: "FI" },
    { code: "+353", country: "Ireland", isoCode: "IE" },
  ];

  // Ideal Postcodes API Key
  const IDEAL_POSTCODES_API_KEY = "ak_test";

  // Fetch countries from API
  useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      try {
        const response = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,cca2,idd"
        );
        const data = await response.json();

        const formattedCountries = data
          .filter((country) => {
            return country.idd && country.idd.root;
          })
          .map((country) => {
            let phoneCode = country.idd.root;

            if (country.idd.suffixes && country.idd.suffixes.length > 0) {
              phoneCode = phoneCode + (country.idd.suffixes[0] || "");
            }

            phoneCode = phoneCode.replace(/\s+/g, "");

            // Get flag URL
            const flagUrl = findFlagUrlByIso2Code(country.cca2);

            return {
              code: phoneCode,
              country: country.name.common,
              isoCode: country.cca2,
              flagUrl: flagUrl
            };
          })
          .filter((country) => {
            return (
              country.code &&
              country.code !== "+" &&
              country.code.length > 1 &&
              !country.country.includes("Island") &&
              !country.country.includes("Guernsey") &&
              !country.country.includes("Jersey") &&
              !country.country.includes("Isle of Man")
            );
          })
          .sort((a, b) => a.country.localeCompare(b.country));

        setCountries(formattedCountries);
        // Set default selected country
        const ukCountry = formattedCountries.find(c => c.isoCode === 'GB') || {
          code: "+44",
          country: "United Kingdom",
          isoCode: "GB",
          flagUrl: findFlagUrlByIso2Code("GB")
        };
        setSelectedCountry({
          code: ukCountry.code,
          country: ukCountry.country,
          isoCode: ukCountry.isoCode
        });
      } catch (error) {
        console.error("Error fetching countries:", error);
        // Convert static countries to include flag URLs
        const staticCountriesWithFlags = staticCountries.map(country => ({
          ...country,
          flagUrl: findFlagUrlByIso2Code(country.isoCode)
        }));
        setCountries(staticCountriesWithFlags);
        setSelectedCountry({
          code: "+44",
          country: "United Kingdom",
          isoCode: "GB"
        });
      } finally {
        setCountriesLoading(false);
      }
    };

    fetchCountries();
  }, []);

  // Initialize phone number with default country code
  useEffect(() => {
    setPhoneNumber("+44");
  }, []);

  // Update phone number when country code changes
  useEffect(() => {
    if (!phoneNumber || !phoneNumber.startsWith(phoneCountryCode)) {
      setPhoneNumber(phoneCountryCode);
    }
  }, [phoneCountryCode]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Close country dropdown
      if (!e.target.closest(".custom-country-selector")) {
        setShowCountryDropdown(false);
      }
      // Close address suggestions
      if (!e.target.closest(".postal-address-search")) {
        setShowSuggestions(false);
      }
      // Close product dropdown
      if (!e.target.closest(".product-typeahead")) {
        setShowProductDropdown(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Debounce address search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (addressSearch.trim().length > 2) {
        searchAddresses(addressSearch);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [addressSearch]);

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsLoading(true);
        setProductsError(null);

        const res = await fetch("/api/products");
        if (!res.ok) {
          throw new Error("Failed to load products");
        }
        const data = await res.json();
        setProducts(data.products || []);
      } catch (err) {
        console.error("Error fetching products:", err);
        setProductsError("Failed to load products");
      } finally {
        setProductsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Derived: filtered products based on search term
  const filteredProducts = products.filter((product) =>
    product.title.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  // Search addresses
  const searchAddresses = async (query) => {
    setIsSearching(true);
    setShowSuggestions(false);
    
    try {
      const response = await fetch(
        `https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses?api_key=${IDEAL_POSTCODES_API_KEY}&query=${encodeURIComponent(
          query
        )}&limit=5`
      );

      const data = await response.json();

      if (data.result && data.result.hits && data.result.hits.length > 0) {
        const formattedSuggestions = data.result.hits.map((hit) => {
          const suggestionParts = hit.suggestion.split(', ');
          let street = suggestionParts[0] || '';
          let town = suggestionParts[2] || '';
          let postalCode = suggestionParts[3] || '';
          
          if (suggestionParts.length > 4) {
            street = suggestionParts.slice(0, 2).join(', ');
            town = suggestionParts[2] || '';
            postalCode = suggestionParts[3] || '';
          }
          
          return {
            display_name: hit.suggestion,
            address: {
              road: street,
              house_number: '',
              city: town,
              town: town,
              country: "United Kingdom",
              postcode: postalCode,
              ideal_postcodes_hit: hit
            }
          };
        });
        
        setAddressSuggestions(formattedSuggestions);
        setShowSuggestions(true);
      } else {
        await searchOpenStreetMap(query);
      }
    } catch (err) {
      console.error("Ideal Postcodes search error:", err);
      await searchOpenStreetMap(query);
    } finally {
      setIsSearching(false);
    }
  };

  // Fallback to OpenStreetMap
  const searchOpenStreetMap = async (query) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&countrycodes=gb&addressdetails=1&limit=5`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "MobitelWarranty/1.0",
          },
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
      console.error("OpenStreetMap search error:", err);
      setAddressSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle address selection
  const handleSelectAddress = async (suggestion) => {
    const address = suggestion.address;
    
    let street = "";
    let town = "";
    let country = "";
    let postalCode = "";

    if (address.ideal_postcodes_hit) {
      const hit = address.ideal_postcodes_hit;
      
      try {
        const udprn = hit.udprn;
        const response = await fetch(
          `https://api.ideal-postcodes.co.uk/v1/udprn/${udprn}?api_key=${IDEAL_POSTCODES_API_KEY}`
        );
        const data = await response.json();
        
        if (data.result) {
          const fullAddress = data.result;
          street = fullAddress.line_1 || "";
          if (fullAddress.line_2) {
            street += `, ${fullAddress.line_2}`;
          }
          town = fullAddress.post_town || "";
          country = "United Kingdom";
          postalCode = fullAddress.postcode || "";
        } else {
          const suggestionParts = hit.suggestion.split(', ');
          street = suggestionParts[0] || '';
          town = suggestionParts[2] || '';
          postalCode = suggestionParts[3] || '';
          country = "United Kingdom";
        }
      } catch (error) {
        console.error("Error fetching full address details:", error);
        const suggestionParts = hit.suggestion.split(', ');
        street = suggestionParts[0] || '';
        town = suggestionParts[2] || '';
        postalCode = suggestionParts[3] || '';
        country = "United Kingdom";
      }
    } else {
      if (address.road) {
        street = address.road;
        if (address.house_number) {
          street += ` ${address.house_number}`;
        }
      } else if (address.pedestrian) {
        street = address.pedestrian;
      }

      town =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        "";

      country = address.country || "";
      postalCode = address.postcode || "";
    }

    setAddressFields({
      street: street || "",
      town: town || "",
      country: country || "",
      postal_code: postalCode || "",
    });

    setAddressSearch("");
    setAddressSuggestions([]);
    setShowSuggestions(false);

    setStatus("Address selected and auto-filled!");
    setStatusType("success");
  };

  // Handle manual changes to address fields
  const handleAddressFieldChange = (field, value) => {
    setAddressFields((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle phone number input change
  const handlePhoneNumberChange = (value) => {
    if (!value.startsWith(phoneCountryCode)) {
      if (phoneCountryCode.startsWith(value)) {
        setPhoneNumber(phoneCountryCode);
      } else {
        setPhoneNumber(phoneCountryCode + value.replace(phoneCountryCode, ''));
      }
    } else {
      setPhoneNumber(value);
    }
  };

  // Validate phone number
  const validatePhoneNumber = () => {
    if (!phoneNumber.trim() || phoneNumber === phoneCountryCode) {
      setPhoneError("Phone number is required");
      return false;
    }

    const phoneWithoutFormatting = phoneNumber.replace(/[^\d\+]/g, "");
    const digitsOnly = phoneWithoutFormatting.replace(/\D/g, "");
    
    if (digitsOnly.length < 10) {
      setPhoneError("Phone number is too short");
      return false;
    }

    if (digitsOnly.length > 15) {
      setPhoneError("Phone number is too long");
      return false;
    }

    setPhoneError("");
    return true;
  };

  // Handle country code change
  const handleCountryCodeChange = (newCode) => {
    const oldCode = phoneCountryCode;
    setPhoneCountryCode(newCode);
    
    if (phoneNumber.startsWith(oldCode)) {
      setPhoneNumber(newCode + phoneNumber.slice(oldCode.length));
    } else {
      setPhoneNumber(newCode + phoneNumber.replace(/^\+\d+/, ''));
    }
    
    const selected = countries.find(c => c.code === newCode);
    if (selected) {
      setSelectedCountry({
        code: selected.code,
        country: selected.country,
        isoCode: selected.isoCode
      });
    }
  };

  // Handle country selection from custom dropdown
  const handleCountrySelect = (country) => {
    setSelectedCountry({
      code: country.code,
      country: country.country,
      isoCode: country.isoCode
    });
    handleCountryCodeChange(country.code);
    setShowCountryDropdown(false);
  };

  // Your existing functions
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

    if (!validatePhoneNumber()) {
      setStatus("Please enter a valid phone number.");
      setStatusType("error");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries());

    // Add the complete phone number
    body.phone = phoneNumber;

    body.email = email;
    body.otpToken = otpToken;

    // Add address fields to the submission
    Object.assign(body, addressFields);

    const selectedProduct = products.find((p) => p.id === body.product_id);
    if (selectedProduct) {
      body.product_title = selectedProduct.title;
    }

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
          window.location.href = "/thankyou";
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
      <p className="paragraph">
        Please provide your personal and order details to activate your product
        warranty.
      </p>

      {/* Customer Information Section */}
      <section className="warranty-section">
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
              </div>
            )}
          </div>

          <p className="flexpara fulllwwidth">
            <input
              type="checkbox"
              name="termsformarketing"
              id="termsformarketing"
              defaultChecked
            />
            I agree to receive marketing communications from Mobitel regarding
            products, services, offers, and promotions. I understand that I can
            unsubscribe at any time.
          </p>

          {/* Phone Number Section - UPDATED with custom dropdown */}
          <div className="warranty-field fulllwwidth phone98008008">
            <label htmlFor="phone" className="phone-sub-label">
              Phone Number
            </label>
            
            <div className="phone-input-container">
              {/* Custom Country Selector with Flag Images */}
              <div className="custom-country-selector">
                <div 
                  className="country-select-trigger"
                  onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                >
                  {!countriesLoading && selectedCountry && (
                    <>
                      {selectedCountry.flagUrl ? (
                        <img 
                          src={selectedCountry.flagUrl} 
                          alt={selectedCountry.country}
                          className="selected-flag"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling?.style.marginLeft = '0';
                          }}
                        />
                      ) : (
                        <span className="flag-placeholder">🏳️</span>
                      )}
                      <span className="selected-code">{selectedCountry.code}</span>
                      <span className="dropdown-arrow">▼</span>
                    </>
                  )}
                  {countriesLoading && (
                    <span className="loading-text">Loading...</span>
                  )}
                </div>
                
                {showCountryDropdown && !countriesLoading && (
                  <div className="country-dropdown">
                    <div className="country-list">
                      {countries.map((country) => (
                        <div
                          key={country.isoCode}
                          className={`country-item ${selectedCountry.isoCode === country.isoCode ? 'selected' : ''}`}
                          onClick={() => handleCountrySelect(country)}
                        >
                          {country.flagUrl ? (
                            <img 
                              src={country.flagUrl} 
                              alt={country.country}
                              className="country-flag"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling?.style.marginLeft = '0';
                              }}
                            />
                          ) : (
                            <span className="flag-placeholder">🏳️</span>
                          )}
                          <span className="country-name">{country.country}</span>
                          <span className="country-code">{country.code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Phone Number Input */}
              <input
                id="phone"
                className="warranty-input phone-number-input"
                type="tel"
                value={phoneNumber}
                onChange={(e) => handlePhoneNumberChange(e.target.value)}
                placeholder="+44 123 456 7890"
                required
                name="phone"
              />
            </div>
            
            {phoneError && (
              <div className="phone-error-message">
                {phoneError}
              </div>
            )}
          </div>

          {/* Address Search with Autocomplete */}
          <div className="postal-address-search">
            <div className="warranty-field">
              <label htmlFor="search_address">Search UK Address</label>
              <div className="address-autocomplete-container">
                <input
                  id="search_address"
                  className="warranty-input"
                  type="text"
                  value={addressSearch}
                  placeholder="Start typing address or postcode..."
                  onChange={(e) => setAddressSearch(e.target.value)}
                  name="search_address"
                />

                {/* Suggestions Dropdown */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="address-suggestions-dropdown">
                    {isSearching && (
                      <div className="suggestion-loading">Searching...</div>
                    )}

                    {addressSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleSelectAddress(suggestion)}
                      >
                        <div className="suggestion-main">
                          {suggestion.display_name
                            ? suggestion.display_name.split(",")[0]
                            : "Address"}
                        </div>
                        <div className="suggestion-details">
                          {suggestion.display_name
                            ? suggestion.display_name.split(",").slice(1).join(",").trim()
                            : ""}
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
              onChange={(e) => handleAddressFieldChange("street", e.target.value)}
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
              onChange={(e) => handleAddressFieldChange("town", e.target.value)}
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
              onChange={(e) => handleAddressFieldChange("country", e.target.value)}
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
              onChange={(e) =>
                handleAddressFieldChange("postal_code", e.target.value)
              }
            />
          </div>

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

          {/* Product typeahead field */}
          <div className="warranty-field product-typeahead">
            <label htmlFor="product_search">Product</label>

            {/* Visible typeable input */}
            <input
              id="product_search"
              className="warranty-input"
              type="text"
              placeholder={
                productsLoading
                  ? "Loading products..."
                  : productsError
                  ? "Failed to load products"
                  : "Type to search products..."
              }
              value={productSearchTerm}
              onChange={(e) => {
                setProductSearchTerm(e.target.value);
                setShowProductDropdown(true);
              }}
              onFocus={() => {
                if (!productsLoading && !productsError) {
                  setShowProductDropdown(true);
                }
              }}
              disabled={productsLoading || !!productsError}
              autoComplete="off"
            />

            {/* Hidden input that actually submits product_id */}
            <input
              type="hidden"
              name="product_id"
              value={selectedProductId}
              required
            />

            {/* Dropdown of matching products */}
            {showProductDropdown && !productsLoading && !productsError && (
              <div className="product-dropdown">
                {filteredProducts.length === 0 ? (
                  <div className="product-dropdown-item product-dropdown-empty">
                    No products found
                  </div>
                ) : (
                  filteredProducts.slice(0, 20).map((product) => (
                    <div
                      key={product.id}
                      className={
                        "product-dropdown-item" +
                        (product.id === selectedProductId ? " selected" : "")
                      }
                      onClick={() => {
                        setSelectedProductId(product.id);
                        setProductSearchTerm(product.title);
                        setShowProductDropdown(false);
                      }}
                    >
                      {product.title}
                    </div>
                  ))
                )}
              </div>
            )}

            {productsError && (
              <p className="warranty-status warranty-status--error">
                {productsError}
              </p>
            )}
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

        <p className="paralast0900009">
          By completing this form, you accept our{" "}
          <a href="#">Terms & Conditions</a> and acknowledge our{" "}
          <a href="#">Privacy Policy.</a>
        </p>

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