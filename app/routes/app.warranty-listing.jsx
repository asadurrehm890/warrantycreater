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
        first: 50,
        warrantiesFirst: 20,
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

// Action: handles two intents
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

  // Default: saveWarranty intent
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

  const getStatusBadgeTone = (status) => {
    switch (status) {
      case "Approved":
        return "success";
      case "Pending":
        return "info";
      case "Rejected":
        return "critical";
      case "In Process":
        return "attention";
      default:
        return "info";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <s-page
      title="Warranty Registrations"
      subtitle="Manage and track customer warranty claims"
      primaryAction={
        <s-button
          variant="primary"
          onClick={() => shopify.toast?.show?.("Export feature coming soon")}
        >
          Export all
        </s-button>
      }
    >
      {customers.length === 0 ? (
        <s-empty-state>
          <s-empty-state-content>
            <s-text variant="headingMd">No warranty registrations</s-text>
            <s-paragraph>
              No customers found with the{" "}
              <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
            </s-paragraph>
          </s-empty-state-content>
        </s-empty-state>
      ) : (
        <s-layout>
          {/* Summary Section */}
          <s-layout-section>
            <s-card>
              <s-card-header>
                <s-text variant="headingMd">Summary</s-text>
              </s-card-header>
              <s-card-section>
                <s-grid columns="4">
                  <s-box>
                    <s-text variant="bodySm" tone="subdued">
                      Total Customers
                    </s-text>
                    <s-text variant="headingLg">
                      {customers.length}
                    </s-text>
                  </s-box>
                  <s-box>
                    <s-text variant="bodySm" tone="subdued">
                      Total Warranties
                    </s-text>
                    <s-text variant="headingLg">
                      {customers.reduce(
                        (sum, c) => sum + c.warranties.length,
                        0
                      )}
                    </s-text>
                  </s-box>
                  <s-box>
                    <s-text variant="bodySm" tone="subdued">
                      Approved
                    </s-text>
                    <s-text variant="headingLg" tone="success">
                      {customers.reduce(
                        (sum, c) =>
                          sum +
                          c.warranties.filter((w) => w.status === "Approved")
                            .length,
                        0
                      )}
                    </s-text>
                  </s-box>
                  <s-box>
                    <s-text variant="bodySm" tone="subdued">
                      Pending
                    </s-text>
                    <s-text variant="headingLg" tone="info">
                      {customers.reduce(
                        (sum, c) =>
                          sum +
                          c.warranties.filter((w) => w.status === "Pending")
                            .length,
                        0
                      )}
                    </s-text>
                  </s-box>
                </s-grid>
              </s-card-section>
            </s-card>
          </s-layout-section>

          {/* Customers List */}
          <s-layout-section>
            <s-stack direction="vertical" gap="lg">
              {customers.map((customer) => (
                <s-card key={customer.id}>
                  {/* Customer Header */}
                  <s-card-header>
                    <s-stack direction="horizontal" gap="md" align="center">
                      <s-text variant="headingMd">
                        {customer.displayName || "Unnamed customer"}
                      </s-text>
                      {customer.email && (
                        <s-badge tone="info">{customer.email}</s-badge>
                      )}
                      {customer.phone && (
                        <s-badge tone="info">{customer.phone}</s-badge>
                      )}
                      <s-box flex="1" />
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
                  </s-card-header>

                  {/* Warranties */}
                  {customer.warranties.length === 0 ? (
                    <s-card-section>
                      <s-text tone="subdued">
                        No warranty activation records linked.
                      </s-text>
                    </s-card-section>
                  ) : (
                    <s-card-section>
                      <s-stack direction="vertical" gap="lg">
                        {customer.warranties.map((warranty) => {
                          const normalizedStatus = [
                            "Approved",
                            "Pending",
                            "Rejected",
                            "In Process",
                          ].includes(warranty.status)
                            ? warranty.status
                            : "Pending";

                          return (
                            <s-card
                              key={warranty.id}
                              padding="md"
                              borderWidth="base"
                              borderRadius="base"
                            >
                              <s-stack direction="vertical" gap="md">
                                {/* Product Header with Status */}
                                <s-stack
                                  direction="horizontal"
                                  gap="md"
                                  align="center"
                                >
                                  <s-text variant="headingSm">
                                    {warranty.productName || "Warranty Record"}
                                  </s-text>
                                  <s-badge tone={getStatusBadgeTone(normalizedStatus)}>
                                    {normalizedStatus}
                                  </s-badge>
                                </s-stack>

                                {/* Product Details Grid */}
                                <s-grid columns="2" gap="md">
                                  <s-box>
                                    <s-text variant="bodySm" tone="subdued">
                                      Customer Email
                                    </s-text>
                                    <s-text>
                                      {warranty.customerEmail || "—"}
                                    </s-text>
                                  </s-box>
                                  <s-box>
                                    <s-text variant="bodySm" tone="subdued">
                                      Purchase Source
                                    </s-text>
                                    <s-text>
                                      {warranty.purchaseSource || "—"}
                                    </s-text>
                                  </s-box>
                                  <s-box>
                                    <s-text variant="bodySm" tone="subdued">
                                      Purchase Date
                                    </s-text>
                                    <s-text>
                                      {formatDate(warranty.purchaseDate)}
                                    </s-text>
                                  </s-box>
                                  <s-box>
                                    <s-text variant="bodySm" tone="subdued">
                                      Order/Invoice #
                                    </s-text>
                                    <s-text>
                                      {warranty.orderInvoiceNumber || "—"}
                                    </s-text>
                                  </s-box>
                                  <s-box>
                                    <s-text variant="bodySm" tone="subdued">
                                      Serial Number
                                    </s-text>
                                    <s-text>
                                      {warranty.serialNumber || "—"}
                                    </s-text>
                                  </s-box>
                                </s-grid>

                                {/* Warranty Management Section */}
                                <s-divider />

                                <s-text variant="headingXs">
                                  Warranty Management
                                </s-text>

                                <s-grid columns="3" gap="md">
                                  {/* Save Warranty Form */}
                                  <s-box gridColumn="span 2">
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

                                      <s-stack direction="horizontal" gap="md">
                                        <s-date-field
                                          name="startDate"
                                          label="Start Date"
                                          defaultValue={
                                            warranty.startDate || ""
                                          }
                                          fullWidth
                                        />
                                        <s-date-field
                                          name="endDate"
                                          label="End Date"
                                          defaultValue={warranty.endDate || ""}
                                          fullWidth
                                        />
                                        <s-select
                                          name="status"
                                          label="Status"
                                          fullWidth
                                        >
                                          <s-option
                                            value="Pending"
                                            selected={
                                              normalizedStatus === "Pending"
                                            }
                                          >
                                            Pending
                                          </s-option>
                                          <s-option
                                            value="Approved"
                                            selected={
                                              normalizedStatus === "Approved"
                                            }
                                          >
                                            Approved
                                          </s-option>
                                          <s-option
                                            value="Rejected"
                                            selected={
                                              normalizedStatus === "Rejected"
                                            }
                                          >
                                            Rejected
                                          </s-option>
                                          <s-option
                                            value="In Process"
                                            selected={
                                              normalizedStatus === "In Process"
                                            }
                                          >
                                            In Process
                                          </s-option>
                                        </s-select>
                                        <s-box alignSelf="end">
                                          <s-button
                                            type="submit"
                                            {...(isSubmitting
                                              ? { loading: true }
                                              : {})}
                                          >
                                            Save
                                          </s-button>
                                        </s-box>
                                      </s-stack>

                                      {fetcher.data &&
                                        !fetcher.data.ok &&
                                        !fetcher.data.sentEmail && (
                                          <s-text tone="critical" size="sm">
                                            {fetcher.data.error ||
                                              "Action failed."}
                                          </s-text>
                                        )}
                                    </fetcher.Form>
                                  </s-box>

                                  {/* Send Email Button */}
                                  <s-box alignSelf="end">
                                    <fetcher.Form method="post">
                                      <input
                                        type="hidden"
                                        name="_intent"
                                        value="sendEmail"
                                      />
                                      <input
                                        type="hidden"
                                        name="customerEmail"
                                        value={
                                          warranty.customerEmail ||
                                          customer.email ||
                                          ""
                                        }
                                      />
                                      <input
                                        type="hidden"
                                        name="customerName"
                                        value={customer.displayName || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="productName"
                                        value={warranty.productName || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="orderInvoiceNumber"
                                        value={warranty.orderInvoiceNumber || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="serialNumber"
                                        value={warranty.serialNumber || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="purchaseDate"
                                        value={warranty.purchaseDate || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="purchaseSource"
                                        value={warranty.purchaseSource || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="status"
                                        value={normalizedStatus}
                                      />
                                      <input
                                        type="hidden"
                                        name="startDate"
                                        value={warranty.startDate || ""}
                                      />
                                      <input
                                        type="hidden"
                                        name="endDate"
                                        value={warranty.endDate || ""}
                                      />

                                      <s-button
                                        type="submit"
                                        variant="secondary"
                                        fullWidth
                                      >
                                        Send Email
                                      </s-button>

                                      {fetcher.data &&
                                        !fetcher.data.ok &&
                                        fetcher.data.sentEmail === false && (
                                          <s-text tone="critical" size="sm">
                                            {fetcher.data.error ||
                                              "Failed to send email."}
                                          </s-text>
                                        )}
                                    </fetcher.Form>
                                  </s-box>
                                </s-grid>

                                {/* Warranty Period Display */}
                                {(warranty.startDate || warranty.endDate) && (
                                  <>
                                    <s-divider />
                                    <s-stack direction="horizontal" gap="md">
                                      {warranty.startDate && (
                                        <s-box>
                                          <s-text variant="bodySm" tone="subdued">
                                            Warranty Start
                                          </s-text>
                                          <s-text>
                                            {formatDate(warranty.startDate)}
                                          </s-text>
                                        </s-box>
                                      )}
                                      {warranty.endDate && (
                                        <s-box>
                                          <s-text variant="bodySm" tone="subdued">
                                            Warranty End
                                          </s-text>
                                          <s-text>
                                            {formatDate(warranty.endDate)}
                                          </s-text>
                                        </s-box>
                                      )}
                                    </s-stack>
                                  </>
                                )}
                              </s-stack>
                            </s-card>
                          );
                        })}
                      </s-stack>
                    </s-card-section>
                  )}
                </s-card>
              ))}
            </s-stack>
          </s-layout-section>
        </s-layout>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};