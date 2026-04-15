import { useEffect, useRef } from "react";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { sendWarrantyStatusEmail } from "../warrantyEmail.server";

// Loader: fetch customers + warranty metaobjects with pagination
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const page = parseInt(url.searchParams.get("page") || "1");
  const customersPerPage = 10;
  const after = url.searchParams.get("after") || null;

  const countResponse = await admin.graphql(
    `#graphql
      query CustomersCount($query: String!) {
        customersCount(query: $query) {
          count
        }
      }
    `,
    {
      variables: {
        query: "tag:'warrantyregistered'",
      },
    },
  );

  const countJson = await countResponse.json();
  const totalCustomers = countJson?.data?.customersCount?.count || 0;
  const totalPages = Math.ceil(totalCustomers / customersPerPage) || 1;

  const response = await admin.graphql(
    `#graphql
      query CustomersWithWarrantyMetaobjects(
        $query: String!
        $first: Int!
        $after: String
      ) {
        customers(
          first: $first
          after: $after
          query: $query
          sortKey: CREATED_AT
          reverse: true
        ) {
          edges {
            cursor
            node {
              id
              displayName
              defaultEmailAddress { emailAddress }
              defaultPhoneNumber { phoneNumber }
              tags
              metafield(namespace: "custom", key: "warranty_activation_details") {
                id
                type
                references(first: 20) {
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
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `,
    {
      variables: {
        query: "tag:'warrantyregistered'",
        first: customersPerPage,
        after: after,
      },
    },
  );

  const json = await response.json();
  const customerEdges = json?.data?.customers?.edges ?? [];
  const pageInfo = json?.data?.customers?.pageInfo ?? {};

  const customers = customerEdges.map(({ node, cursor }) => {
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
      cursor,
    };
  });

  return {
    customers,
    pageInfo,
    currentPage: page,
    totalPages,
    totalCustomers,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("_intent") || "saveWarranty";

  if (intent !== "saveWarranty") {
    return {
      ok: false,
      error: "Unsupported intent",
    };
  }

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

  const email = (formData.get("customerEmail") || "").toString().trim();
  const customerName = (formData.get("customerName") || "").toString().trim();
  const productName = (formData.get("productName") || "").toString().trim();
  const orderInvoiceNumber = (formData.get("orderInvoiceNumber") || "").toString().trim();
  const serialNumber = (formData.get("serialNumber") || "").toString().trim();
  const purchaseDate = (formData.get("purchaseDate") || "").toString().trim();
  const purchaseSource = (formData.get("purchaseSource") || "").toString().trim();

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

  if (!email) {
    return {
      ok: true,
      metaobject: updated,
      sentEmail: false,
      emailError: "Customer email is missing; no email was sent.",
    };
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

    return {
      ok: true,
      metaobject: updated,
      sentEmail: true,
    };
  } catch (err) {
    console.error("Error sending warranty status email:", err);
    return {
      ok: true,
      metaobject: updated,
      sentEmail: false,
      emailError: "Metaobject updated, but failed to send warranty email.",
    };
  }
};

// Pagination Component
function Pagination({ currentPage, hasNextPage, hasPreviousPage, onPageChange, totalPages }) {
  return (
    <s-card sectioned>
      <s-stack alignment="center" distribution="center" spacing="loose">
        <s-button
          onClick={() => onPageChange(currentPage - 1, "prev")}
          disabled={currentPage <= 1 || !hasPreviousPage}
        >
          Previous
        </s-button>
        
        <s-text variant="bodyMd">
          Page {currentPage} of {totalPages}
        </s-text>
        
        <s-button
          onClick={() => onPageChange(currentPage + 1, "next")}
          disabled={!hasNextPage}
        >
          Next
        </s-button>
      </s-stack>
    </s-card>
  );
}

