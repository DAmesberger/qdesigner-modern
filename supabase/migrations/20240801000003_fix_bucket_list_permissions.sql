-- Allow authenticated users to view storage buckets
-- This is needed for the media service to check if bucket exists
CREATE POLICY "authenticated_can_view_buckets" ON storage.buckets
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Also ensure the service role policy exists
CREATE POLICY IF NOT EXISTS "service_role_buckets_all" ON storage.buckets
    FOR ALL 
    USING (auth.role() = 'service_role');