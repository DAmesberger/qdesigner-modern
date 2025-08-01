-- Drop existing storage policies to recreate them
DROP POLICY IF EXISTS "media_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_delete" ON storage.objects;

-- Create more permissive storage policies that work with the application flow

-- Allow authenticated users to view objects in the media bucket if:
-- 1. They are a member of any organization (more permissive for listing)
-- 2. The specific file has a corresponding media_asset they can access
CREATE POLICY "media_bucket_select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL AND
        (
            -- Allow viewing if user is a member of any organization
            EXISTS (
                SELECT 1 FROM organization_members om
                JOIN users u ON u.id = om.user_id
                WHERE u.auth_id = auth.uid()
            )
            OR
            -- Or if they have specific access to this media asset
            EXISTS (
                SELECT 1 FROM media_assets ma
                JOIN organization_members om ON om.organization_id = ma.organization_id
                JOIN users u ON u.id = om.user_id
                WHERE u.auth_id = auth.uid()
                AND ma.storage_path = storage.objects.name
            )
        )
    );

-- Allow authenticated users to upload if they have editor role or higher in any organization
CREATE POLICY "media_bucket_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

-- Allow authenticated users to update objects they have access to through their organization
CREATE POLICY "media_bucket_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
            AND ma.storage_path = storage.objects.name
        )
    );

-- Allow authenticated users to delete objects they own or have admin access to
CREATE POLICY "media_bucket_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND (om.role IN ('owner', 'admin') OR ma.uploaded_by = u.id)
            AND ma.storage_path = storage.objects.name
        )
    );

-- Also ensure service role can always access storage
-- This is important for server-side operations
CREATE POLICY "service_role_all" ON storage.objects
    FOR ALL USING (
        auth.role() = 'service_role'
    );