// Warranty Item Component
function WarrantyItem({ warranty, customer, fetcher }) {
  const formRef = useRef(null);
  const normalizedStatus = ["Approved", "Pending", "Rejected", "In Process"].includes(
    warranty.status,
  )
    ? warranty.status
    : "Pending";

  const handleAutoSubmit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fetcher.submit(fd, { method: "post" });
  };

  // Get badge tone based on status
  const getStatusTone = (status) => {
    switch(status) {
      case "Approved": return "success";
      case "Pending": return "attention";
      case "Rejected": return "critical";
      case "In Process": return "info";
      default: return "base";
    }
  };

  return (
    <s-card>
      <s-card-section>
        <s-stack vertical spacing="loose">
          {/* Header */}
          <s-stack alignment="center" distribution="equalSpacing">
            <s-text variant="headingMd" as="h3">
              {warranty.productName || "Warranty Record"}
            </s-text>
            <s-badge tone={getStatusTone(normalizedStatus)}>
              {normalizedStatus}
            </s-badge>
          </s-stack>

          {/* Details Grid */}
          <s-layout>
            <s-layout-section oneHalf>
              <s-stack vertical spacing="tight">
                <s-text variant="bodySm" tone="subdued">Product Information</s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">Customer Email:</s-text>{" "}
                  {warranty.customerEmail || customer.email || "—"}
                </s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">Purchase Source:</s-text>{" "}
                  {warranty.purchaseSource || "—"}
                </s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">Purchase Date:</s-text>{" "}
                  {warranty.purchaseDate || "—"}
                </s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">Order/Invoice #:</s-text>{" "}
                  {warranty.orderInvoiceNumber || "—"}
                </s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">Serial Number:</s-text>{" "}
                  {warranty.serialNumber || "—"}
                </s-text>
              </s-stack>
            </s-layout-section>

            <s-layout-section oneHalf>
              <s-stack vertical spacing="tight">
                <s-text variant="bodySm" tone="subdued">Warranty Period</s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">Start Date:</s-text>{" "}
                  {warranty.startDate || "Not set"}
                </s-text>
                <s-text variant="bodyMd">
                  <s-text variant="bodyStrong">End Date:</s-text>{" "}
                  {warranty.endDate || "Not set"}
                </s-text>
              </s-stack>
            </s-layout-section>
          </s-layout>

          {/* Update Form */}
          <fetcher.Form method="post" ref={formRef}>
            <input type="hidden" name="_intent" value="saveWarranty" />
            <input type="hidden" name="metaobjectId" value={warranty.id} />
            <input type="hidden" name="customerEmail" value={warranty.customerEmail || customer.email || ""} />
            <input type="hidden" name="customerName" value={customer.displayName || ""} />
            <input type="hidden" name="productName" value={warranty.productName || ""} />
            <input type="hidden" name="orderInvoiceNumber" value={warranty.orderInvoiceNumber || ""} />
            <input type="hidden" name="serialNumber" value={warranty.serialNumber || ""} />
            <input type="hidden" name="purchaseDate" value={warranty.purchaseDate || ""} />
            <input type="hidden" name="purchaseSource" value={warranty.purchaseSource || ""} />

            <s-layout>
              <s-layout-section oneThird>
                <s-text-field
                  label="Start Date"
                  name="startDate"
                  type="date"
                  defaultValue={warranty.startDate || ""}
                  onChange={handleAutoSubmit}
                  autoComplete="off"
                />
              </s-layout-section>
              
              <s-layout-section oneThird>
                <s-text-field
                  label="End Date"
                  name="endDate"
                  type="date"
                  defaultValue={warranty.endDate || ""}
                  onChange={handleAutoSubmit}
                  autoComplete="off"
                />
              </s-layout-section>
              
              <s-layout-section oneThird>
                <s-select
                  label="Status"
                  name="status"
                  options={[
                    { label: "Pending", value: "Pending" },
                    { label: "Approved", value: "Approved" },
                    { label: "Rejected", value: "Rejected" },
                    { label: "In Process", value: "In Process" },
                  ]}
                  value={normalizedStatus}
                  onChange={handleAutoSubmit}
                />
              </s-layout-section>
            </s-layout>

            {fetcher.data && !fetcher.data.ok && (
              <s-banner status="critical">
                <s-text>{fetcher.data.error || "Action failed."}</s-text>
              </s-banner>
            )}
          </fetcher.Form>
        </s-stack>
      </s-card-section>
    </s-card>
  );
}

