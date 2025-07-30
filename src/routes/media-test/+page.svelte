<script lang="ts">
  import { onMount } from 'svelte';
  import { mediaService } from '$lib/services/mediaService';
  import { supabase } from '$lib/services/supabase';
  
  let uploadStatus = '';
  let logs: string[] = [];
  let userInfo: any = null;
  let organizationId = '';
  let userId = '';
  let fileInput: HTMLInputElement;
  
  onMount(async () => {
    // Check auth status
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      addLog('No session found. Please login first.');
      return;
    }
    
    addLog(`Auth user ID: ${session.user.id}`);
    
    // Get public user
    const { data: publicUser, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('auth_id', session.user.id)
      .single();
      
    if (userError) {
      addLog(`Error getting public user: ${JSON.stringify(userError)}`);
      return;
    }
    
    userId = publicUser.id;
    addLog(`Public user ID: ${userId}`);
    
    // Double-check the user exists
    const { data: userCheck, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
      
    if (checkError || !userCheck) {
      addLog(`ERROR: User ID ${userId} not found in users table!`);
      addLog(`Check error: ${JSON.stringify(checkError)}`);
    } else {
      addLog(`User ID ${userId} confirmed in users table`);
    }
    
    // Get organization
    const { data: orgMember, error: orgError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .single();
      
    if (orgError) {
      addLog(`Error getting organization: ${JSON.stringify(orgError)}`);
      return;
    }
    
    organizationId = orgMember.organization_id;
    addLog(`Organization ID: ${organizationId}`);
    
    userInfo = {
      authId: session.user.id,
      publicId: userId,
      organizationId
    };
    
    // Test bucket access
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      addLog(`Available buckets: ${buckets?.map(b => b.name).join(', ') || 'none visible'}`);
    } catch (err) {
      addLog(`Cannot list buckets: ${err}`);
    }
  });
  
  function addLog(message: string) {
    logs = [...logs, `[${new Date().toISOString()}] ${message}`];
  }
  
  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !userInfo) return;
    
    const file = input.files[0];
    addLog(`Selected file: ${file.name} (${file.type}, ${file.size} bytes)`);
    
    try {
      uploadStatus = 'Uploading...';
      
      addLog(`Uploading with params: organizationId=${userInfo.organizationId}, userId=${userInfo.publicId}`);
      
      const asset = await mediaService.uploadMedia(
        file,
        {
          organizationId: userInfo.organizationId,
          userId: userInfo.publicId,
          accessLevel: 'organization'
        }
      );
      
      uploadStatus = 'Upload successful!';
      addLog(`Upload successful! Asset ID: ${asset.id}`);
      addLog(`Asset details: ${JSON.stringify(asset)}`);
      
    } catch (error) {
      uploadStatus = 'Upload failed';
      addLog(`Upload error: ${error}`);
      console.error('Full error:', error);
    }
  }
</script>

<div class="p-8 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-4">Media Upload Test Page</h1>
  
  {#if userInfo}
    <div class="mb-4 p-4 bg-gray-100 rounded">
      <h2 class="font-semibold mb-2">User Info:</h2>
      <p>Auth ID: {userInfo.authId}</p>
      <p>Public ID: {userInfo.publicId}</p>
      <p>Organization ID: {userInfo.organizationId}</p>
    </div>
    
    <div class="mb-4">
      <label class="block mb-2">
        Select a file to upload:
        <input
          type="file"
          bind:this={fileInput}
          on:change={handleFileSelect}
          accept="image/*,video/*,audio/*"
          class="block w-full mt-1 p-2 border rounded"
        />
      </label>
      
      {#if uploadStatus}
        <p class="mt-2 font-semibold">{uploadStatus}</p>
      {/if}
    </div>
  {:else}
    <p>Loading user information...</p>
  {/if}
  
  <div class="mt-8">
    <h2 class="text-xl font-semibold mb-2">Debug Logs:</h2>
    <div class="bg-black text-green-400 p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
      {#each logs as log}
        <div>{log}</div>
      {/each}
    </div>
  </div>
</div>