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

  const purchaseSource = String(body.purchase_source || "").trim();
  const purchaseDate = String(body.purchase_date || "").trim();
  const orderNumber = String(body.order_number || "").trim();
  const productName = String(body.product_name || "").trim();
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
    !productName ||
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

  // TODO: if you support multiple shops, don't hard-code this; derive from session
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

  // 1) Find or create the Customer
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

  // 2) Create / upsert the warranty_activation_details metaobject
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

  // 3) Link that metaobject to the customer via a customer metafield
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
  // 1) Try to find existing customer by email
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

  // 2) If not found, create a new customer
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
  // Build a stable handle for this warranty record, so repeated submissions
  // for the same order+serial update instead of duplicating.
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
      type: "warranty_activation_details", // merchant-owned type created in Admin
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

// Link the warranty_activation_details metaobject to the Customer via a metafield
async function setCustomerWarrantyMetafield(
  session,
  customerId,
  warrantyMetaobjectId
) {
  const mutation = `#graphql
    mutation SetCustomerWarranty(
      $customerId: ID!
      $warrantyId: String!
    ) {
      metafieldsSet(
        metafields: [
          {
            ownerId: $customerId
            namespace: "custom"                     # MUST match your Admin metafield definition
            key: "warranty_activation_details"      # MUST match your Admin metafield definition
            type: "metaobject_reference"
            value: $warrantyId                      # metaobject GID from metaobjectUpsert
          }
        ]
      ) {
        metafields { id }
        userErrors { field message }
      }
    }`;

  const res = await callAdminGraphQL(session, mutation, {
    customerId,
    warrantyId: warrantyMetaobjectId,
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