import { useEffect, useRef, useState } from "react";
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

// Enhanced Pagination Component
function Pagination({ currentPage, hasNextPage, hasPreviousPage, onPageChange, totalPages }) {
  return (
    <s-stack alignment="center" distribution="center" spacing="loose">
      <s-button
        onClick={() => onPageChange(currentPage - 1, "prev")}
        disabled={currentPage <= 1 || !hasPreviousPage}
        icon="ChevronLeft"
      >
        Previous
      </s-button>
      
      <s-text variant="bodyMd" tone="subdued">
        Page <s-text variant="bodyStrong" tone="magic">{currentPage}</s-text> of {totalPages}
      </s-text>
      
      <s-button
        onClick={() => onPageChange(currentPage + 1, "next")}
        disabled={!hasNextPage}
        icon="ChevronRight"
        iconPosition="right"
      >
        Next
      </s-button>
    </s-stack>
  );
}

// Status Badge Component
function StatusBadge({ status }) {
  const statusConfig = {
    Approved: { tone: "success", text: "✓ Approved" },
    Pending: { tone: "attention", text: "⏳ Pending" },
    Rejected: { tone: "critical", text: "✗ Rejected" },
    "In Process": { tone: "info", text: "🔄 In Process" }
  };
  
  const config = statusConfig[status] || statusConfig.Pending;
  
  return (
    <s-badge tone={config.tone} size="large">
      {config.text}
    </s-badge>
  );
}

