import { useEffect, useState } from "react";
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

// Action: handles status update and email sending
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("_intent") || "updateWarranty";

  if (intent === "updateWarranty") {
    const metaobjectId = formData.get("metaobjectId");
    const startDate = (formData.get("startDate") || "").toString().trim();
    const endDate = (formData.get("endDate") || "").toString().trim();
    const rawStatus = (formData.get("status") || "").toString().trim();
    const customerEmail = (formData.get("customerEmail") || "").toString().trim();
    const customerName = (formData.get("customerName") || "").toString().trim();
    const productName = (formData.get("productName") || "").toString().trim();
    const orderInvoiceNumber = (formData.get("orderInvoiceNumber") || "").toString().trim();
    const serialNumber = (formData.get("serialNumber") || "").toString().trim();
    const purchaseDate = (formData.get("purchaseDate") || "").toString().trim();
    const purchaseSource = (formData.get("purchaseSource") || "").toString().trim();

    const allowedStatuses = ["Approved", "Pending", "Rejected", "In Process"];
    const newStatus = allowedStatuses.includes(rawStatus) ? rawStatus : "Pending";

    if (!metaobjectId) {
      return {
        ok: false,
        error: "Missing metaobjectId",
      };
    }

    // Update the metaobject
    const fields = [
      { key: "start_date", value: startDate },
      { key: "end_date", value: endDate },
      { key: "status", value: newStatus },
    ];

    const updateResponse = await admin.graphql(
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

    const updateJson = await updateResponse.json();
    const payload = updateJson?.data?.metaobjectUpdate;
    const userErrors = payload?.userErrors ?? [];

    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e) => e.message).join(", "),
        userErrors,
      };
    }

    // Get the updated status directly from the mutation response
    const updatedStatus = payload?.metaobject?.status?.value || newStatus;
    
    console.log(`Updated status from response: ${updatedStatus}`);

    // Send email with the status from the update response
    let emailSent = false;
    let emailError = null;

    if (customerEmail) {
      try {
        await sendWarrantyStatusEmail({
          email: customerEmail,
          customerName,
          productName,
          status: updatedStatus, // Use the status from the update response
          startDate: startDate,
          endDate: endDate,
          orderInvoiceNumber,
          serialNumber,
          purchaseDate,
          purchaseSource,
        });
        emailSent = true;
        console.log(`Email sent with status: ${updatedStatus}`);
      } catch (err) {
        console.error("Error sending warranty status email:", err);
        emailError = "Warranty updated but failed to send email notification.";
      }
    }

    const updated = payload?.metaobject;

    return {
      ok: true,
      metaobject: updated,
      emailSent,
      emailError,
      newStatus: updatedStatus,
    };
  }

  return {
    ok: false,
    error: "Invalid intent",
  };
};

// Simple Pagination component: only Previous / Next + current page display
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
          borderRadius: "4px",
          border: "1px solid #ccc",
          backgroundColor: "#fff",
          cursor: (currentPage <= 1 || !hasPreviousPage) ? "not-allowed" : "pointer",
          opacity: (currentPage <= 1 || !hasPreviousPage) ? 0.5 : 1,
        }}
      >
        Previous
      </button>

      <span style={{ fontSize: "14px" }}>
        Page {currentPage}
      </span>

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1, "next")}
        disabled={!hasNextPage}
        style={{
          padding: "8px 16px",
          borderRadius: "4px",
          border: "1px solid #ccc",
          backgroundColor: "#fff",
          cursor: !hasNextPage ? "not-allowed" : "pointer",
          opacity: !hasNextPage ? 0.5 : 1,
        }}
      >
        Next
      </button>
    </div>
  );
}

