import shopify from "../shopify.server";

export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();

  const email = String(body.email || "").trim();
  const fullName = String(body.full_name || "").trim();
  const phone = String(body.phone || "").trim();
  const street = String(body.street || "").trim();
  const town = String(body.town || "").trim();
  const country = String(body.country || "").trim();
  const postalCode = String(body.postal_code || "").trim();

  const marketingConsentGiven = Boolean(body.termsformarketing);

  const purchaseSource = String(body.purchase_source || "").trim();
  const purchaseDate = String(body.purchase_date || "").trim();
  const orderNumber = String(body.order_number || "").trim();
  const productId = String(body.product_id || "").trim();
  const productName = String(body.product_title || "").trim(); // optional, but useful
  const serialNumber = String(body.serial_number || "").trim();

  if (
    !email ||
    !fullName ||
    !phone ||
    !street ||
    !town ||
    !country ||
    !postalCode ||
    !purchaseSource ||
    !purchaseDate ||
    !orderNumber ||
    !productId ||
    !serialNumber
  ) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const nameParts = fullName.split(" ");
  const firstName = nameParts[0] || "Customer";
  const lastName = nameParts.slice(1).join(" ") || "Customer";

  const shopDomain = "mobiteluk.myshopify.com";

  const sessions = await shopify.sessionStorage.findSessionsByShop(shopDomain);
  const session = sessions && sessions[0];

  if (!session || !session.accessToken) {
    console.error("No offline session found for shop", shopDomain, sessions);
    return new Response(
      JSON.stringify({ error: "App is not installed or token missing" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const customerResult = await findOrCreateCustomer(
    session,
    email,
    firstName,
    lastName,
    phone,
    {
      address1: street,
      city: town,
      country,
      zip: postalCode,
    }
  );

  if (!customerResult.ok) {
    return new Response(JSON.stringify({ error: customerResult.error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const customerId = customerResult.customerId;

  const warrantyResult = await createWarrantyMetaobject(session, {
    customerEmail: email,
    productName,
    purchaseSource,
    purchaseDate,
    orderNumber,
    serialNumber,
  });

  if (!warrantyResult.ok) {
    return new Response(JSON.stringify({ error: warrantyResult.error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const warrantyMetaobjectId = warrantyResult.metaobjectId;

  const metafieldResult = await setCustomerWarrantyMetafield(
    session,
    customerId,
    warrantyMetaobjectId
  );

  if (!metafieldResult.ok) {
    return new Response(JSON.stringify({ error: metafieldResult.error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }


  if (marketingConsentGiven) {
  const marketingRes = await updateCustomerEmailMarketingConsent(
    session,
    customerId
  );

  if (!marketingRes.ok) {
    // You can choose to log and continue, or fail the whole request.
    // Here we log but don't block warranty creation:
    console.error("Failed to update email marketing consent", marketingRes.error);
    // If you DO want to fail:
    // return new Response(JSON.stringify({ error: marketingRes.error }), {
    //   status: 500,
    //   headers: { "Content-Type": "application/json" },
    // });
  }
}

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function callAdminGraphQL(session, query, variables = {}) {
  const endpoint = `https://${session.shop}/admin/api/2024-07/graphql.json`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    console.error("Network error calling Admin API:", err);
    return { ok: false, error: `Network error: ${err.message}` };
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    console.error("Failed to parse Admin API response:", text);
    return { ok: false, error: "Invalid JSON from Admin API" };
  }

  if (!res.ok) {
    console.error("Admin API HTTP error", res.status, json);
    return {
      ok: false,
      error: `Admin API HTTP ${res.status}: ${JSON.stringify(json)}`,
    };
  }

  if (json.errors) {
    console.error("Admin API GraphQL errors", json.errors);
    return {
      ok: false,
      error: `GraphQL errors: ${JSON.stringify(json.errors)}`,
    };
  }

  return { ok: true, data: json.data };
}

async function findOrCreateCustomer(
  session,
  email,
  firstName,
  lastName,
  phone,
  address
) {
  const searchQuery = `#graphql
    query FindCustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        nodes { id }
      }
    }`;

  const searchRes = await callAdminGraphQL(session, searchQuery, {
    query: `email:${email}`,
  });

  if (!searchRes.ok) {
    return { ok: false, error: `Customer search failed: ${searchRes.error}` };
  }

  const nodes =
    searchRes.data &&
    searchRes.data.customers &&
    searchRes.data.customers.nodes;

  const existing = nodes && nodes[0];
  if (existing && existing.id) {
    return { ok: true, customerId: existing.id };
  }

  const createMutation = `#graphql
    mutation CreateCustomer(
      $email: String!,
      $firstName: String!,
      $lastName: String!,
      $phone: String,
      $addresses: [MailingAddressInput!]!
    ) {
      customerCreate(
        input: {
          email: $email
          firstName: $firstName
          lastName: $lastName
          phone: $phone
          addresses: $addresses
        }
      ) {
        customer { id }
        userErrors { field message }
      }
    }`;

  const createRes = await callAdminGraphQL(session, createMutation, {
    email,
    firstName,
    lastName,
    phone,
    addresses: [address],
  });

  if (!createRes.ok) {
    return { ok: false, error: `Customer create failed: ${createRes.error}` };
  }

  const userErrors =
    createRes.data &&
    createRes.data.customerCreate &&
    createRes.data.customerCreate.userErrors;

  if (userErrors && userErrors.length > 0) {
    console.error("customerCreate userErrors", userErrors);
    return {
      ok: false,
      error: `customerCreate errors: ${JSON.stringify(userErrors)}`,
    };
  }

  const customerId =
    createRes.data &&
    createRes.data.customerCreate &&
    createRes.data.customerCreate.customer &&
    createRes.data.customerCreate.customer.id;

  if (!customerId) {
    return { ok: false, error: "customerCreate returned no customer id" };
  }

  return { ok: true, customerId };
}

// Create / upsert merchant-owned metaobject: warranty_activation_details
async function createWarrantyMetaobject(session, input) {
  const warrantyHandle = `warranty-${input.orderNumber}-${input.serialNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "-");

  const mutation = `#graphql
    mutation CreateWarrantyActivationDetails(
      $handle: MetaobjectHandleInput!
      $customerEmail: String!
      $productName: String!
      $purchaseSource: String!
      $purchaseDate: String!
      $orderNumber: String!
      $serialNumber: String!
    ) {
      metaobjectUpsert(
        handle: $handle
        metaobject: {
          fields: [
            { key: "product_name",                 value: $productName }
            { key: "customer_email",               value: $customerEmail }
            { key: "product_purchase_source",      value: $purchaseSource }
            { key: "product_purchase_date",        value: $purchaseDate }
            { key: "product_order_invoice_number", value: $orderNumber }
            { key: "product_serial_number",        value: $serialNumber }
            { key: "status",                       value: "Pending" }
          ]
        }
      ) {
        metaobject { id }
        userErrors { field message }
      }
    }`;

  const res = await callAdminGraphQL(session, mutation, {
    handle: {
      type: "warranty_activation_details",
      handle: warrantyHandle,
    },
    customerEmail: input.customerEmail,
    productName: input.productName,
    purchaseSource: input.purchaseSource,
    purchaseDate: input.purchaseDate,
    orderNumber: input.orderNumber,
    serialNumber: input.serialNumber,
  });

  if (!res.ok) {
    return { ok: false, error: `metaobjectUpsert failed: ${res.error}` };
  }

  const userErrors =
    res.data &&
    res.data.metaobjectUpsert &&
    res.data.metaobjectUpsert.userErrors;

  if (userErrors && userErrors.length > 0) {
    console.error("metaobjectUpsert userErrors", userErrors);
    return {
      ok: false,
      error: `metaobjectUpsert errors: ${JSON.stringify(userErrors)}`,
    };
  }

  const metaobjectId =
    res.data &&
    res.data.metaobjectUpsert &&
    res.data.metaobjectUpsert.metaobject &&
    res.data.metaobjectUpsert.metaobject.id;

  if (!metaobjectId) {
    return { ok: false, error: "metaobjectUpsert returned no metaobject id" };
  }

  return { ok: true, metaobjectId };
}


// Updates the customer's email marketing consent to SUBSCRIBED
async function updateCustomerEmailMarketingConsent(session, customerId) {
  const mutation = `#graphql
    mutation CustomerEmailMarketingConsentSubscribe(
      $input: CustomerEmailMarketingConsentUpdateInput!
    ) {
      customerEmailMarketingConsentUpdate(input: $input) {
        customer {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const nowIso = new Date().toISOString();

  const res = await callAdminGraphQL(session, mutation, {
    input: {
      customerId,
      emailMarketingConsent: {
        marketingState: "SUBSCRIBED",
        marketingOptInLevel: "SINGLE_OPT_IN",
        consentCollectedFrom: "OTHER",
        consentUpdatedAt: nowIso,
      },
    },
  });

  if (!res.ok) {
    return {
      ok: false,
      error: `customerEmailMarketingConsentUpdate failed: ${res.error}`,
    };
  }

  const userErrors =
    res.data &&
    res.data.customerEmailMarketingConsentUpdate &&
    res.data.customerEmailMarketingConsentUpdate.userErrors;

  if (userErrors && userErrors.length > 0) {
    console.error("customerEmailMarketingConsentUpdate userErrors", userErrors);
    return {
      ok: false,
      error: `customerEmailMarketingConsentUpdate errors: ${JSON.stringify(
        userErrors
      )}`,
    };
  }

  return { ok: true };
}




// Link the warranty_activation_details metaobject to the Customer via a metafield
// Definition: Customer metafield custom.warranty_activation_details
// Type: list.metaobject_reference
async function setCustomerWarrantyMetafield(
  session,
  customerId,
  warrantyMetaobjectId
) {
  const mutation = `#graphql
    mutation SetCustomerWarranty(
      $customerId: ID!
      $warrantyIdsJson: String!
    ) {
      metafieldsSet(
        metafields: [
          {
            ownerId: $customerId
            namespace: "custom"
            key: "warranty_activation_details"
            type: "list.metaobject_reference"
            value: $warrantyIdsJson
          }
        ]
      ) {
        metafields { id }
        userErrors { field message }
      }
    }`;

  // Single-element list for now
  const warrantyIdsJson = JSON.stringify([warrantyMetaobjectId]);

  const res = await callAdminGraphQL(session, mutation, {
    customerId,
    warrantyIdsJson,
  });

  if (!res.ok) {
    return { ok: false, error: `metafieldsSet failed: ${res.error}` };
  }

  const userErrors =
    res.data &&
    res.data.metafieldsSet &&
    res.data.metafieldsSet.userErrors;

  if (userErrors && userErrors.length > 0) {
    console.error("metafieldsSet userErrors", userErrors);
    return {
      ok: false,
      error: `metafieldsSet errors: ${JSON.stringify(userErrors)}`,
    };
  }

  return { ok: true };
}