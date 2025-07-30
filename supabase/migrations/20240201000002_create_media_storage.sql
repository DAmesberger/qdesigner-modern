-- Create media storage bucket
INSERT INTO storage.buckets (id, name, public, avif_autodetection, allowed_mime_types, file_size_limit)
VALUES (
    'media',
    'media',
    false,
    false,
    ARRAY['image/*', 'video/*', 'audio/*']::text[],
    52428800 -- 50MB
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for media bucket
CREATE POLICY "media_bucket_select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            WHERE om.user_id = auth.uid()
            AND ma.storage_path = storage.objects.name
        )
    );

CREATE POLICY "media_bucket_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.user_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "media_bucket_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'media' AND
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN media_assets ma ON ma.organization_id = om.organization_id
            WHERE om.user_id = auth.uid()
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
            WHERE om.user_id = auth.uid()
            AND (om.role IN ('owner', 'admin') OR ma.uploaded_by = auth.uid())
            AND ma.storage_path = storage.objects.name
        )
    );