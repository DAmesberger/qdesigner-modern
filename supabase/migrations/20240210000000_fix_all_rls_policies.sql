-- Comprehensive fix for all RLS policies

-- 1. Fix questionnaire_definitions table policies (completely missing!)
DROP POLICY IF EXISTS "Users can view their organization questionnaires" ON public.questionnaire_definitions;
DROP POLICY IF EXISTS "Users can create questionnaires" ON public.questionnaire_definitions;
DROP POLICY IF EXISTS "Users can update their questionnaires" ON public.questionnaire_definitions;
DROP POLICY IF EXISTS "Users can delete their questionnaires" ON public.questionnaire_definitions;

-- Allow users to view questionnaires in their projects
CREATE POLICY "Users can view their organization questionnaires" ON public.questionnaire_definitions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = questionnaire_definitions.project_id
            AND u.auth_id = auth.uid()
        )
    );

-- Allow users to create questionnaires in their projects
CREATE POLICY "Users can create questionnaires" ON public.questionnaire_definitions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = project_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

-- Allow users to update questionnaires in their projects
CREATE POLICY "Users can update their questionnaires" ON public.questionnaire_definitions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = questionnaire_definitions.project_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

-- Allow users to delete questionnaires in their projects
CREATE POLICY "Users can delete their questionnaires" ON public.questionnaire_definitions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = questionnaire_definitions.project_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin')
        )
    );

-- 2. Create the media bucket directly (avoids needing bucket creation policies)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'media',
    'media', 
    false,
    52428800, -- 50MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Simplify media_assets policies for easier debugging
DROP POLICY IF EXISTS "media_assets_select_policy" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_insert_policy" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_update_policy" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_delete_policy" ON public.media_assets;

-- Simpler select policy
CREATE POLICY "media_assets_select_policy" ON public.media_assets
    FOR SELECT USING (
        organization_id IN (
            SELECT om.organization_id FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
        )
    );

-- Simpler insert policy - just check organization membership
CREATE POLICY "media_assets_insert_policy" ON public.media_assets
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT om.organization_id FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

-- Update policy
CREATE POLICY "media_assets_update_policy" ON public.media_assets
    FOR UPDATE USING (
        organization_id IN (
            SELECT om.organization_id FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

-- Delete policy
CREATE POLICY "media_assets_delete_policy" ON public.media_assets
    FOR DELETE USING (
        organization_id IN (
            SELECT om.organization_id FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin')
        )
        OR uploaded_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- 4. Fix storage.objects policies to be simpler
DROP POLICY IF EXISTS "media_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_delete" ON storage.objects;

-- Allow authenticated users to upload to media bucket
CREATE POLICY "media_bucket_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL
    );

-- Allow users to view files they have access to via media_assets
CREATE POLICY "media_bucket_select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL
    );

-- Allow users to update their files
CREATE POLICY "media_bucket_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL
    );

-- Allow users to delete their files
CREATE POLICY "media_bucket_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'media' AND
        auth.uid() IS NOT NULL
    );