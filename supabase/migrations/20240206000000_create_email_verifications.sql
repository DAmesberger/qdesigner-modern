-- Create email verifications table for handling email verification flow
CREATE TABLE IF NOT EXISTS public.email_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    token varchar(6) NOT NULL,
    is_test_mode boolean DEFAULT false,
    attempts integer DEFAULT 0,
    expires_at timestamptz DEFAULT (now() + interval '10 minutes'),
    verified_at timestamptz,
    request_ip inet,
    verified_ip inet,
    created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_email_verifications_email ON public.email_verifications(email);
CREATE INDEX idx_email_verifications_token ON public.email_verifications(email, token);
CREATE INDEX idx_email_verifications_expires ON public.email_verifications(expires_at);

-- Enable RLS
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_verifications
-- Anyone can insert (for signup flow)
CREATE POLICY "Anyone can create email verification" ON public.email_verifications
    FOR INSERT WITH CHECK (true);

-- Users can view their own verifications
CREATE POLICY "Users can view own email verifications" ON public.email_verifications
    FOR SELECT USING (
        email = current_setting('request.jwt.claims', true)::json->>'email'
        OR user_id = auth.uid()
    );

-- Users can update their own verifications
CREATE POLICY "Users can update own email verifications" ON public.email_verifications
    FOR UPDATE USING (
        email = current_setting('request.jwt.claims', true)::json->>'email'
        OR user_id = auth.uid()
    );

-- Add email verification fields to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Create function to increment attempts
CREATE OR REPLACE FUNCTION increment_attempts()
RETURNS integer AS $$
BEGIN
    RETURN COALESCE(attempts, 0) + 1;
END;
$$ LANGUAGE plpgsql;