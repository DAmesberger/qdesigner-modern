import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/services/supabase';
import { generateUUID } from '$lib/utils/uuid';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { name, code, description, organizationId } = await request.json();
    
    // Validate required fields
    if (!name || !code || !organizationId) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Get the user from locals (set by hooks)
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the public user ID
    const { data: publicUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', session.user.id)
      .single();
      
    if (!publicUser) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    // Create the project
    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        id: generateUUID(),
        organization_id: organizationId,
        name,
        code: code.toUpperCase(),
        description,
        created_by: publicUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error creating project:', error);
      return json({ error: 'Failed to create project' }, { status: 500 });
    }
    
    return json(project);
  } catch (error) {
    console.error('Error in POST /api/projects:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};