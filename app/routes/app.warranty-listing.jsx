import { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const query = `#graphql
    query GetCustomersWithWarranties($cursor: String) {
      customers(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            displayName
            defaultEmailAddress {
              emailAddress
            }
            defaultPhoneNumber {
              phoneNumber
            }
            createdAt
            defaultAddress {
              address1
              city
              country
              zip
            }
            metafield(namespace: "custom", key: "warranty_activation_details") {
              value
              references(first: 10) {
                edges {
                  node {
                    ... on Metaobject {
                      id
                      fields {
                        key
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    let allCustomers = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const response = await admin.graphql(query, {
        variables: { cursor },
      });

      const responseJson = await response.json();

      if (!responseJson.data || !responseJson.data.customers) {
        break;
      }

      const customersData = responseJson.data.customers;

      const customersWithWarranties = customersData.edges
        .filter((edge) => {
          const m = edge.node.metafield;
          return (
            m &&
            m.value &&
            m.references &&
            m.references.edges &&
            m.references.edges.length > 0
          );
        })
        .map((edge) => {
          const customer = edge.node;
          let warranties = [];

          if (customer.metafield?.references) {
            warranties = customer.metafield.references.edges.map((refEdge) => {
              const warranty = refEdge.node;
              const warrantyData = {};

              warranty.fields.forEach((field) => {
                warrantyData[field.key] = field.value;
              });

              return {
                id: warranty.id,
                ...warrantyData,
              };
            });
          }

          return {
            id: customer.id,
            displayName: customer.displayName,
            email: customer.defaultEmailAddress?.emailAddress || null,
            phone: customer.defaultPhoneNumber?.phoneNumber || null,
            createdAt: customer.createdAt,
            address: customer.defaultAddress,
            warranties,
          };
        });

      allCustomers = [...allCustomers, ...customersWithWarranties];

      hasNextPage = customersData.pageInfo.hasNextPage;
      cursor = customersData.pageInfo.endCursor;
    }

    return { customers: allCustomers };
  } catch (error) {
    console.error("Error fetching customers:", error);
    return { customers: [], error: error.message };
  }
};

export default function WarrantyListing() {
  const loaderData = useLoaderData();
  const initialCustomers = loaderData?.customers || [];
  const initialError = loaderData?.error || null;

  const [customers, setCustomers] = useState(initialCustomers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const shopify = useAppBridge();

  useEffect(() => {
    setCustomers(initialCustomers);
    setError(initialError);
  }, [initialCustomers, initialError]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(window.location.pathname, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await response.json();

      if (response.ok && data && Array.isArray(data.customers)) {
        setCustomers(data.customers);
        if (shopify?.toast) {
          shopify.toast.show(
            `Loaded ${data.customers.length} customers with warranties`,
          );
        }
      } else {
        const message =
          (data && data.error) || "Failed to load customers from server";
        setError(message);
        if (shopify?.toast) {
          shopify.toast.show(message, { error: true });
        }
      }
    } catch (err) {
      console.error("Error refreshing customers:", err);
      const message = "Failed to refresh customers";
      setError(message);
      if (shopify?.toast) {
        shopify.toast.show(message, { error: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const rawTerm =
      typeof searchTerm === "string"
        ? searchTerm
        : searchTerm?.toString() ?? "";
    const term = rawTerm.toLowerCase().trim();

    if (!term) return true;

    const name = (customer.displayName || "").toString().toLowerCase();
    const email = (customer.email || "").toString().toLowerCase();
    const phone = (customer.phone || "").toString();

    return (
      name.includes(term) ||
      email.includes(term) ||
      phone.includes(rawTerm)
    );
  });

  const getStatusBadge = (status) => {
    const statusColors = {
      Pending: "warning",
      Approved: "success",
      Rejected: "critical",
      Expired: "critical",
    };

    const color = statusColors[status] || "info";

    return <s-badge tone={color}>{status}</s-badge>;
  };

  return (
    <s-page title="Warranty Management">
      <s-action-group slot="primary-action">
        <s-button
          onClick={fetchCustomers}
          loading={loading}
          variant="primary"
        >
          Refresh
        </s-button>
      </s-action-group>

      <s-layout>
        <s-layout-section>
          <s-card>
            <s-text-container>
              <s-text variant="headingSm" as="h2">
                Customers with Active Warranties
              </s-text>
              <s-text variant="bodyMd" as="p" tone="subdued">
                Manage and view all customer warranty registrations
              </s-text>
            </s-text-container>

            <s-divider />

            <s-search-field
              placeholder="Search by name, email, or phone"
              value={searchTerm}
              onChange={(value) => {
                if (typeof value === "string") {
                  setSearchTerm(value);
                } else if (
                  value &&
                  typeof value.target?.value === "string"
                ) {
                  setSearchTerm(value.target.value);
                } else if (
                  value &&
                  typeof value.detail?.value === "string"
                ) {
                  setSearchTerm(value.detail.value);
                } else {
                  setSearchTerm("");
                }
              }}
              clearable
            />

            <s-divider />

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <s-spinner accessibilityLabel="Loading customers" />
              </div>
            ) : error ? (
              <s-banner tone="critical">
                <s-text-container>
                  <s-text variant="headingSm">Error loading data</s-text>
                  <s-text variant="bodyMd">{error}</s-text>
                </s-text-container>
              </s-banner>
            ) : filteredCustomers.length === 0 ? (
              <s-empty-state>
                <s-text-container>
                  <s-text variant="headingMd">No warranties found</s-text>
                  <s-text variant="bodyMd">
                    {searchTerm
                      ? "No customers match your search criteria."
                      : "No customers have registered warranties yet."}
                  </s-text>
                </s-text-container>
              </s-empty-state>
            ) : (
              <s-data-table
                headings={[
                  { content: "Customer" },
                  { content: "Contact" },
                  { content: "Warranties" },
                  { content: "Registered Date" },
                  { content: "Actions" },
                ]}
                rows={filteredCustomers.map((customer) => [
                  <div>
                    <s-text variant="bodyMd" fontWeight="bold">
                      {customer.displayName}
                    </s-text>
                    {customer.address && (
                      <s-text variant="bodySm" tone="subdued">
                        {customer.address.address1}, {customer.address.city}
                      </s-text>
                    )}
                  </div>,
                  <div>
                    <s-text variant="bodyMd">
                      {customer.email || "No email"}
                    </s-text>
                    <s-text variant="bodySm" tone="subdued">
                      {customer.phone || "No phone"}
                    </s-text>
                  </div>,
                  <s-stack direction="inline" gap="tight">
                    <s-badge tone="info">
                      {customer.warranties.length} warranty(s)
                    </s-badge>
                    {customer.warranties.some(
                      (w) => w.status === "Pending",
                    ) && <s-badge tone="warning">Pending Review</s-badge>}
                  </s-stack>,
                  new Date(customer.createdAt).toLocaleDateString(),
                  <s-button
                    size="slim"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    View Details
                  </s-button>,
                ])}
              />
            )}
          </s-card>
        </s-layout-section>
      </s-layout>

      {selectedCustomer && (
        <s-modal
          open={true}
          onClose={() => setSelectedCustomer(null)}
          title={`Warranty Details - ${selectedCustomer.displayName}`}
          primaryAction={{
            content: "Close",
            onAction: () => setSelectedCustomer(null),
          }}
        >
          <s-modal-section>
            <s-text-container>
              <s-text variant="headingSm">Customer Information</s-text>
              <s-layout>
                <s-layout-section>
                  <s-box padding="base">
                    <s-text variant="bodyMd">
                      <strong>Name:</strong> {selectedCustomer.displayName}
                      <br />
                      <strong>Email:</strong>{" "}
                      {selectedCustomer.email || "Not provided"}
                      <br />
                      <strong>Phone:</strong>{" "}
                      {selectedCustomer.phone || "Not provided"}
                      <br />
                      <strong>Registered:</strong>{" "}
                      {new Date(
                        selectedCustomer.createdAt,
                      ).toLocaleString()}
                    </s-text>
                  </s-box>
                </s-layout-section>

                {selectedCustomer.address && (
                  <s-layout-section>
                    <s-box padding="base">
                      <s-text variant="bodyMd">
                        <strong>Address:</strong>
                        <br />
                        {selectedCustomer.address.address1}
                        <br />
                        {selectedCustomer.address.city}
                        <br />
                        {selectedCustomer.address.country}
                        <br />
                        {selectedCustomer.address.zip}
                      </s-text>
                    </s-box>
                  </s-layout-section>
                )}
              </s-layout>

              <s-divider />

              <s-text variant="headingSm">Warranty Registrations</s-text>
              {selectedCustomer.warranties.map((warranty, index) => (
                <s-card key={index} padding="base">
                  <s-stack distribution="equalSpacing">
                    <s-text variant="bodyMd" fontWeight="bold">
                      {warranty.product_name || "Product Warranty"}
                    </s-text>
                    {getStatusBadge(warranty.status || "Pending")}
                  </s-stack>

                  <s-divider />

                  <s-layout>
                    <s-layout-section>
                      <s-text variant="bodyMd">
                        <strong>Product:</strong>{" "}
                        {warranty.product_name || "N/A"}
                        <br />
                        <strong>Serial Number:</strong>{" "}
                        {warranty.product_serial_number || "N/A"}
                        <br />
                        <strong>Order Number:</strong>{" "}
                        {warranty.product_order_invoice_number || "N/A"}
                      </s-text>
                    </s-layout-section>
                    <s-layout-section>
                      <s-text variant="bodyMd">
                        <strong>Purchase Source:</strong>{" "}
                        {warranty.product_purchase_source || "N/A"}
                        <br />
                        <strong>Purchase Date:</strong>{" "}
                        {warranty.product_purchase_date || "N/A"}
                        <br />
                        <strong>Warranty ID:</strong>{" "}
                        {warranty.id?.split("/").pop() || "N/A"}
                      </s-text>
                    </s-layout-section>
                  </s-layout>
                </s-card>
              ))}
            </s-text-container>
          </s-modal-section>
        </s-modal>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};