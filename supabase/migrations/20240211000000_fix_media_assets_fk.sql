-- Fix media_assets foreign key to reference public.users instead of auth.users

-- Drop the existing foreign key constraint
ALTER TABLE public.media_assets 
DROP CONSTRAINT media_assets_uploaded_by_fkey;

-- Add new foreign key constraint referencing public.users
ALTER TABLE public.media_assets 
ADD CONSTRAINT media_assets_uploaded_by_fkey 
FOREIGN KEY (uploaded_by) 
REFERENCES public.users(id) 
ON DELETE CASCADE;