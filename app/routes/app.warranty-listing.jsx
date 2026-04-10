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
      <s-button
        type="button"
        onClick={() => onPageChange(currentPage - 1, "prev")}
        disabled={currentPage <= 1 || !hasPreviousPage}
      >
        Previous
      </s-button>

      <s-text variant="bodySm">
        Page {currentPage}
      </s-text>

      <s-button
        type="button"
        onClick={() => onPageChange(currentPage + 1, "next")}
        disabled={!hasNextPage}
      >
        Next
      </s-button>
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

  const handleStatusChange = (value) => {
    setLocalStatus(value);
    submitUpdate(value, localStartDate, localEndDate);
  };

  const handleStartDateChange = (value) => {
    setLocalStartDate(value);
    submitUpdate(localStatus, value, localEndDate);
  };

  const handleEndDateChange = (value) => {
    setLocalEndDate(value);
    submitUpdate(localStatus, localStartDate, value);
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
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="base"
    >
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

      {/* Editable fields with auto-update */}
      <s-stack direction="inline" gap="base" style={{ marginTop: "12px" }}>
        <s-date-field
          label="Start date"
          value={localStartDate}
          onChange={handleStartDateChange}
          disabled={isUpdating}
        />
        <s-date-field
          label="End date"
          value={localEndDate}
          onChange={handleEndDateChange}
          disabled={isUpdating}
        />
        <s-select
          label="Status"
          value={normalizedStatus}
          onChange={handleStatusChange}
          disabled={isUpdating}
        >
          <s-option value="Pending">Pending</s-option>
          <s-option value="Approved">Approved</s-option>
          <s-option value="Rejected">Rejected</s-option>
          <s-option value="In Process">In Process</s-option>
        </s-select>
      </s-stack>

      {isUpdating && (
        <s-text variant="bodySm" tone="info" style={{ marginTop: "8px", display: "block" }}>
          Updating warranty and sending notification...
        </s-text>
      )}
    </s-box>
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
    // Increment refresh key to trigger re-fetch of data
    setRefreshKey(prev => prev + 1);
    // Reload the page data after a short delay to ensure Shopify has processed the update
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <s-page heading={`Warranty registrations`} key={refreshKey}>
      <s-section heading="Customers">
        {customers.length === 0 ? (
          <s-paragraph>
            No customers found with the{" "}
            <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
          </s-paragraph>
        ) : (
          <>
            <s-text variant="bodySm">
              Showing page {currentPage} of {totalPages} (Total customers: {totalCustomers})
            </s-text>

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
                      {customer.warranties.map((warranty) => (
                        <AutoUpdateWarranty
                          key={warranty.id}
                          warranty={warranty}
                          customer={customer}
                          onUpdate={handleWarrantyUpdate}
                        />
                      ))}
                    </s-stack>
                  )}
                </s-box>
              ))}
            </s-stack>

            {/* Pagination Component */}
            <Pagination
              currentPage={currentPage}
              hasNextPage={pageInfo.hasNextPage}
              hasPreviousPage={pageInfo.hasPreviousPage}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};