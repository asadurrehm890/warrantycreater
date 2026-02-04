// app/routes/api.products.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// GraphQL query to get products (validated against Admin API)
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

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    // Adjust 50 to whatever limit makes sense for your UI
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: 50 },
    });
    const responseJson = await response.json();

    const products = responseJson.data?.products?.nodes ?? [];

    // Return simplified product objects
    return json(
      {
        products: products.map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
};