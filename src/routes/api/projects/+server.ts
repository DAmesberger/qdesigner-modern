import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/services/supabase';
import { generateUUID } from '$lib/utils/uuid';
import { handleAPIError } from '$lib/utils/errorHandler';

export const GET: RequestHandler = async ({ locals, url }) => {
  try {
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
    
    // Get user's organizations
    const { data: orgMembers } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', publicUser.id)
      .eq('status', 'active');
      
    const orgIds = orgMembers?.map(om => om.organization_id) || [];
    
    // Get projects
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        organization:organizations(name, slug),
        _count:questionnaire_definitions(count)
      `)
      .in('organization_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return json(projects || []);
  } catch (error) {
    const apiError = handleAPIError(error);
    return json({ error: apiError.message }, { status: apiError.status || 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const data = await request.json();
    
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
    
    // Verify user has access to the organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', data.organization_id)
      .eq('user_id', publicUser.id)
      .eq('status', 'active')
      .single();
      
    if (!membership) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Only owners and admins can create projects
    if (!['owner', 'admin', 'member'].includes(membership.role)) {
      return json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Create the project
    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        id: generateUUID(),
        organization_id: data.organization_id,
        name: data.name,
        code: data.code?.toUpperCase() || data.name.slice(0, 10).toUpperCase().replace(/\s+/g, '-'),
        description: data.description,
        is_public: data.is_public || false,
        max_participants: data.max_participants,
        irb_number: data.irb_number,
        start_date: data.start_date,
        end_date: data.end_date,
        created_by: publicUser.id
      })
      .select()
      .single();
      
    if (error) throw error;
    
    // Add creator as project owner
    await supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: publicUser.id,
        role: 'owner'
      });
    
    return json(project);
  } catch (error) {
    const apiError = handleAPIError(error);
    return json({ error: apiError.message }, { status: apiError.status || 500 });
  }
};