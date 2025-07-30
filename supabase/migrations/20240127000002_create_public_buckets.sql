-- Create a public bucket for shared media that doesn't require authentication
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-media',
  'public-media',
  true, -- Public bucket for shared resources
  10485760, -- 10MB limit for public files
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
);