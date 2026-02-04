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

  // Phone number states
  const [phoneCountryCode, setPhoneCountryCode] = useState("+44");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);

  // Static fallback list for countries - accurate phone codes
  const staticCountries = [
    { code: "+44", country: "United Kingdom", flag: "🇬🇧", isoCode: "GB" },
    { code: "+1", country: "United States", flag: "🇺🇸", isoCode: "US" },
    { code: "+61", country: "Australia", flag: "🇦🇺", isoCode: "AU" },
    { code: "+91", country: "India", flag: "🇮🇳", isoCode: "IN" },
    { code: "+49", country: "Germany", flag: "🇩🇪", isoCode: "DE" },
    { code: "+33", country: "France", flag: "🇫🇷", isoCode: "FR" },
    { code: "+86", country: "China", flag: "🇨🇳", isoCode: "CN" },
    { code: "+81", country: "Japan", flag: "🇯🇵", isoCode: "JP" },
    { code: "+65", country: "Singapore", flag: "🇸🇬", isoCode: "SG" },
    { code: "+971", country: "United Arab Emirates", flag: "🇦🇪", isoCode: "AE" },
    { code: "+41", country: "Switzerland", flag: "🇨🇭", isoCode: "CH" },
    { code: "+39", country: "Italy", flag: "🇮🇹", isoCode: "IT" },
    { code: "+34", country: "Spain", flag: "🇪🇸", isoCode: "ES" },
    { code: "+31", country: "Netherlands", flag: "🇳🇱", isoCode: "NL" },
    { code: "+32", country: "Belgium", flag: "🇧🇪", isoCode: "BE" },
    { code: "+46", country: "Sweden", flag: "🇸🇪", isoCode: "SE" },
    { code: "+47", country: "Norway", flag: "🇳🇴", isoCode: "NO" },
    { code: "+45", country: "Denmark", flag: "🇩🇰", isoCode: "DK" },
    { code: "+358", country: "Finland", flag: "🇫🇮", isoCode: "FI" },
    { code: "+353", country: "Ireland", flag: "🇮🇪", isoCode: "IE" },
  ];

  // Fetch countries from better API
  useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      try {
        // Using a more reliable API for phone codes
        const response = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,cca2,idd,flags"
        );
        const data = await response.json();

        // Process country data
        const formattedCountries = data
          .filter((country) => {
            // Only include countries with phone codes
            return country.idd && country.idd.root;
          })
          .map((country) => {
            // Get phone code - handle different formats
            let phoneCode = country.idd.root;

            // Some countries have suffixes
            if (country.idd.suffixes && country.idd.suffixes.length > 0) {
              // Take the first suffix (usually the main one)
              phoneCode = phoneCode + (country.idd.suffixes[0] || "");
            }

            // Clean up the phone code
            phoneCode = phoneCode.replace(/\s+/g, "");

            // Get flag emoji from country code
            const getFlagEmoji = (countryCode) => {
              if (!countryCode || countryCode.length !== 2) return "🏳️";
              const codePoints = countryCode
                .toUpperCase()
                .split("")
                .map((char) => 127397 + char.charCodeAt());
              return String.fromCodePoint(...codePoints);
            };

            return {
              code: phoneCode,
              country: country.name.common,
              flag: getFlagEmoji(country.cca2),
              isoCode: country.cca2,
            };
          })
          .filter((country) => {
            // Filter out invalid codes and duplicates
            return (
              country.code &&
              country.code !== "+" &&
              country.code.length > 1 &&
              // Filter out territories that aren't countries
              !country.country.includes("Island") &&
              !country.country.includes("Guernsey") &&
              !country.country.includes("Jersey") &&
              !country.country.includes("Isle of Man")
            );
          })
          // Sort alphabetically by country name
          .sort((a, b) => a.country.localeCompare(b.country));

        // Set countries, default to UK as selected
        setCountries(formattedCountries);
      } catch (error) {
        console.error("Error fetching countries:", error);
        // Use static list as fallback
        setCountries(staticCountries);
      } finally {
        setCountriesLoading(false);
      }
    };

    fetchCountries();
  }, []);

  // Debounce address search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (addressSearch.trim().length > 2) {
        searchAddresses(addressSearch);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(delayDebounceFn);
  }, [addressSearch]);

  // Fetch products for the Product Name select (now used for typeahead)
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

  // Search addresses using OpenStreetMap Nominatim API (FREE)
  const searchAddresses = async (query) => {
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&countrycodes=gb&addressdetails=1&limit=5&viewbox=-10,50,2,60`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent":
              "YourAppName/1.0 (your@email.com)", // Required by Nominatim
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
    town =
      address.city ||
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
      postal_code: postalCode || "",
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
    setAddressFields((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Close address suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".postal-address-search")) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Close product dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".product-typeahead")) {
        setShowProductDropdown(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Validate phone number
  const validatePhoneNumber = () => {
    if (!phoneNumber.trim()) {
      setPhoneError("Phone number is required");
      return false;
    }

    // Remove non-digits for validation
    const digitsOnly = phoneNumber.replace(/\D/g, "");

    if (digitsOnly.length < 7) {
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

  // Handle phone number input change
  const handlePhoneNumberChange = (value) => {
    // Allow only numbers, spaces, dashes, and parentheses
    const cleaned = value.replace(/[^\d\s\-\(\)]/g, "");
    setPhoneNumber(cleaned);

    // Validate as user types
    if (cleaned) {
      const digitsOnly = cleaned.replace(/\D/g, "");
      if (digitsOnly.length < 7) {
        setPhoneError("Phone number is too short");
      } else if (digitsOnly.length > 15) {
        setPhoneError("Phone number is too long");
      } else {
        setPhoneError("");
      }
    } else {
      setPhoneError("");
    }
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

    // Validate email verification
    if (!emailVerified) {
      setStatus("Please verify your email first.");
      setStatusType("error");
      return;
    }

    // Validate phone number
    if (!validatePhoneNumber()) {
      setStatus("Please enter a valid phone number.");
      setStatusType("error");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries());

    // Remove the old single phone field if it exists
    delete body.phone;
    delete body.phone_country_code;

    // Combine country code and phone number
    const fullPhone = `${phoneCountryCode}${phoneNumber.replace(/\D/g, "")}`;
    body.phone = fullPhone;

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

          {/* Phone Number Section - Updated to match your form style */}
          <div className="warranty-field fulllwwidth">
            <label htmlFor="phone" className="phone-sub-label">
              Phone Number
            </label>
            <div className="country-code-wrapper">
              <select
                id="phone_country_code"
                className="warranty-select"
                value={phoneCountryCode}
                onChange={(e) => setPhoneCountryCode(e.target.value)}
                disabled={countriesLoading}
              >
                {countriesLoading ? (
                  <option value="+44">Loading countries...</option>
                ) : (
                  <>
                    <option value="" disabled>
                      Select country
                    </option>
                    {countries.map((country) => (
                      <option
                        key={country.isoCode || country.code}
                        value={country.code}
                      >
                        {country.flag} {country.country} ({country.code})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          
          
            
            <input
              id="phone"
              className="warranty-input"
              type="tel"
              value={phoneNumber}
              onChange={(e) => handlePhoneNumberChange(e.target.value)}
              placeholder="123 456 7890"
              required
            />
            {/* If you want to show phone error: 
            {phoneError && (
              <div className="phone-error">
                {phoneError}
              </div>
            )} */}
          
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
                            .split(",")
                            .slice(0, 2)
                            .join(",")}
                        </div>
                        <div className="suggestion-details">
                          {suggestion.display_name
                            .split(",")
                            .slice(2, 4)
                            .join(",")}
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

          {/* NEW: Product typeahead field */}
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