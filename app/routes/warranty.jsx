import React, { useState, useEffect } from "react";
import "../styles/warranty.css";
import { findFlagUrlByIso2Code } from "country-flags-svg";
import Select from "react-select";

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

  // Field-level error states
  const [fieldErrors, setFieldErrors] = useState({
    full_name: "",
    email: "",
    otp: "",
    phone: "",
    street: "",
    town: "",
    country: "",
    postal_code: "",
    purchase_source: "",
    purchase_date: "",
    order_number: "",
    product_id: "",
    serial_number: "",
  });

  // Field-level touched states for showing errors after blur
  const [touched, setTouched] = useState({});

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

  // Ideal Postcodes API Key - Add this at the top with your actual key
  const IDEAL_POSTCODES_API_KEY = "ak_test"; // Replace with your key from ideal-postcodes.co.uk

  // Helper function to validate individual fields
  const validateField = (fieldName, value, formData = {}) => {
    let error = "";
    
    switch (fieldName) {
      case "full_name":
        if (!value || value.trim() === "") {
          error = "Full name is required";
        } else if (value.trim().length < 2) {
          error = "Full name must be at least 2 characters";
        }
        break;
        
      case "email":
        if (!value || value.trim() === "") {
          error = "Email address is required";
        } else if (!/\S+@\S+\.\S+/.test(value)) {
          error = "Please enter a valid email address";
        }
        break;
        
      case "otp":
        if (!value || value.trim() === "") {
          error = "OTP is required";
        } else if (!/^\d{6}$/.test(value)) {
          error = "OTP must be 6 digits";
        }
        break;
        
      case "phone":
        if (!value || value.trim() === "" || value === phoneCountryCode) {
          error = "Phone number is required";
        } else {
          const digitsOnly = value.replace(/\D/g, "");
          if (digitsOnly.length < 10) {
            error = "Phone number is too short";
          } else if (digitsOnly.length > 15) {
            error = "Phone number is too long";
          }
        }
        break;
        
      case "street":
        if (!value || value.trim() === "") {
          error = "Street address is required";
        }
        break;
        
      case "town":
        if (!value || value.trim() === "") {
          error = "Town/City is required";
        }
        break;
        
      case "country":
        if (!value || value.trim() === "") {
          error = "Country is required";
        }
        break;
        
      case "postal_code":
        if (!value || value.trim() === "") {
          error = "Postal code is required";
        }
        break;
        
      case "purchase_source":
        if (!value || value === "") {
          error = "Please select a purchase source";
        }
        break;
        
      case "purchase_date":
        if (!value || value === "") {
          error = "Purchase date is required";
        } else {
          const selectedDate = new Date(value);
          const today = new Date();
          if (selectedDate > today) {
            error = "Purchase date cannot be in the future";
          }
        }
        break;
        
      case "order_number":
        if (!value || value.trim() === "") {
          error = "Order/Invoice number is required";
        }
        break;
        
      case "product_id":
        if (!value || value.trim() === "") {
          error = "Product name is required";
        }
        break;
        
      case "serial_number":
        if (!value || value.trim() === "") {
          error = "Product serial number is required";
        }
        break;
        
      default:
        break;
    }
    
    return error;
  };

  // Validate all fields on form submission
  const validateAllFields = (formData) => {
    const newErrors = {};
    let isValid = true;
    
    // Email verification check
    if (!emailVerified) {
      setStatus("Please verify your email first.");
      setStatusType("error");
      return false;
    }
    
    // Validate each required field
    const fieldsToValidate = [
      "full_name", "phone", "street", "town", "country",
      "postal_code", "purchase_source", "purchase_date",
      "order_number", "serial_number"
    ];

    fieldsToValidate.forEach(field => {
      const value = formData.get(field) || addressFields[field] || "";
      const error = validateField(field, value, formData);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    // Product: accept any typed product name (free text). The user does not
    // have to pick from the dropdown.
    const productName = (formData.get("product_title") || productSearchTerm || "").trim();
    if (!productName) {
      newErrors.product_id = "Product name is required";
      isValid = false;
    }

    setFieldErrors(prev => ({ ...prev, ...newErrors }));
    return isValid;
  };

  // Handle field blur to show error
  const handleFieldBlur = (fieldName, value) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    const error = validateField(fieldName, value);
    setFieldErrors(prev => ({ ...prev, [fieldName]: error }));
  };

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

  // Initialize phone number with default country code
  useEffect(() => {
    setPhoneNumber("+44");
  }, []);

  // Update phone number when country code changes
  useEffect(() => {
    // If phone number is empty or starts with a different country code
    if (!phoneNumber || !phoneNumber.startsWith(phoneCountryCode)) {
      setPhoneNumber(phoneCountryCode);
    }
  }, [phoneCountryCode]);

  // Debounce address search - UPDATED to use Ideal Postcodes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (addressSearch.trim().length > 2) {
        searchAddresses(addressSearch);
      }
    }, 300); // Reduced debounce time for better UX

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

  // Search addresses using Ideal Postcodes API (primary) with OpenStreetMap fallback
  const searchAddresses = async (query) => {
    setIsSearching(true);
    setShowSuggestions(false);
    
    try {
      // Try Ideal Postcodes first (more accurate for UK addresses)
      const response = await fetch(
        `https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses?api_key=${IDEAL_POSTCODES_API_KEY}&query=${encodeURIComponent(
          query
        )}&limit=5`
      );

      const data = await response.json();
      console.log("Ideal Postcodes API Response:", data); // Debug log

      if (data.result && data.result.hits && data.result.hits.length > 0) {
        // Format Ideal Postcodes results to match your existing structure
        const formattedSuggestions = data.result.hits.map((hit) => {
          // Parse the suggestion string to extract components
          const suggestionParts = hit.suggestion.split(', ');
          let street = suggestionParts[0] || '';
          let town = suggestionParts[2] || '';
          let postalCode = suggestionParts[3] || '';
          
          // If we have more parts, adjust
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
              // Store the full hit object for later use
              ideal_postcodes_hit: hit
            }
          };
        });
        
        console.log("Formatted suggestions:", formattedSuggestions); // Debug log
        setAddressSuggestions(formattedSuggestions);
        setShowSuggestions(true);
      } else {
        console.log("No results from Ideal Postcodes, trying OpenStreetMap");
        // If no results from Ideal Postcodes, try OpenStreetMap as fallback
        await searchOpenStreetMap(query);
      }
    } catch (err) {
      console.error("Ideal Postcodes search error:", err);
      // Fallback to OpenStreetMap if Ideal Postcodes fails
      await searchOpenStreetMap(query);
    } finally {
      setIsSearching(false);
    }
  };

  // Fallback to OpenStreetMap Nominatim API
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

  // Handle address selection - UPDATED to handle both Ideal Postcodes and OpenStreetMap formats
  const handleSelectAddress = async (suggestion) => {
    const address = suggestion.address;
    
    let street = "";
    let town = "";
    let country = "";
    let postalCode = "";

    // Check if it's an Ideal Postcodes result
    if (address.ideal_postcodes_hit) {
      const hit = address.ideal_postcodes_hit;
      
      // We need to fetch the full address details using udprn
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
          // If we can't get full details, parse from suggestion
          const suggestionParts = hit.suggestion.split(', ');
          street = suggestionParts[0] || '';
          town = suggestionParts[2] || '';
          postalCode = suggestionParts[3] || '';
          country = "United Kingdom";
        }
      } catch (error) {
        console.error("Error fetching full address details:", error);
        // Fallback to parsing suggestion
        const suggestionParts = hit.suggestion.split(', ');
        street = suggestionParts[0] || '';
        town = suggestionParts[2] || '';
        postalCode = suggestionParts[3] || '';
        country = "United Kingdom";
      }
    } else {
      // OpenStreetMap format (original logic)
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
    }

    // Update address fields
    setAddressFields({
      street: street || "",
      town: town || "",
      country: country || "",
      postal_code: postalCode || "",
    });

    // Clear field errors for address fields
    setFieldErrors(prev => ({
      ...prev,
      street: "",
      town: "",
      country: "",
      postal_code: ""
    }));

    // Clear search and suggestions
    setAddressSearch("");
    setAddressSuggestions([]);
    setShowSuggestions(false);

    setStatus("Address selected and auto-filled!");
    setStatusType("success");
  };

  // Handle manual changes to address fields with validation
  const handleAddressFieldChange = (field, value) => {
    setAddressFields((prev) => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error for this field when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: "" }));
    }
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

  // Handle phone number input change
  const handlePhoneNumberChange = (value) => {
    // Always keep the country code at the beginning
    if (!value.startsWith(phoneCountryCode)) {
      // If user tries to delete the country code, prevent it
      if (phoneCountryCode.startsWith(value)) {
        setPhoneNumber(phoneCountryCode);
      } else {
        // Otherwise, prepend the country code
        setPhoneNumber(phoneCountryCode + value.replace(phoneCountryCode, ''));
      }
    } else {
      setPhoneNumber(value);
    }
    
    // Clear phone error when user starts typing
    if (phoneError) {
      setPhoneError("");
    }
    if (fieldErrors.phone) {
      setFieldErrors(prev => ({ ...prev, phone: "" }));
    }
  };

  // Validate phone number
  const validatePhoneNumber = () => {
    if (!phoneNumber.trim() || phoneNumber === phoneCountryCode) {
      setPhoneError("Phone number is required");
      setFieldErrors(prev => ({ ...prev, phone: "Phone number is required" }));
      return false;
    }

    // Remove non-digits except plus at the beginning
    const phoneWithoutFormatting = phoneNumber.replace(/[^\d\+]/g, "");
    
    // Count only digits after the plus
    const digitsOnly = phoneWithoutFormatting.replace(/\D/g, "");
    
    // Check total length (including country code)
    if (digitsOnly.length < 10) {
      setPhoneError("Phone number is too short");
      setFieldErrors(prev => ({ ...prev, phone: "Phone number is too short" }));
      return false;
    }

    if (digitsOnly.length > 15) {
      setPhoneError("Phone number is too long");
      setFieldErrors(prev => ({ ...prev, phone: "Phone number is too long" }));
      return false;
    }

    setPhoneError("");
    setFieldErrors(prev => ({ ...prev, phone: "" }));
    return true;
  };

  // Handle country code change
  const handleCountryCodeChange = (newCode) => {
    const oldCode = phoneCountryCode;
    setPhoneCountryCode(newCode);
    
    // Update phone number with new country code
    if (phoneNumber.startsWith(oldCode)) {
      setPhoneNumber(newCode + phoneNumber.slice(oldCode.length));
    } else {
      setPhoneNumber(newCode + phoneNumber.replace(/^\+\d+/, ''));
    }
  };

  // Your existing functions
  async function handleSendOtp(e) {
    e.preventDefault();
    
    // Validate email first
    const emailError = validateField("email", email);
    if (emailError) {
      setFieldErrors(prev => ({ ...prev, email: emailError }));
      setTouched(prev => ({ ...prev, email: true }));
      setStatus("Please enter a valid email address");
      setStatusType("error");
      return;
    }
    
    setFieldErrors(prev => ({ ...prev, email: "" }));
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
    
    // Validate OTP
    const otpError = validateField("otp", otp);
    if (otpError) {
      setFieldErrors(prev => ({ ...prev, otp: otpError }));
      setTouched(prev => ({ ...prev, otp: true }));
      setStatus("Please enter a valid OTP");
      setStatusType("error");
      return;
    }
    
    setFieldErrors(prev => ({ ...prev, otp: "" }));
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
    setFieldErrors(prev => ({ ...prev, email: "", otp: "" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Validate email verification
    if (!emailVerified) {
      setStatus("Please verify your email first.");
      setStatusType("error");
      return;
    }

    const formData = new FormData(e.currentTarget);
    
    // Add the complete phone number
    formData.set("phone", phoneNumber);
    formData.set("email", email);
    formData.set("otpToken", otpToken);

    // Add address fields to the submission
    formData.set("street", addressFields.street);
    formData.set("town", addressFields.town);
    formData.set("country", addressFields.country);
    formData.set("postal_code", addressFields.postal_code);

    // Product name is free text: use the selected product's title if one was
    // picked from the dropdown, otherwise use whatever the user typed.
    const selectedProduct = products.find((p) => p.id === selectedProductId);
    const productName = selectedProduct
      ? selectedProduct.title
      : productSearchTerm.trim();
    formData.set("product_title", productName);
    // Keep product_id satisfied for the backend's required check: use the real
    // product id when selected, otherwise fall back to the typed name.
    formData.set("product_id", selectedProductId || productName);

    // Validate all fields
    if (!validateAllFields(formData)) {
      setStatus("Please fix the errors below before submitting.");
      setStatusType("error");
      // Scroll to first error
      const firstErrorField = document.querySelector(".field-error");
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Validate phone number separately
    if (!validatePhoneNumber()) {
      setStatus("Please enter a valid phone number.");
      setStatusType("error");
      return;
    }

    const body = Object.fromEntries(formData.entries());

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

  const countryOptions = countries.map((country) => ({
    value: country.code,
    label: country.country,
    isoCode: country.isoCode,
  }));

  const formatOptionLabel = ({ label, value, isoCode }) => {
    const flagUrl = findFlagUrlByIso2Code(isoCode);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <img src={flagUrl} alt={label} width="20" />
        <span><span className="ki0490400ki440ki">{label}</span>({value})</span>
      </div>
    );
  };

  return (
    <main className="warranty-page">
      <h1>Warranty Activation</h1>
      <p className="paragraph">
        Please provide your personal and order details to activate your product
        warranty.
      </p>

      {/* Customer Information Section */}
      <section className="warranty-section">
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
        <form className="warranty-form" onSubmit={handleSubmit}>
          <div className="warranty-field fulllwwidth">
            <label htmlFor="full_name">Full Name</label>
            <input
              id="full_name"
              className={`warranty-input ${fieldErrors.full_name && touched.full_name ? "input-error" : ""}`}
              type="text"
              name="full_name"
              placeholder="Full Name"
              required
              onBlur={(e) => handleFieldBlur("full_name", e.target.value)}
              onChange={() => {
                if (fieldErrors.full_name) {
                  setFieldErrors(prev => ({ ...prev, full_name: "" }));
                }
              }}
            />
            {fieldErrors.full_name && touched.full_name && (
              <p className="field-error-message">{fieldErrors.full_name}</p>
            )}
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
                        className={`warranty-input ${fieldErrors.email && touched.email ? "input-error" : ""}`}
                        type="email"
                        name="customer_email"
                        required
                        value={email}
                        placeholder="Email Address"
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors(prev => ({ ...prev, email: "" }));
                          }
                        }}
                        onBlur={(e) => handleFieldBlur("email", e.target.value)}
                      />
                      {fieldErrors.email && touched.email && (
                        <p className="field-error-message">{fieldErrors.email}</p>
                      )}
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
                        className={`warranty-input ${fieldErrors.otp && touched.otp ? "input-error" : ""}`}
                        type="text"
                        name="otp"
                        required
                        value={otp}
                        placeholder="Enter OTP"
                        onChange={(e) => {
                          setOtp(e.target.value);
                          if (fieldErrors.otp) {
                            setFieldErrors(prev => ({ ...prev, otp: "" }));
                          }
                        }}
                        onBlur={(e) => handleFieldBlur("otp", e.target.value)}
                      />
                      {fieldErrors.otp && touched.otp && (
                        <p className="field-error-message">{fieldErrors.otp}</p>
                      )}
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
           Keep me updated with warranty status updates and follow-ups, which may include occasional offers and tech tips. You can unsubscribe anytime.
          </p>

          {/* Phone Number Section - UPDATED */}
          <div className="warranty-field fulllwwidth phone98008008">
            <div className="phone-input-container">
              {/* Country Code Selector with Flags */}
              <div className="country-code-selector">
                <Select
                  options={countryOptions}
                  value={countryOptions.find((c) => c.value === phoneCountryCode)}
                  onChange={(selected) => handleCountryCodeChange(selected.value)}
                  formatOptionLabel={formatOptionLabel}
                  isSearchable
                />
              </div>
              
              {/* Phone Number Input (contains full number including country code) */}
              <input
                id="phone"
                className={`warranty-input phone-number-input ${fieldErrors.phone || phoneError ? "input-error" : ""}`}
                type="tel"
                value={phoneNumber}
                onChange={(e) => handlePhoneNumberChange(e.target.value)}
                placeholder="+44 123 456 7890"
                required
                name="phone"
                onBlur={() => {
                  setTouched(prev => ({ ...prev, phone: true }));
                  validatePhoneNumber();
                }}
              />
            </div>
            
            {(phoneError || fieldErrors.phone) && (
              <p className="field-error-message">{phoneError || fieldErrors.phone}</p>
            )}
          </div>

          {/* Address Search with Autocomplete - UPDATED placeholder */}
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
              className={`warranty-input ${fieldErrors.street && touched.street ? "input-error" : ""}`}
              type="text"
              name="street"
              required
              value={addressFields.street}
              placeholder="Street Address"
              onChange={(e) => handleAddressFieldChange("street", e.target.value)}
              onBlur={(e) => handleFieldBlur("street", e.target.value)}
            />
            {fieldErrors.street && touched.street && (
              <p className="field-error-message">{fieldErrors.street}</p>
            )}
          </div>

          <div className="warranty-field">
            <label htmlFor="town">Town / City</label>
            <input
              id="town"
              className={`warranty-input ${fieldErrors.town && touched.town ? "input-error" : ""}`}
              type="text"
              name="town"
              required
              value={addressFields.town}
              placeholder="Town / City"
              onChange={(e) => handleAddressFieldChange("town", e.target.value)}
              onBlur={(e) => handleFieldBlur("town", e.target.value)}
            />
            {fieldErrors.town && touched.town && (
              <p className="field-error-message">{fieldErrors.town}</p>
            )}
          </div>

          <div className="warranty-field">
            <label htmlFor="country">Country</label>
            <input
              id="country"
              className={`warranty-input ${fieldErrors.country && touched.country ? "input-error" : ""}`}
              type="text"
              name="country"
              required
              value={addressFields.country}
              placeholder="Country"
              onChange={(e) => handleAddressFieldChange("country", e.target.value)}
              onBlur={(e) => handleFieldBlur("country", e.target.value)}
            />
            {fieldErrors.country && touched.country && (
              <p className="field-error-message">{fieldErrors.country}</p>
            )}
          </div>

          <div className="warranty-field">
            <label htmlFor="postal_code">Postal Code</label>
            <input
              id="postal_code"
              className={`warranty-input ${fieldErrors.postal_code && touched.postal_code ? "input-error" : ""}`}
              type="text"
              name="postal_code"
              required
              value={addressFields.postal_code}
              placeholder="Postal Code"
              onChange={(e) => handleAddressFieldChange("postal_code", e.target.value)}
              onBlur={(e) => handleFieldBlur("postal_code", e.target.value)}
            />
            {fieldErrors.postal_code && touched.postal_code && (
              <p className="field-error-message">{fieldErrors.postal_code}</p>
            )}
          </div>

          <div className="warranty-field labelupper908">
            <label htmlFor="purchase_source">Purchase Source</label>
            <select
              id="purchase_source"
              className={`warranty-select ${fieldErrors.purchase_source && touched.purchase_source ? "input-error" : ""}`}
              name="purchase_source"
              required
              onBlur={(e) => handleFieldBlur("purchase_source", e.target.value)}
              onChange={() => {
                if (fieldErrors.purchase_source) {
                  setFieldErrors(prev => ({ ...prev, purchase_source: "" }));
                }
              }}
            >
              <option value="">Select...</option>
              <option>Amazon</option>
              <option>Ebay</option>
              <option>Mobitel Website</option>
              <option>Others</option>
            </select>
            {fieldErrors.purchase_source && touched.purchase_source && (
              <p className="field-error-message">{fieldErrors.purchase_source}</p>
            )}
          </div>

          <div className="warranty-field labelupper908">
            <label htmlFor="purchase_date">Purchase Date</label>
            <input
              id="purchase_date"
              className={`warranty-input ${fieldErrors.purchase_date && touched.purchase_date ? "input-error" : ""}`}
              type="date"
              name="purchase_date"
              required
              onBlur={(e) => handleFieldBlur("purchase_date", e.target.value)}
              onChange={() => {
                if (fieldErrors.purchase_date) {
                  setFieldErrors(prev => ({ ...prev, purchase_date: "" }));
                }
              }}
            />
            {fieldErrors.purchase_date && touched.purchase_date && (
              <p className="field-error-message">{fieldErrors.purchase_date}</p>
            )}
          </div>

          <div className="warranty-field">
            <label htmlFor="order_number">Order / Invoice Number</label>
            <input
              id="order_number"
              className={`warranty-input ${fieldErrors.order_number && touched.order_number ? "input-error" : ""}`}
              type="text"
              name="order_number"
              placeholder="Order / Invoice Number"
              required
              onBlur={(e) => handleFieldBlur("order_number", e.target.value)}
              onChange={() => {
                if (fieldErrors.order_number) {
                  setFieldErrors(prev => ({ ...prev, order_number: "" }));
                }
              }}
            />
            {fieldErrors.order_number && touched.order_number && (
              <p className="field-error-message">{fieldErrors.order_number}</p>
            )}
          </div>

          {/* NEW: Product typeahead field */}
          <div className="warranty-field product-typeahead">
            <label htmlFor="product_search">Product</label>

            {/* Visible typeable input */}
            <input
              id="product_search"
              className={`warranty-input ${fieldErrors.product_id && touched.product_id ? "input-error" : ""}`}
              type="text"
              placeholder={
                productsLoading
                  ? "Loading products..."
                  : productsError
                  ? "Product Name"
                  : "Type to search products..."
              }
              value={productSearchTerm}
              onChange={(e) => {
                setProductSearchTerm(e.target.value);
                setShowProductDropdown(true);
                if (fieldErrors.product_id) {
                  setFieldErrors(prev => ({ ...prev, product_id: "" }));
                }
              }}
              onFocus={() => {
                if (!productsLoading && !productsError) {
                  setShowProductDropdown(true);
                }
              }}
              onBlur={(e) => {
                // Typing a free-text product name is acceptable; just require
                // that something was entered.
                setTouched((prev) => ({ ...prev, product_id: true }));
                setFieldErrors((prev) => ({
                  ...prev,
                  product_id: validateField("product_id", e.target.value),
                }));
              }}
              autoComplete="off"
            />

            {/* Hidden input mirrors the selected product id (if any). The
                actual submitted product_id is set in handleSubmit and falls
                back to the typed product name when nothing is selected. */}
            <input
              type="hidden"
              name="product_id"
              value={selectedProductId}
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
                        setTouched(prev => ({ ...prev, product_id: true }));
                      }}
                    >
                      {product.title}
                    </div>
                  ))
                )}
              </div>
            )}

            {fieldErrors.product_id && touched.product_id && (
              <p className="field-error-message">{fieldErrors.product_id}</p>
            )}
            {/* {productsError && (
              <p className="warranty-status warranty-status--error">
                {productsError}
              </p>
            )} */}
          </div>

          <div className="warranty-field">
            <label htmlFor="serial_number">Product Serial Number</label>
            <input
              id="serial_number"
              className={`warranty-input ${fieldErrors.serial_number && touched.serial_number ? "input-error" : ""}`}
              type="text"
              name="serial_number"
              placeholder="Product Serial Number"
              required
              onBlur={(e) => handleFieldBlur("serial_number", e.target.value)}
              onChange={() => {
                if (fieldErrors.serial_number) {
                  setFieldErrors(prev => ({ ...prev, serial_number: "" }));
                }
              }}
            />
            {fieldErrors.serial_number && touched.serial_number && (
              <p className="field-error-message">{fieldErrors.serial_number}</p>
            )}
          </div>

          <div className="warranty-actions">
            <button
              className="warranty-button"
              type="submit"
              
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