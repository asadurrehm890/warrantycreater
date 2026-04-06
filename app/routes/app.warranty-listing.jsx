import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Loader: fetch customers with tag `warrantyregistered`
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query CustomersWithWarrantyTag($query: String!, $first: Int!) {
        customers(first: $first, query: $query) {
          edges {
            node {
              id
              displayName
              defaultEmailAddress {
                emailAddress
              }
              defaultPhoneNumber {
                phoneNumber
              }
              tags
            }
          }
        }
      }
    `,
    {
      variables: {
        query: "tag:'warrantyregistered'",
        first: 50, // adjust if you want more, max 250
      },
    },
  );

  const responseJson = await response.json();

  const edges = responseJson?.data?.customers?.edges ?? [];

  const customers = edges.map(({ node }) => ({
    id: node.id,
    displayName: node.displayName,
    email: node.defaultEmailAddress?.emailAddress || "",
    phone: node.defaultPhoneNumber?.phoneNumber || "",
    tags: node.tags || [],
  }));

  // In React Router data APIs you can just return a plain object
  return { customers };
};

// No form actions on this page for now
export const action = async () => {
  return null;
};

export default function WarrantyListingPage() {
  const { customers } = useLoaderData();
  const shopify = useAppBridge();

  return (
    <s-page heading="Warranty registrations">
      <s-section heading="Customers with warrantyregistered tag">
        {customers.length === 0 ? (
          <s-paragraph>
            No customers found with the{" "}
            <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
          </s-paragraph>
        ) : (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Phone</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Tags</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td
                      style={{
                        padding: "8px",
                        borderTop: "1px solid #ddd",
                        verticalAlign: "top",
                      }}
                    >
                      {customer.displayName || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderTop: "1px solid #ddd",
                        verticalAlign: "top",
                      }}
                    >
                      {customer.email || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderTop: "1px solid #ddd",
                        verticalAlign: "top",
                      }}
                    >
                      {customer.phone || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderTop: "1px solid #ddd",
                        verticalAlign: "top",
                      }}
                    >
                      {customer.tags.length > 0
                        ? customer.tags.join(", ")
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderTop: "1px solid #ddd",
                        verticalAlign: "top",
                      }}
                    >
                      <s-button
                        variant="tertiary"
                        onClick={() => {
                          // Open the customer in Shopify Admin
                          shopify.intents.invoke?.("edit:shopify/Customer", {
                            value: customer.id,
                          });
                        }}
                      >
                        View customer
                      </s-button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};