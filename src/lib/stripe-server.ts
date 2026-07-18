import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  // https://github.com/stripe/stripe-node#configuration
  apiVersion: '2025-01-27.acacia' as any,
  appInfo: {
    name: 'Assemblyreel Stripe Integration',
    url: 'https://assemblyreel.io',
  },
});
