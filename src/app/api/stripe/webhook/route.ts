import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe-server';
import { createClient } from '@supabase/supabase-js';

// We need a service role key to update user records from a webhook (no active session)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || 'placeholder', {
  auth: { autoRefreshToken: false, persistSession: false }
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') as string;

  let event;

  try {
    if (!signature || !webhookSecret) return new NextResponse('Webhook secret missing', { status: 400 });
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Payment is successful and the subscription is created.
        // Update user's profile with subscription active and grant credits.
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const supabaseUUID = session.metadata?.supabaseUUID;

        if (supabaseUUID) {
            await supabaseAdmin
            .from('profiles')
            .update({ 
                subscription_status: 'active',
                stripe_subscription_id: subscriptionId,
            })
            .eq('id', supabaseUUID);
            
            // NOTE: Here you would also grant credits based on the plan/price ID
            // For example, if session.amount_total === 1900, grant 27 credits.
        }
        break;
      }
      
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        
        await supabaseAdmin
            .from('profiles')
            .update({ subscription_status: status })
            .eq('stripe_customer_id', customerId);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse('Webhook processed successfully', { status: 200 });
}
