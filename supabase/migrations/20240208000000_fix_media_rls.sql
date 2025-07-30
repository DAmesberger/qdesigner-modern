-- Fix media assets RLS policies to use public user ID correctly

-- Drop existing policies
DROP POLICY IF EXISTS "media_assets_select_policy" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_insert_policy" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_update_policy" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_delete_policy" ON public.media_assets;

-- Create new policies that properly handle the auth to public user mapping
CREATE POLICY "media_assets_select_policy" ON public.media_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "media_assets_insert_policy" ON public.media_assets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
        AND uploaded_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "media_assets_update_policy" ON public.media_assets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "media_assets_delete_policy" ON public.media_assets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin')
        )
        OR uploaded_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Fix storage policies
DROP POLICY IF EXISTS "media_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_delete" ON storage.objects;

-- Storage policies for media bucket
CREATE POLICY "media_bucket_select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND ma.storage_path = storage.objects.name
        )
    );

CREATE POLICY "media_bucket_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "media_bucket_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
            AND ma.storage_path = storage.objects.name
        )
    );

CREATE POLICY "media_bucket_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND (om.role IN ('owner', 'admin') OR ma.uploaded_by = u.id)
            AND ma.storage_path = storage.objects.name
        )
    );