// Customer Card Component
function CustomerCard({ customer, fetcher }) {
  return (
    <s-card>
      <s-card-section>
        <s-stack alignment="center" distribution="equalSpacing">
          <s-stack alignment="center" spacing="base">
            <s-text variant="headingMd" as="h2">
              {customer.displayName || "Unnamed Customer"}
            </s-text>
            <s-badge tone="success">
              {customer.warranties.length} Warranty(ies)
            </s-badge>
          </s-stack>
          
          <s-stack alignment="center" spacing="base">
            <s-badge tone="info">{customer.email || "No email"}</s-badge>
            <s-badge tone="info">{customer.phone || "No phone"}</s-badge>
            <s-button
              onClick={() => {
                const customerId = customer.id.split('/').pop();
                window.open(`https://admin.shopify.com/customers/${customerId}`, '_blank');
              }}
            >
              View Customer
            </s-button>
          </s-stack>
        </s-stack>
      </s-card-section>

      {customer.warranties.length === 0 ? (
        <s-card-section>
          <s-banner status="info">
            <s-text>This customer has no warranty activation records linked.</s-text>
          </s-banner>
        </s-card-section>
      ) : (
        <s-card-section>
          <s-stack vertical spacing="loose">
            {customer.warranties.map((warranty) => (
              <WarrantyItem
                key={warranty.id}
                warranty={warranty}
                customer={customer}
                fetcher={fetcher}
              />
            ))}
          </s-stack>
        </s-card-section>
      )}
    </s-card>
  );
}

// Main Page Component
export default function WarrantyListingPage() {
  const { customers, pageInfo, currentPage, totalPages } = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.ok) {
        if (fetcher.data.sentEmail) {
          shopify.toast.show("Warranty updated and email sent to customer");
        } else if (fetcher.data.emailError) {
          shopify.toast.show(fetcher.data.emailError);
        } else {
          shopify.toast.show("Warranty updated");
        }
      } else if (!fetcher.data.ok && fetcher.data.error) {
        shopify.toast.show(fetcher.data.error);
      }
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const handlePageChange = (newPage, direction = null) => {
    const newSearchParams = new URLSearchParams(searchParams);

    if (direction === "next" && pageInfo.endCursor) {
      newSearchParams.set("after", pageInfo.endCursor);
      newSearchParams.set("page", String(newPage));
    } else if (direction === "prev") {
      newSearchParams.delete("after");
      newSearchParams.set("page", "1");
      newPage = 1;
    } else {
      newSearchParams.delete("after");
      newSearchParams.set("page", "1");
      newPage = 1;
    }

    setSearchParams(newSearchParams);
  };

  return (
    <s-page>
      <s-layout>
        <s-layout-section>
          {/* Header Card */}
          <s-card>
            <s-card-section>
              <s-text variant="headingLg" as="h1">
                Warranty Registrations
              </s-text>
            </s-card-section>
          </s-card>

          {/* Stats Card */}
          <s-card>
            <s-card-section>
              <s-layout>
                <s-layout-section oneThird>
                  <s-stack vertical alignment="center">
                    <s-text variant="headingLg">{customers.length}</s-text>
                    <s-text variant="bodyMd" tone="subdued">Customers</s-text>
                  </s-stack>
                </s-layout-section>
                <s-layout-section oneThird>
                  <s-stack vertical alignment="center">
                    <s-text variant="headingLg">
                      {customers.reduce((sum, c) => sum + c.warranties.length, 0)}
                    </s-text>
                    <s-text variant="bodyMd" tone="subdued">Total Warranties</s-text>
                  </s-stack>
                </s-layout-section>
                <s-layout-section oneThird>
                  <s-stack vertical alignment="center">
                    <s-text variant="headingLg" tone="success">
                      {customers.reduce((sum, c) => 
                        sum + c.warranties.filter(w => w.status === "Approved").length, 0
                      )}
                    </s-text>
                    <s-text variant="bodyMd" tone="subdued">Approved</s-text>
                  </s-stack>
                </s-layout-section>
              </s-layout>
            </s-card-section>
          </s-card>

          {/* Customers List */}
          {customers.length === 0 ? (
            <s-card>
              <s-card-section>
                <s-banner status="info">
                  <s-text>
                    No customers found with the <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
                  </s-text>
                </s-banner>
              </s-card-section>
            </s-card>
          ) : (
            <>
              <s-card>
                <s-card-section>
                  <s-stack alignment="center" distribution="equalSpacing">
                    <s-text variant="headingMd" as="h2">Customers</s-text>
                    <s-text variant="bodyMd" tone="subdued">
                      Showing page {currentPage} of {totalPages}
                    </s-text>
                  </s-stack>
                </s-card-section>
              </s-card>

              <s-stack vertical spacing="loose">
                {customers.map((customer) => (
                  <CustomerCard
                    key={customer.id}
                    customer={customer}
                    fetcher={fetcher}
                  />
                ))}
              </s-stack>

              <Pagination
                currentPage={currentPage}
                hasNextPage={pageInfo.hasNextPage}
                hasPreviousPage={pageInfo.hasPreviousPage}
                onPageChange={handlePageChange}
                totalPages={totalPages}
              />
            </>
          )}
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};