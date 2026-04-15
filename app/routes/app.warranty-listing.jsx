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

// Pagination component
function Pagination({ currentPage, hasNextPage, hasPreviousPage, onPageChange }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "8px",
        marginTop: "24px",
        padding: "16px",
      }}
    >
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1, "prev")}
        disabled={currentPage <= 1 || !hasPreviousPage}
        style={{
          padding: "8px 16px",
          backgroundColor: "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Previous
      </button>

      <span style={{ margin: "0 16px" }}>
        Page {currentPage}
      </span>

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1, "next")}
        disabled={!hasNextPage}
        style={{
          padding: "8px 16px",
          backgroundColor: "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Next
      </button>
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
    <div
      style={{
        padding: "16px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        marginTop: "12px",
        backgroundColor: "#fff",
      }}
    >
      <h3 style={{ margin: "0 0 12px 0" }}>
        {warranty.productName || "Warranty record"}
      </h3>

      <div style={{ marginBottom: "12px" }}>
        <p style={{ margin: "4px 0" }}>
          <strong>Customer email:</strong> {warranty.customerEmail || customer.email || "—"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Purchase source:</strong> {warranty.purchaseSource || "—"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Purchase date:</strong> {warranty.purchaseDate || "—"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Order / Invoice #:</strong> {warranty.orderInvoiceNumber || "—"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Serial number:</strong> {warranty.serialNumber || "—"}
        </p>
      </div>

      <form method="post" ref={formRef}>
        <input type="hidden" name="_intent" value="saveWarranty" />
        <input type="hidden" name="metaobjectId" value={warranty.id} />
        <input type="hidden" name="customerEmail" value={warranty.customerEmail || customer.email || ""} />
        <input type="hidden" name="customerName" value={customer.displayName || ""} />
        <input type="hidden" name="productName" value={warranty.productName || ""} />
        <input type="hidden" name="orderInvoiceNumber" value={warranty.orderInvoiceNumber || ""} />
        <input type="hidden" name="serialNumber" value={warranty.serialNumber || ""} />
        <input type="hidden" name="purchaseDate" value={warranty.purchaseDate || ""} />
        <input type="hidden" name="purchaseSource" value={warranty.purchaseSource || ""} />

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
              Start date:
            </label>
            <input
              type="date"
              name="startDate"
              defaultValue={warranty.startDate || ""}
              onChange={handleAutoSubmit}
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
              End date:
            </label>
            <input
              type="date"
              name="endDate"
              defaultValue={warranty.endDate || ""}
              onChange={handleAutoSubmit}
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
              Status:
            </label>
            <select
              name="status"
              defaultValue={normalizedStatus}
              onChange={handleAutoSubmit}
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            >
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="In Process">In Process</option>
            </select>
          </div>
        </div>

        {fetcher.data && !fetcher.data.ok && (
          <div style={{ color: "red", marginTop: "12px" }}>
            {fetcher.data.error || "Action failed."}
          </div>
        )}
      </form>
    </div>
  );
}

// Customer Card Component
function CustomerCard({ customer, fetcher }) {
  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        marginBottom: "16px",
        backgroundColor: "#f5f5f5",
      }}
    >
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
        <strong style={{ fontSize: "16px" }}>
          {customer.displayName || "Unnamed customer"}
        </strong>
        <span style={{
          padding: "4px 8px",
          backgroundColor: "#e3f2fd",
          borderRadius: "4px",
          fontSize: "12px",
        }}>
          {customer.email || "No email"}
        </span>
        <span style={{
          padding: "4px 8px",
          backgroundColor: "#e3f2fd",
          borderRadius: "4px",
          fontSize: "12px",
        }}>
          {customer.phone || "No phone"}
        </span>
        <button
          onClick={() => {
            // Open customer in Shopify admin
            window.open(`https://admin.shopify.com/customers/${customer.id.split('/').pop()}`, '_blank');
          }}
          style={{
            padding: "6px 12px",
            backgroundColor: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          View customer
        </button>
      </div>

      {customer.warranties.length === 0 ? (
        <p style={{ color: "#666", margin: 0 }}>
          This customer has no warranty activation records linked.
        </p>
      ) : (
        <div>
          {customer.warranties.map((warranty) => (
            <WarrantyItem
              key={warranty.id}
              warranty={warranty}
              customer={customer}
              fetcher={fetcher}
            />
          ))}
        </div>
      )}
    </div>
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
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "24px" }}>Warranty Registrations</h1>
      
      <div>
        <h2 style={{ marginBottom: "16px", fontSize: "18px" }}>Customers</h2>
        
        {customers.length === 0 ? (
          <p>
            No customers found with the <strong>warrantyregistered</strong> tag.
          </p>
        ) : (
          <>
            <p style={{ marginBottom: "16px", color: "#666" }}>
              Showing page {currentPage}
            </p>

            <div>
              {customers.map((customer) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  fetcher={fetcher}
                />
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              hasNextPage={pageInfo.hasNextPage}
              hasPreviousPage={pageInfo.hasPreviousPage}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};