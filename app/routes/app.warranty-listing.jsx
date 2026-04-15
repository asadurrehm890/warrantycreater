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

  // Logical page number (for display)
  const page = parseInt(url.searchParams.get("page") || "1");
  const customersPerPage = 10;

  // Cursor for forward pagination
  const after = url.searchParams.get("after") || null;

  // Get total count to calculate total pages
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

// Action: update metaobject and then send email automatically
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

  // Fields for sending email after successful metaobject update
  const email = (formData.get("customerEmail") || "").toString().trim();
  const customerName = (formData.get("customerName") || "").toString().trim();
  const productName = (formData.get("productName") || "").toString().trim();
  const orderInvoiceNumber = (formData.get("orderInvoiceNumber") || "")
    .toString()
    .trim();
  const serialNumber = (formData.get("serialNumber") || "").toString().trim();
  const purchaseDate = (formData.get("purchaseDate") || "").toString().trim();
  const purchaseSource = (formData.get("purchaseSource") || "")
    .toString()
    .trim();

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

  // If no email, update is still ok; just signal that email wasn't sent
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

// Pagination component using Polaris
function Pagination({ currentPage, hasNextPage, hasPreviousPage, onPageChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "24px" }}>
      <s-button
        onClick={() => onPageChange(currentPage - 1, "prev")}
        disabled={currentPage <= 1 || !hasPreviousPage}
      >
        Previous
      </s-button>
      
      <s-text variant="bodyMd">Page {currentPage}</s-text>
      
      <s-button
        onClick={() => onPageChange(currentPage + 1, "next")}
        disabled={!hasNextPage}
      >
        Next
      </s-button>
    </div>
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

  return (
    <s-card sectioned>
      <s-text variant="headingMd" as="h3">
        {warranty.productName || "Warranty record"}
      </s-text>
      
      <s-stack vertical spacing="loose">
        <s-text>
          <s-text variant="bodyStrong">Customer email:</s-text>{" "}
          {warranty.customerEmail || customer.email || "—"}
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

        <s-stack distribution="fill" spacing="loose">
          <s-date-picker
            month={new Date().getMonth()}
            year={new Date().getFullYear()}
            onChange={(value) => {
              // Handle date change for start date
              const input = document.createElement('input');
              input.name = 'startDate';
              input.value = value.toISOString().split('T')[0];
              formRef.current.appendChild(input);
              handleAutoSubmit();
            }}
          />
          
          <s-text-field
            label="Start date"
            name="startDate"
            type="date"
            defaultValue={warranty.startDate || ""}
            onChange={handleAutoSubmit}
            autoComplete="off"
          />
          
          <s-text-field
            label="End date"
            name="endDate"
            type="date"
            defaultValue={warranty.endDate || ""}
            onChange={handleAutoSubmit}
            autoComplete="off"
          />
          
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
        </s-stack>

        {fetcher.data && !fetcher.data.ok && (
          <s-banner status="critical">
            <s-text>{fetcher.data.error || "Action failed."}</s-text>
          </s-banner>
        )}
      </fetcher.Form>
    </s-card>
  );
}

// Customer Card Component
function CustomerCard({ customer, fetcher }) {
  return (
    <s-card>
      <s-card-section>
        <s-stack alignment="center" spacing="loose">
          <s-text variant="headingMd" as="h2">
            {customer.displayName || "Unnamed customer"}
          </s-text>
          <s-badge status="info">{customer.email || "No email"}</s-badge>
          <s-badge status="info">{customer.phone || "No phone"}</s-badge>
          <s-button
            onClick={() => {
              const customerId = customer.id.split('/').pop();
              window.open(`https://admin.shopify.com/customers/${customerId}`, '_blank');
            }}
          >
            View customer
          </s-button>
        </s-stack>
      </s-card-section>

      {customer.warranties.length === 0 ? (
        <s-card-section>
          <s-text>This customer has no warranty activation records linked.</s-text>
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
  const { customers, pageInfo, currentPage } = useLoaderData();
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

    // Forward: use endCursor as "after"
    if (direction === "next" && pageInfo.endCursor) {
      newSearchParams.set("after", pageInfo.endCursor);
      newSearchParams.set("page", String(newPage));
    }
    // Backward: simple behavior - reset to first page (no cursor)
    else if (direction === "prev") {
      newSearchParams.delete("after");
      newSearchParams.set("page", "1");
      newPage = 1;
    } else {
      // Fallback: reset to first page
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
          <s-card>
            <s-card-section>
              <s-text variant="headingLg" as="h1">
                Warranty Registrations
              </s-text>
            </s-card-section>
          </s-card>

          <s-card>
            <s-card-section>
              <s-text variant="headingMd" as="h2">
                Customers
              </s-text>
            </s-card-section>

            {customers.length === 0 ? (
              <s-card-section>
                <s-banner status="info">
                  <s-text>
                    No customers found with the <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
                  </s-text>
                </s-banner>
              </s-card-section>
            ) : (
              <>
                <s-card-section>
                  <s-text variant="bodyMd" tone="subdued">
                    Showing page {currentPage} of {Math.ceil(customers.length / 10)}
                  </s-text>
                </s-card-section>

                <s-card-section>
                  <s-stack vertical spacing="loose">
                    {customers.map((customer) => (
                      <CustomerCard
                        key={customer.id}
                        customer={customer}
                        fetcher={fetcher}
                      />
                    ))}
                  </s-stack>
                </s-card-section>

                <s-card-section>
                  <Pagination
                    currentPage={currentPage}
                    hasNextPage={pageInfo.hasNextPage}
                    hasPreviousPage={pageInfo.hasPreviousPage}
                    onPageChange={handlePageChange}
                  />
                </s-card-section>
              </>
            )}
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};