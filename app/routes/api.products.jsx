// app/routes/api.products.jsx
import { authenticate } from "../shopify.server";

// GraphQL query to get products. This matches the official Admin API example:
// https://shopify.dev/docs/api/admin-graphql/latest/queries/products
const PRODUCTS_QUERY = `#graphql
  query WarrantyProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

// For a GET /api/products endpoint
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    // Adjust this number if you want more/less products
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: 50 },
    });

    const responseJson = await response.json();
    const products = responseJson.data?.products?.nodes ?? [];

    // Use the Web Fetch API Response (no @remix-run/node)
    return new Response(
      JSON.stringify({
        products: products.map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
        })),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching products:", error);

    return new Response(
      JSON.stringify({ error: "Failed to fetch products" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}