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
          <p>
            View, manage, and process all customer warranty registrations submitted through the warranty activation form{' '}
            <s-link
              href="https://mobitel.uk/pages/warranty-activation"
              target="_self"
            >
              https://mobitel.uk/pages/warranty-activation
            </s-link>
          </p>

          <s-button
            href="https://admin.shopify.com/store/mobiteluk/content/metaobjects/entries/warranty_activation_details"
            target="_self"
            variant="primary"
          >
            View All Warranty Activation Requests
          </s-button>
        </div>
      </s-section>
    </s-page>
  );
}