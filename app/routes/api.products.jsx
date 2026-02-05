// app/routes/api.products.jsx
import shopify from "../shopify.server";

// Reuse the same helper style as in api.submit-warranty.jsx
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

// Updated: include tags so we can sort by them
const PRODUCTS_QUERY = `#graphql
  query WarrantyProductsByVendor($first: Int!, $query: String!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        vendor
        tags
      }
    }
  }
`;

// Helper to compute tag priority
function getTagPriority(tags) {
  if (!Array.isArray(tags)) return 2;

  const lowerTags = tags.map((t) => t.toLowerCase());

  if (lowerTags.includes("mobitel mobile phones")) return 0;
  if (lowerTags.includes("mobitel accessories")) return 1;
  return 2;
}

// GET /api/products
export async function loader({ request }) {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  const productsRes = await callAdminGraphQL(session, PRODUCTS_QUERY, {
    first: 200,
    query: 'vendor:mobitel',
  });

  if (!productsRes.ok) {
    console.error("Failed to load products", productsRes.error);
    return new Response(JSON.stringify({ error: productsRes.error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const nodes = productsRes.data?.products?.nodes ?? [];

  // Sort: mobitel mobile phones -> mobitel accessories -> others
  nodes.sort((a, b) => {
    const priorityA = getTagPriority(a.tags);
    const priorityB = getTagPriority(b.tags);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Optional secondary sort (e.g., by title)
    return a.title.localeCompare(b.title);
  });

  const simplified = nodes.map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
  }));

  return new Response(JSON.stringify({ products: simplified }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}