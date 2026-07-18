-- Stripe Schema Additions for Profiles Table
-- Assuming you have a 'profiles' table that maps to auth.users (id uuid primary key)

-- Add Stripe Customer ID to link Stripe customers to Supabase users
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

-- Add Stripe Subscription ID
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE;

-- Add Subscription Status (e.g., active, past_due, canceled, unpaid)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text;

-- (Optional) If you want to track credits
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS motion_credits integer DEFAULT 0;

-- (Optional) Add a constraint if you only want certain statuses
-- ALTER TABLE profiles ADD CONSTRAINT valid_subscription_status CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing'));
