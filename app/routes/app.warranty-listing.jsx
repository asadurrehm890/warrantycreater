import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { sendWarrantyStatusEmail } from "../warrantyEmail.server";

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
        first: 150,         // customers per page
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

// Action: handles two intents:
// - saveWarranty: update metaobject fields (start_date, end_date, status)
// - sendEmail: send a warranty status email via Brevo
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("_intent") || "saveWarranty";

  if (intent === "sendEmail") {
    const email = (formData.get("customerEmail") || "").toString().trim();
    const customerName = (formData.get("customerName") || "")
      .toString()
      .trim();
    const productName = (formData.get("productName") || "").toString().trim();
    const status = (formData.get("status") || "").toString().trim();
    const startDate = (formData.get("startDate") || "").toString().trim();
    const endDate = (formData.get("endDate") || "").toString().trim();
    const orderInvoiceNumber = (formData.get("orderInvoiceNumber") || "")
      .toString()
      .trim();
    const serialNumber = (formData.get("serialNumber") || "")
      .toString()
      .trim();
    const purchaseDate = (formData.get("purchaseDate") || "")
      .toString()
      .trim();
    const purchaseSource = (formData.get("purchaseSource") || "")
      .toString()
      .trim();

    if (!email) {
      return { ok: false, error: "Customer email is missing for this warranty." };
    }

    try {
      await sendWarrantyStatusEmail({
        email,
        customerName,
        productName,
        status,
        startDate,
        endDate,
        orderInvoiceNumber,
        serialNumber,
        purchaseDate,
        purchaseSource,
      });

      return { ok: true, sentEmail: true };
    } catch (err) {
      console.error("Error sending warranty status email:", err);
      return {
        ok: false,
        error: "Failed to send warranty email.",
      };
    }
  }

  // Default: saveWarranty intent (update metaobject)
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
      if (fetcher.data.sentEmail) {
        shopify.toast?.show?.("Warranty email sent to customer");
      } else {
        shopify.toast?.show?.("Warranty updated");
      }
    }
  }, [fetcher.data?.ok, fetcher.data?.sentEmail, fetcher.state, shopify]);

  return (
    <s-page heading="Warranty registrations">
      <s-section heading="Customers">
        {customers.length === 0 ? (
          <s-paragraph>
            No customers found with the{" "}
            <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
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
                  <s-text variant="bodyStrong">
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
                    {customer.warranties.map((warranty) => {
                      const normalizedStatus = ["Approved", "Pending", "Rejected", "In Process"].includes(
                        warranty.status,
                      )
                        ? warranty.status
                        : "Pending";

                      return (
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
                              <s-text variant="bodyStrong">Customer email:</s-text>{" "}
                              {warranty.customerEmail || "—"}
                            </s-text>
                            <s-text>
                              <s-text variant="bodyStrong">Purchase source:</s-text>{" "}
                              {warranty.purchaseSource || "—"}
                            </s-text>
                            <s-text>
                              <s-text variant="bodyStrong">Purchase date:</s-text>{" "}
                              {warranty.purchaseDate || "—"}
                            </s-text>
                            <s-text>
                              <s-text variant="bodyStrong">Order / Invoice #:</s-text>{" "}
                              {warranty.orderInvoiceNumber || "—"}
                            </s-text>
                            <s-text>
                              <s-text variant="bodyStrong">Serial number:</s-text>{" "}
                              {warranty.serialNumber || "—"}
                            </s-text>
                          </s-stack>

                          {/* Save Warranty form: fields + Save button */}
                          <fetcher.Form method="post">
                            <input
                              type="hidden"
                              name="_intent"
                              value="saveWarranty"
                            />
                            <input
                              type="hidden"
                              name="metaobjectId"
                              value={warranty.id}
                            />

                            {/* Editable fields (start, end, status) */}
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
                              <s-select name="status" label="Status">
                                <s-option
                                  value="Pending"
                                  selected={normalizedStatus === "Pending"}
                                >
                                  Pending
                                </s-option>
                                <s-option
                                  value="Approved"
                                  selected={normalizedStatus === "Approved"}
                                >
                                  Approved
                                </s-option>
                                <s-option
                                  value="Rejected"
                                  selected={normalizedStatus === "Rejected"}
                                >
                                  Rejected
                                </s-option>
                                <s-option
                                  value="In Process"
                                  selected={normalizedStatus === "In Process"}
                                >
                                  In Process
                                </s-option>
                              </s-select>
                            </s-stack>

                            {/* Buttons row: horizontal with margin-top */}
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                marginTop: "12px",
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {/* Save Warranty button submits this form */}
                              <s-button
                                type="submit"
                                {...(isSubmitting ? { loading: true } : {})}
                              >
                                Save warranty
                              </s-button>

                              {/* Send Email button triggers fetcher.submit separately */}
                              <s-button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  const fd = new FormData();
                                  fd.append("_intent", "sendEmail");
                                  fd.append(
                                    "customerEmail",
                                    warranty.customerEmail || customer.email || "",
                                  );
                                  fd.append(
                                    "customerName",
                                    customer.displayName || "",
                                  );
                                  fd.append(
                                    "productName",
                                    warranty.productName || "",
                                  );
                                  fd.append(
                                    "orderInvoiceNumber",
                                    warranty.orderInvoiceNumber || "",
                                  );
                                  fd.append(
                                    "serialNumber",
                                    warranty.serialNumber || "",
                                  );
                                  fd.append(
                                    "purchaseDate",
                                    warranty.purchaseDate || "",
                                  );
                                  fd.append(
                                    "purchaseSource",
                                    warranty.purchaseSource || "",
                                  );
                                  fd.append("status", normalizedStatus);
                                  fd.append(
                                    "startDate",
                                    warranty.startDate || "",
                                  );
                                  fd.append("endDate", warranty.endDate || "");

                                  fetcher.submit(fd, { method: "post" });
                                }}
                              >
                                Send email
                              </s-button>

                              {fetcher.data && !fetcher.data.ok && (
                                <s-text tone="critical">
                                  {fetcher.data.error || "Action failed."}
                                </s-text>
                              )}
                            </div>
                          </fetcher.Form>
                        </s-box>
                      );
                    })}
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