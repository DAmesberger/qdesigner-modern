-- Storage policies for questionnaire-media bucket
-- Allow authenticated users to upload files to their organization's folder
CREATE POLICY "Users can upload media to their organization folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'questionnaire-media' AND
  (string_to_array(name, '/'))[1] IN (
    SELECT om.organization_id::text 
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_id = auth.uid()
    AND om.status = 'active'
  )
);

-- Allow authenticated users to view files from their organization
CREATE POLICY "Users can view their organization media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'questionnaire-media' AND
  (string_to_array(name, '/'))[1] IN (
    SELECT om.organization_id::text 
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_id = auth.uid()
    AND om.status = 'active'
  )
);

-- Allow authenticated users to update their organization's files
CREATE POLICY "Users can update their organization media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'questionnaire-media' AND
  (string_to_array(name, '/'))[1] IN (
    SELECT om.organization_id::text 
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_id = auth.uid()
    AND om.status = 'active'
  )
);

-- Allow authenticated users to delete their organization's files
CREATE POLICY "Users can delete their organization media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'questionnaire-media' AND
  (string_to_array(name, '/'))[1] IN (
    SELECT om.organization_id::text 
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_id = auth.uid()
    AND om.status = 'active'
  )
);

-- Public bucket policies (anyone can read)
CREATE POLICY "Anyone can view public media"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'public-media');

-- Only authenticated users can manage public media
CREATE POLICY "Authenticated users can upload public media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public-media');

CREATE POLICY "Authenticated users can update public media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'public-media');

CREATE POLICY "Authenticated users can delete public media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'public-media');