// Auto-update warranty component
function AutoUpdateWarranty({ warranty, customer, onUpdate }) {
  const [localStatus, setLocalStatus] = useState(warranty.status);
  const [localStartDate, setLocalStartDate] = useState(warranty.startDate || "");
  const [localEndDate, setLocalEndDate] = useState(warranty.endDate || "");
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isUpdating = fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === "idle") {
      if (fetcher.data.emailSent) {
        shopify.toast?.show?.(`Warranty status updated to ${fetcher.data.newStatus} and email sent to customer`);
      } else if (fetcher.data.emailError) {
        shopify.toast?.show?.(fetcher.data.emailError, { duration: 5000 });
      } else {
        shopify.toast?.show?.(`Warranty status updated to ${fetcher.data.newStatus} successfully`);
      }
      // Trigger a refresh of the page data
      if (onUpdate) onUpdate();
    } else if (fetcher.data && !fetcher.data.ok && fetcher.state === "idle") {
      shopify.toast?.show?.(fetcher.data.error || "Update failed", { tone: "critical" });
    }
  }, [fetcher.data, fetcher.state, shopify, onUpdate]);

  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    setLocalStatus(newStatus);
    submitUpdate(newStatus, localStartDate, localEndDate);
  };

  const handleStartDateChange = (e) => {
    const newDate = e.target.value;
    setLocalStartDate(newDate);
    submitUpdate(localStatus, newDate, localEndDate);
  };

  const handleEndDateChange = (e) => {
    const newDate = e.target.value;
    setLocalEndDate(newDate);
    submitUpdate(localStatus, localStartDate, newDate);
  };

  const submitUpdate = (status, startDate, endDate) => {
    const fd = new FormData();
    fd.append("_intent", "updateWarranty");
    fd.append("metaobjectId", warranty.id);
    fd.append("status", status);
    fd.append("startDate", startDate);
    fd.append("endDate", endDate);
    fd.append("customerEmail", warranty.customerEmail || customer.email || "");
    fd.append("customerName", customer.displayName || "");
    fd.append("productName", warranty.productName || "");
    fd.append("orderInvoiceNumber", warranty.orderInvoiceNumber || "");
    fd.append("serialNumber", warranty.serialNumber || "");
    fd.append("purchaseDate", warranty.purchaseDate || "");
    fd.append("purchaseSource", warranty.purchaseSource || "");

    fetcher.submit(fd, { method: "post" });
  };

  const normalizedStatus = ["Approved", "Pending", "Rejected", "In Process"].includes(localStatus)
    ? localStatus
    : "Pending";

  return (
    <div
      style={{
        padding: "16px",
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "#e0e0e0",
        borderRadius: "4px",
        backgroundColor: "#ffffff",
      }}
    >
      <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: "600" }}>
        {warranty.productName || "Warranty record"}
      </h3>

      <div style={{ marginBottom: "12px" }}>
        <div style={{ marginBottom: "4px" }}>
          <strong>Customer email:</strong> {warranty.customerEmail || "—"}
        </div>
        <div style={{ marginBottom: "4px" }}>
          <strong>Purchase source:</strong> {warranty.purchaseSource || "—"}
        </div>
        <div style={{ marginBottom: "4px" }}>
          <strong>Purchase date:</strong> {warranty.purchaseDate || "—"}
        </div>
        <div style={{ marginBottom: "4px" }}>
          <strong>Order / Invoice #:</strong> {warranty.orderInvoiceNumber || "—"}
        </div>
        <div style={{ marginBottom: "4px" }}>
          <strong>Serial number:</strong> {warranty.serialNumber || "—"}
        </div>
      </div>

      {/* Editable fields with auto-update */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "14px", fontWeight: "500" }}>Start date</label>
          <input
            type="date"
            value={localStartDate}
            onChange={handleStartDateChange}
            disabled={isUpdating}
            style={{
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "14px", fontWeight: "500" }}>End date</label>
          <input
            type="date"
            value={localEndDate}
            onChange={handleEndDateChange}
            disabled={isUpdating}
            style={{
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "14px", fontWeight: "500" }}>Status</label>
          <select
            value={normalizedStatus}
            onChange={handleStatusChange}
            disabled={isUpdating}
            style={{
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="In Process">In Process</option>
          </select>
        </div>
      </div>

      {isUpdating && (
        <div style={{ marginTop: "12px", fontSize: "14px", color: "#0066cc" }}>
          Updating warranty and sending notification...
        </div>
      )}
    </div>
  );
}

export default function WarrantyListingPage() {
  const { customers, pageInfo, currentPage, totalPages, totalCustomers } = useLoaderData();
  const shopify = useAppBridge();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

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

  const handleWarrantyUpdate = () => {
    // Reload the page data after a short delay to ensure Shopify has processed the update
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <div style={{ padding: "20px" }} key={refreshKey}>
      <h1 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "20px" }}>
        Warranty Registrations
      </h1>
      
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: "500", marginBottom: "16px" }}>Customers</h2>
        
        {customers.length === 0 ? (
          <p>
            No customers found with the <strong>warrantyregistered</strong> tag.
          </p>
        ) : (
          <>
            <p style={{ fontSize: "14px", marginBottom: "16px", color: "#666" }}>
              Showing page {currentPage} of {totalPages} (Total customers: {totalCustomers})
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  style={{
                    padding: "16px",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: "#e0e0e0",
                    borderRadius: "4px",
                    backgroundColor: "#f5f5f5",
                  }}
                >
                  {/* Customer header */}
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "16px" }}>
                      {customer.displayName || "Unnamed customer"}
                    </strong>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: "#e3f2fd",
                      fontSize: "12px",
                    }}>
                      {customer.email || "No email"}
                    </span>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: "#e3f2fd",
                      fontSize: "12px",
                    }}>
                      {customer.phone || "No phone"}
                    </span>
                    <button
                      onClick={() =>
                        shopify.intents.invoke?.("edit:shopify/Customer", {
                          value: customer.id,
                        })
                      }
                      style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        backgroundColor: "#fff",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      View customer
                    </button>
                  </div>

                  {/* Warranties for this customer */}
                  {customer.warranties.length === 0 ? (
                    <p style={{ margin: "12px 0 0 0", color: "#666" }}>
                      This customer has no warranty activation records linked.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {customer.warranties.map((warranty) => (
                        <AutoUpdateWarranty
                          key={warranty.id}
                          warranty={warranty}
                          customer={customer}
                          onUpdate={handleWarrantyUpdate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Component */}
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