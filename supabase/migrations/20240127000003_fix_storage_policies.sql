-- Storage policies will be created after the application tables exist
-- For now, just create basic policies

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

-- Questionnaire media - basic policies for now
CREATE POLICY "Authenticated users can upload questionnaire media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'questionnaire-media');

CREATE POLICY "Authenticated users can view questionnaire media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'questionnaire-media');

CREATE POLICY "Authenticated users can update questionnaire media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'questionnaire-media');

CREATE POLICY "Authenticated users can delete questionnaire media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'questionnaire-media');