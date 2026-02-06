export default function Warranty() {
  return (
    <s-page heading="Warranty Activation">
      <s-section>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '1rem',
          }}
        >
          <p>View, manage, and process all customer warranty activation requests submitted through the warranty activation form.</p>

          <s-button
            href="https://admin.shopify.com/store/mobiteluk/content/metaobjects/entries/warranty_activation_details"
           
            variant="primary"
          >
            View All Warranty Activation Requests
          </s-button>
        </div>
      </s-section>
    </s-page>
  );
}