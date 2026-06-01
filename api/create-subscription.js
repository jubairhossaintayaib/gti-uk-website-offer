const Stripe = require('stripe');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const PRICE_ID = 'price_1TdUedQocTcyd7OUEEZkFXHY';

  const { paymentMethodId, name, email } = req.body;

  if (!paymentMethodId || !email || !name) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    let customer;

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      // Attach new payment method
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    } else {
      // Create new customer
      customer = await stripe.customers.create({
        name,
        email,
        payment_method: paymentMethodId,
      });
    }

    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_ID }],
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice;
    const paymentIntent = invoice.payment_intent;

    // Payment succeeded immediately
    if (paymentIntent.status === 'succeeded') {
      return res.status(200).json({ success: true });
    }

    // Needs 3D Secure confirmation
    if (paymentIntent.status === 'requires_action' ||
        paymentIntent.status === 'requires_payment_method') {
      return res.status(200).json({
        clientSecret: paymentIntent.client_secret,
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(400).json({ error: err.message });
  }
};
