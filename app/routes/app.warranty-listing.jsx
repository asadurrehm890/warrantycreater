import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Loader: fetch customers + warranty metaobjects
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query CustomersWithWarrantyMetaobjects(
        $query: String!
        $first: Int!
        $warrantiesFirst: Int!
      ) {
        customers(first: $first, query: $query) {
          edges {
            node {
              id
              displayName
              defaultEmailAddress { emailAddress }
              defaultPhoneNumber { phoneNumber }
              tags
              metafield(namespace: "custom", key: "warranty_activation_details") {
                id
                type
                references(first: $warrantiesFirst) {
                  nodes {
                    ... on Metaobject {
                      id
                      productName: field(key: "product_name") { value }
                      customerEmail: field(key: "customer_email") { value }
                      purchaseSource: field(key: "product_purchase_source") { value }
                      purchaseDate: field(key: "product_purchase_date") { value }
                      orderInvoiceNumber: field(key: "product_order_invoice_number") { value }
                      serialNumber: field(key: "product_serial_number") { value }
                      startDate: field(key: "start_date") { value }
                      endDate: field(key: "end_date") { value }
                      status: field(key: "status") { value }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        query: "tag:'warrantyregistered'",
        first: 50,         // customers per page
        warrantiesFirst: 20, // warranties per customer
      },
    },
  );

  const json = await response.json();

  const customerEdges = json?.data?.customers?.edges ?? [];

  const customers = customerEdges.map(({ node }) => {
    const metafield = node.metafield;
    const warrantyNodes =
      metafield?.references?.nodes?.filter(Boolean) ?? [];

    const warranties = warrantyNodes.map((mo) => ({
      id: mo.id,
      productName: mo.productName?.value || "",
      customerEmail: mo.customerEmail?.value || "",
      purchaseSource: mo.purchaseSource?.value || "",
      purchaseDate: mo.purchaseDate?.value || "",
      orderInvoiceNumber: mo.orderInvoiceNumber?.value || "",
      serialNumber: mo.serialNumber?.value || "",
      startDate: mo.startDate?.value || "",
      endDate: mo.endDate?.value || "",
      status: mo.status?.value || "",
    }));

    return {
      id: node.id,
      displayName: node.displayName,
      email: node.defaultEmailAddress?.emailAddress || "",
      phone: node.defaultPhoneNumber?.phoneNumber || "",
      tags: node.tags || [],
      warranties,
    };
  });

  return { customers };
};

// Action: update a warranty metaobject (start_date, end_date, status)
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const metaobjectId = formData.get("metaobjectId");
  const startDate = (formData.get("startDate") || "").toString().trim();
  const endDate = (formData.get("endDate") || "").toString().trim();
  const status = (formData.get("status") || "").toString().trim();

  if (!metaobjectId) {
    return {
      ok: false,
      error: "Missing metaobjectId",
    };
  }

  const fields = [];

  // Only send fields that have some value; adjust if you want to allow clearing
  fields.push({ key: "start_date", value: startDate });
  fields.push({ key: "end_date", value: endDate });
  fields.push({ key: "status", value: status });

  const response = await admin.graphql(
    `#graphql
      mutation UpdateWarrantyMetaobject(
        $id: ID!
        $metaobject: MetaobjectUpdateInput!
      ) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            startDate: field(key: "start_date") { value }
            endDate: field(key: "end_date") { value }
            status: field(key: "status") { value }
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      variables: {
        id: metaobjectId,
        metaobject: {
          fields,
        },
      },
    },
  );

  const json = await response.json();
  const payload = json?.data?.metaobjectUpdate;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors.map((e) => e.message).join(", "),
      userErrors,
    };
  }

  const updated = payload?.metaobject;

  return {
    ok: true,
    metaobject: updated,
  };
};

export default function WarrantyListingPage() {
  const { customers } = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();

  const isSubmitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // Optional: show a toast when an update succeeds
  if (fetcher.data?.ok && fetcher.state === "idle") {
    // basic guard so toast doesn't spam too much; a more robust approach would use useEffect
    shopify.toast?.show?.("Warranty updated");
  }

  return (
    <s-page heading="Warranty registrations">
      <s-section heading="Customers with warrantyregistered tag">
        {customers.length === 0 ? (
          <s-paragraph>
            No customers found with the{" "}
            <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
          </s-paragraph>
        ) : (
          customers.map((customer) => (
            <s-box
              key={customer.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
              style={{ marginBottom: "16px" }}
            >
              <s-stack direction="inline" gap="base" alignment="center">
                <s-text variant="headingMd">
                  {customer.displayName || "Unnamed customer"}
                </s-text>
                <s-badge tone="subdued">
                  {customer.email || "No email"}
                </s-badge>
                <s-badge tone="subdued">
                  {customer.phone || "No phone"}
                </s-badge>
                <s-button
                  variant="tertiary"
                  onClick={() =>
                    shopify.intents.invoke?.("edit:shopify/Customer", {
                      value: customer.id,
                    })
                  }
                >
                  View customer
                </s-button>
              </s-stack>

              {customer.warranties.length === 0 ? (
                <s-paragraph>
                  This customer has no warranty activation records linked.
                </s-paragraph>
              ) : (
                <div style={{ marginTop: "12px" }}>
                  {customer.warranties.map((warranty) => (
                    <s-box
                      key={warranty.id}
                      padding="base"
                      borderWidth="base"
                      borderRadius="base"
                      background="surface"
                      style={{ marginBottom: "12px" }}
                    >
                      {/* Read-only fields */}
                      <s-heading level={3}>
                        {warranty.productName || "Warranty record"}
                      </s-heading>
                      <s-stack direction="block" gap="tight">
                        <s-text>
                          <strong>Customer email:</strong>{" "}
                          {warranty.customerEmail || "—"}
                        </s-text>
                        <s-text>
                          <strong>Purchase source:</strong>{" "}
                          {warranty.purchaseSource || "—"}
                        </s-text>
                        <s-text>
                          <strong>Purchase date:</strong>{" "}
                          {warranty.purchaseDate || "—"}
                        </s-text>
                        <s-text>
                          <strong>Order / Invoice #:</strong>{" "}
                          {warranty.orderInvoiceNumber || "—"}
                        </s-text>
                        <s-text>
                          <strong>Serial number:</strong>{" "}
                          {warranty.serialNumber || "—"}
                        </s-text>
                      </s-stack>

                      {/* Editable fields form */}
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="metaobjectId"
                          value={warranty.id}
                        />

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "12px",
                            marginTop: "12px",
                          }}
                        >
                          <div>
                            <label
                              style={{ display: "block", marginBottom: 4 }}
                            >
                              Start date
                            </label>
                            <input
                              type="date"
                              name="startDate"
                              defaultValue={warranty.startDate || ""}
                              style={{ width: "100%" }}
                            />
                          </div>
                          <div>
                            <label
                              style={{ display: "block", marginBottom: 4 }}
                            >
                              End date
                            </label>
                            <input
                              type="date"
                              name="endDate"
                              defaultValue={warranty.endDate || ""}
                              style={{ width: "100%" }}
                            />
                          </div>
                          <div>
                            <label
                              style={{ display: "block", marginBottom: 4 }}
                            >
                              Status
                            </label>
                            <select
                            name="status"
                            defaultValue={
                              ["Approved", "Pending", "Rejected", "In Process"].includes(
                                warranty.status,
                              )
                                ? warranty.status
                                : "Pending"
                            }
                            style={{ width: "100%" }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="In Process">In Process</option>
                          </select>
                          </div>
                        </div>

                        <div style={{ marginTop: "12px" }}>
                          <s-button
                            type="submit"
                            {...(isSubmitting ? { loading: true } : {})}
                          >
                            Save warranty
                          </s-button>
                          {fetcher.data && !fetcher.data.ok && (
                            <s-text tone="critical" as="p">
                              {fetcher.data.error ||
                                "Failed to update warranty."}
                            </s-text>
                          )}
                        </div>
                      </fetcher.Form>
                    </s-box>
                  ))}
                </div>
              )}
            </s-box>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};