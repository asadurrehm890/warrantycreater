import { useEffect } from "react";
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
        first: 50,        // customers per page
        warrantiesFirst: 20, // warranties per customer
      },
    },
  );

  const json = await response.json();

  const customerEdges = json?.data?.customers?.edges ?? [];

  const customers = customerEdges.map(({ node }) => {
    const metafield = node.metafield;
    const warrantyNodes = metafield?.references?.nodes?.filter(Boolean) ?? [];

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
  const rawStatus = (formData.get("status") || "").toString().trim();

  const allowedStatuses = ["Approved", "Pending", "Rejected", "In Process"];
  const status = allowedStatuses.includes(rawStatus) ? rawStatus : "Pending";

  if (!metaobjectId) {
    return {
      ok: false,
      error: "Missing metaobjectId",
    };
  }

  const fields = [
    { key: "start_date", value: startDate },
    { key: "end_date", value: endDate },
    { key: "status", value: status },
  ];

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

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === "idle") {
      shopify.toast?.show?.("Warranty updated");
    }
  }, [fetcher.data?.ok, fetcher.state, shopify]);

  return (
    <s-page heading="Warranty registrations">
      <s-section heading="Customers with warrantyregistered tag">
        {customers.length === 0 ? (
          <s-paragraph>
            No customers found with the{" "}
            <s-text type="strong">warrantyregistered</s-text> tag.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {customers.map((customer) => (
              <s-box
                key={customer.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                {/* Customer header */}
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text type="strong">
                    {customer.displayName || "Unnamed customer"}
                  </s-text>
                  <s-badge tone="info">
                    {customer.email || "No email"}
                  </s-badge>
                  <s-badge tone="info">
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

                {/* Warranties for this customer */}
                {customer.warranties.length === 0 ? (
                  <s-paragraph>
                    This customer has no warranty activation records linked.
                  </s-paragraph>
                ) : (
                  <s-stack direction="block" gap="base">
                    {customer.warranties.map((warranty) => (
                      <s-box
                        key={warranty.id}
                        padding="base"
                        borderWidth="base"
                        borderRadius="base"
                        background="base"
                      >
                        {/* Read-only warranty fields */}
                        <s-heading>
                          {warranty.productName || "Warranty record"}
                        </s-heading>

                        <s-stack direction="block" gap="none">
                          <s-text>
                            <s-text type="strong">Customer email:</s-text>{" "}
                            {warranty.customerEmail || "—"}
                          </s-text>
                          <s-text>
                            <s-text type="strong">Purchase source:</s-text>{" "}
                            {warranty.purchaseSource || "—"}
                          </s-text>
                          <s-text>
                            <s-text type="strong">Purchase date:</s-text>{" "}
                            {warranty.purchaseDate || "—"}
                          </s-text>
                          <s-text>
                            <s-text type="strong">Order / Invoice #:</s-text>{" "}
                            {warranty.orderInvoiceNumber || "—"}
                          </s-text>
                          <s-text>
                            <s-text type="strong">Serial number:</s-text>{" "}
                            {warranty.serialNumber || "—"}
                          </s-text>
                        </s-stack>

                        {/* Editable fields form (start/end date, status) */}
                        <fetcher.Form method="post">
                          {/* Hidden ID for the metaobject to update */}
                          <input
                            type="hidden"
                            name="metaobjectId"
                            value={warranty.id}
                          />

                          {/* Use Polaris fields as form controls */}
                          <s-stack direction="inline" gap="base">
                            <s-date-field
                              name="startDate"
                              label="Start date"
                              defaultValue={warranty.startDate || ""}
                            />
                            <s-date-field
                              name="endDate"
                              label="End date"
                              defaultValue={warranty.endDate || ""}
                            />
                            <s-select
                              name="status"
                              label="Status"
                              defaultValue={
                                ["Approved", "Pending", "Rejected", "In Process"].includes(
                                  warranty.status,
                                )
                                  ? warranty.status
                                  : "Pending"
                              }
                            >
                              <s-option value="Pending">Pending</s-option>
                              <s-option value="Approved">Approved</s-option>
                              <s-option value="Rejected">Rejected</s-option>
                              <s-option value="In Process">
                                In Process
                              </s-option>
                            </s-select>
                          </s-stack>

                          <s-stack direction="inline" gap="base">
                            <s-button
                              type="submit"
                              {...(isSubmitting ? { loading: true } : {})}
                            >
                              Save warranty
                            </s-button>
                            {fetcher.data && !fetcher.data.ok && (
                              <s-text tone="critical">
                                {fetcher.data.error ||
                                  "Failed to update warranty."}
                              </s-text>
                            )}
                          </s-stack>
                        </fetcher.Form>
                      </s-box>
                    ))}
                  </s-stack>
                )}
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};