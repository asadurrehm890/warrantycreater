export default function Warranty() {
  return (
    <s-page heading="Warranty Activation">
      <s-section>
        <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '1rem', }}>
          <s-paragraph>
            View, manage, and process all customer warranty registrations submitted through the warranty activation form{' '}
            <s-link href="https://mobitel.uk/pages/warranty-activation">
              https://mobitel.uk/pages/warranty-activation
            </s-link>
          </s-paragraph>

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