// Warranty Item Component with Enhanced UX
function WarrantyItem({ warranty, customer, fetcher, isUpdating }) {
  const formRef = useRef(null);
  const [localStatus, setLocalStatus] = useState(warranty.status);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  
  const normalizedStatus = ["Approved", "Pending", "Rejected", "In Process"].includes(localStatus)
    ? localStatus
    : "Pending";

  const handleAutoSubmit = async (event, fieldName, value) => {
    if (!formRef.current) return;
    
    setIsAutoSaving(true);
    
    // Update local state immediately for responsive UI
    if (fieldName === 'status') {
      setLocalStatus(value);
    }
    
    const fd = new FormData(formRef.current);
    
    // If specific field was changed, update it in FormData
    if (fieldName && value !== undefined) {
      fd.set(fieldName, value);
    }
    
    // Small delay to show saving state
    setTimeout(() => {
      fetcher.submit(fd, { method: "post" });
      setTimeout(() => setIsAutoSaving(false), 500);
    }, 100);
  };

  const getDateStatus = (startDate, endDate) => {
    const today = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (today < start) return { text: "Upcoming", tone: "info" };
    if (today > end) return { text: "Expired", tone: "critical" };
    if (today >= start && today <= end) return { text: "Active", tone: "success" };
    return { text: "Unknown", tone: "subdued" };
  };

  const dateStatus = getDateStatus(warranty.startDate, warranty.endDate);

  return (
    <s-card>
      <s-card-section>
        <s-stack vertical spacing="loose">
          {/* Header with Product Name and Status */}
          <s-stack alignment="center" distribution="equalSpacing">
            <s-stack alignment="center" spacing="base">
              <s-icon source="Product" tone="base" />
              <s-text variant="headingMd" as="h3">
                {warranty.productName || "Warranty Record"}
              </s-text>
              <StatusBadge status={normalizedStatus} />
              {isAutoSaving && (
                <s-spinner size="small" accessibilityLabel="Saving" />
              )}
            </s-stack>
            <s-text variant="bodySm" tone="subdued">
              ID: {warranty.id.split('/').pop()}
            </s-text>
          </s-stack>

          {/* Product Details Grid */}
          <s-layout>
            <s-layout-section oneHalf>
              <s-stack vertical spacing="base">
                <s-text variant="headingSm" as="h4">Product Information</s-text>
                <s-card sectioned subdued>
                  <s-stack vertical spacing="tight">
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="Email" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Customer:</s-text>{" "}
                        {warranty.customerEmail || customer.email || "—"}
                      </s-text>
                    </s-stack>
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="Store" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Purchase Source:</s-text>{" "}
                        {warranty.purchaseSource || "—"}
                      </s-text>
                    </s-stack>
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="Calendar" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Purchase Date:</s-text>{" "}
                        {warranty.purchaseDate || "—"}
                      </s-text>
                    </s-stack>
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="Order" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Order/Invoice #:</s-text>{" "}
                        {warranty.orderInvoiceNumber || "—"}
                      </s-text>
                    </s-stack>
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="Barcode" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Serial Number:</s-text>{" "}
                        {warranty.serialNumber || "—"}
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-card>
              </s-stack>
            </s-layout-section>

            <s-layout-section oneHalf>
              <s-stack vertical spacing="base">
                <s-text variant="headingSm" as="h4">Warranty Period</s-text>
                <s-card sectioned subdued>
                  <s-stack vertical spacing="tight">
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="CalendarStart" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Start Date:</s-text>{" "}
                        {warranty.startDate || "Not set"}
                      </s-text>
                    </s-stack>
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="CalendarEnd" tone="subdued" size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">End Date:</s-text>{" "}
                        {warranty.endDate || "Not set"}
                      </s-text>
                    </s-stack>
                    <s-divider />
                    <s-stack alignment="center" spacing="tight">
                      <s-icon source="Status" tone={dateStatus.tone} size="small" />
                      <s-text>
                        <s-text variant="bodyStrong">Warranty Status:</s-text>{" "}
                        <s-text tone={dateStatus.tone}>{dateStatus.text}</s-text>
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-card>
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

            <s-card sectioned>
              <s-text variant="headingSm" as="h4">Update Warranty</s-text>
              <s-layout>
                <s-layout-section oneThird>
                  <s-text-field
                    label="Start Date"
                    name="startDate"
                    type="date"
                    defaultValue={warranty.startDate || ""}
                    onChange={(value) => handleAutoSubmit(null, 'startDate', value)}
                    autoComplete="off"
                    helpText="When the warranty coverage begins"
                  />
                </s-layout-section>
                
                <s-layout-section oneThird>
                  <s-text-field
                    label="End Date"
                    name="endDate"
                    type="date"
                    defaultValue={warranty.endDate || ""}
                    onChange={(value) => handleAutoSubmit(null, 'endDate', value)}
                    autoComplete="off"
                    helpText="When the warranty coverage expires"
                  />
                </s-layout-section>
                
                <s-layout-section oneThird>
                  <s-select
                    label="Claim Status"
                    name="status"
                    options={[
                      { label: "⏳ Pending", value: "Pending" },
                      { label: "✓ Approved", value: "Approved" },
                      { label: "✗ Rejected", value: "Rejected" },
                      { label: "🔄 In Process", value: "In Process" },
                    ]}
                    value={normalizedStatus}
                    onChange={(value) => handleAutoSubmit(null, 'status', value)}
                    helpText="Update the warranty claim status"
                  />
                </s-layout-section>
              </s-layout>
            </s-card>

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

// Customer Card Component with Enhanced UX
function CustomerCard({ customer, fetcher, isUpdating }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <s-card>
      <s-card-section>
        <s-stack alignment="center" distribution="equalSpacing">
          <s-stack alignment="center" spacing="base">
            <s-icon source="Customers" tone="base" size="large" />
            <s-text variant="headingMd" as="h2">
              {customer.displayName || "Unnamed Customer"}
            </s-text>
            <s-badge status="success">{customer.warranties.length} Warranty(ies)</s-badge>
          </s-stack>
          
          <s-stack alignment="center" spacing="base">
            <s-button
              onClick={() => {
                const customerId = customer.id.split('/').pop();
                window.open(`https://admin.shopify.com/customers/${customerId}`, '_blank');
              }}
              icon="ExternalLink"
            >
              View in Admin
            </s-button>
            <s-button
              onClick={() => setIsExpanded(!isExpanded)}
              icon={isExpanded ? "ChevronUp" : "ChevronDown"}
              variant="tertiary"
            >
              {isExpanded ? "Collapse" : "Expand"}
            </s-button>
          </s-stack>
        </s-stack>
        
        <s-stack alignment="center" spacing="loose">
          <s-stack alignment="center" spacing="tight">
            <s-icon source="Email" tone="subdued" size="small" />
            <s-text variant="bodyMd">{customer.email || "No email"}</s-text>
          </s-stack>
          <s-stack alignment="center" spacing="tight">
            <s-icon source="Phone" tone="subdued" size="small" />
            <s-text variant="bodyMd">{customer.phone || "No phone"}</s-text>
          </s-stack>
        </s-stack>
      </s-card-section>

      {isExpanded && (
        <s-card-section>
          {customer.warranties.length === 0 ? (
            <s-banner status="info">
              <s-text>This customer has no warranty activation records linked.</s-text>
            </s-banner>
          ) : (
            <s-stack vertical spacing="loose">
              {customer.warranties.map((warranty) => (
                <WarrantyItem
                  key={warranty.id}
                  warranty={warranty}
                  customer={customer}
                  fetcher={fetcher}
                  isUpdating={isUpdating}
                />
              ))}
            </s-stack>
          )}
        </s-card-section>
      )}
    </s-card>
  );
}

// Stats Card Component
function StatsCard({ totalCustomers, totalWarranties, approvedCount, pendingCount }) {
  return (
    <s-layout>
      <s-layout-section oneQuarter>
        <s-card sectioned>
          <s-stack vertical alignment="center">
            <s-icon source="Customers" tone="base" size="large" />
            <s-text variant="headingLg">{totalCustomers}</s-text>
            <s-text variant="bodyMd" tone="subdued">Total Customers</s-text>
          </s-stack>
        </s-card>
      </s-layout-section>
      
      <s-layout-section oneQuarter>
        <s-card sectioned>
          <s-stack vertical alignment="center">
            <s-icon source="Product" tone="base" size="large" />
            <s-text variant="headingLg">{totalWarranties}</s-text>
            <s-text variant="bodyMd" tone="subdued">Total Warranties</s-text>
          </s-stack>
        </s-card>
      </s-layout-section>
      
      <s-layout-section oneQuarter>
        <s-card sectioned>
          <s-stack vertical alignment="center">
            <s-icon source="Checkmark" tone="success" size="large" />
            <s-text variant="headingLg" tone="success">{approvedCount}</s-text>
            <s-text variant="bodyMd" tone="subdued">Approved</s-text>
          </s-stack>
        </s-card>
      </s-layout-section>
      
      <s-layout-section oneQuarter>
        <s-card sectioned>
          <s-stack vertical alignment="center">
            <s-icon source="Clock" tone="attention" size="large" />
            <s-text variant="headingLg" tone="attention">{pendingCount}</s-text>
            <s-text variant="bodyMd" tone="subdued">Pending</s-text>
          </s-stack>
        </s-card>
      </s-layout-section>
    </s-layout>
  );
}

// Main Page Component
export default function WarrantyListingPage() {
  const { customers, pageInfo, currentPage, totalPages, totalCustomers } = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Calculate stats
  const totalWarranties = customers.reduce((sum, customer) => sum + customer.warranties.length, 0);
  const approvedCount = customers.reduce((sum, customer) => 
    sum + customer.warranties.filter(w => w.status === "Approved").length, 0);
  const pendingCount = customers.reduce((sum, customer) => 
    sum + customer.warranties.filter(w => w.status === "Pending").length, 0);

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.ok) {
        if (fetcher.data.sentEmail) {
          shopify.toast.show("✅ Warranty updated and email sent to customer");
        } else if (fetcher.data.emailError) {
          shopify.toast.show(`⚠️ ${fetcher.data.emailError}`);
        } else {
          shopify.toast.show("✅ Warranty updated successfully");
        }
      } else if (!fetcher.data.ok && fetcher.data.error) {
        shopify.toast.show(`❌ ${fetcher.data.error}`);
      }
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const handlePageChange = (newPage, direction = null) => {
    const newSearchParams = new URLSearchParams(searchParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });

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

  // Filter customers by search term
  const filteredCustomers = customers.filter(customer => 
    customer.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <s-page>
      <s-layout>
        {/* Header Section */}
        <s-layout-section>
          <s-card>
            <s-card-section>
              <s-stack alignment="center" distribution="equalSpacing">
                <s-stack vertical spacing="tight">
                  <s-text variant="headingLg" as="h1">
                    Warranty Management Dashboard
                  </s-text>
                  <s-text variant="bodyMd" tone="subdued">
                    Manage and track all customer warranty registrations
                  </s-text>
                </s-stack>
                <s-button
                  icon="Refresh"
                  onClick={() => window.location.reload()}
                >
                  Refresh Data
                </s-button>
              </s-stack>
            </s-card-section>
          </s-card>
        </s-layout-section>

        {/* Stats Section */}
        <s-layout-section>
          <StatsCard 
            totalCustomers={totalCustomers}
            totalWarranties={totalWarranties}
            approvedCount={approvedCount}
            pendingCount={pendingCount}
          />
        </s-layout-section>

        {/* Search and Filter Section */}
        <s-layout-section>
          <s-card>
            <s-card-section>
              <s-text-field
                label="Search Customers"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={setSearchTerm}
                prefix={<s-icon source="Search" />}
                clearButton
                onClearButtonClick={() => setSearchTerm("")}
                helpText="Find customers by their display name or email address"
              />
            </s-card-section>
          </s-card>
        </s-layout-section>

        {/* Customers List Section */}
        <s-layout-section>
          <s-card>
            <s-card-section>
              <s-stack alignment="center" distribution="equalSpacing">
                <s-text variant="headingMd" as="h2">
                  Customer Warranties
                </s-text>
                <s-badge status="info">
                  {filteredCustomers.length} Customer(s) Found
                </s-badge>
              </s-stack>
            </s-card-section>

            {filteredCustomers.length === 0 ? (
              <s-card-section>
                <s-banner status="info">
                  <s-stack vertical spacing="tight">
                    <s-text variant="headingSm">No customers found</s-text>
                    <s-text>
                      No customers found with the <s-text variant="bodyStrong">warrantyregistered</s-text> tag.
                      {searchTerm && " Try adjusting your search criteria."}
                    </s-text>
                  </s-stack>
                </s-banner>
              </s-card-section>
            ) : (
              <>
                <s-card-section>
                  <s-stack vertical spacing="loose">
                    {filteredCustomers.map((customer) => (
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
                    totalPages={totalPages}
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