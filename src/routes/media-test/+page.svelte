<script lang="ts">
  import { onMount } from 'svelte';
  import { mediaService } from '$lib/services/mediaService';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';

  let uploadStatus = '';
  let logs: string[] = [];
  let userInfo: any = null;
  let organizationId = '';
  let userId = '';
  let fileInput: HTMLInputElement;

  onMount(async () => {
    // Check auth status
    const user = await auth.getUser();
    if (!user) {
      addLog('No session found. Please login first.');
      return;
    }

    userId = user.id;
    addLog(`User ID: ${userId}`);

    // Get organization
    try {
      const orgs = await api.organizations.list();
      const firstOrg = orgs[0];
      if (firstOrg) {
        organizationId = firstOrg.id;
        addLog(`Organization ID: ${organizationId}`);
      } else {
        addLog('No organizations found');
        return;
      }
    } catch (err) {
      addLog(`Error getting organization: ${err}`);
      return;
    }

    userInfo = {
      publicId: userId,
      organizationId,
    };
  });

  function addLog(message: string) {
    logs = [...logs, `[${new Date().toISOString()}] ${message}`];
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !userInfo) return;

    const file = input.files[0];
    if (!file) return;

    addLog(`Selected file: ${file.name} (${file.type}, ${file.size} bytes)`);

    try {
      uploadStatus = 'Uploading...';

      addLog(
        `Uploading with params: organizationId=${userInfo.organizationId}, userId=${userInfo.publicId}`
      );

      const asset = await mediaService.uploadMedia(file, {
        organizationId: userInfo.organizationId,
        userId: userInfo.publicId,
        accessLevel: 'organization',
      });

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
    <div class="mb-4 p-4 bg-muted rounded">
      <h2 class="font-semibold mb-2">User Info:</h2>
      <p>User ID: {userInfo.publicId}</p>
      <p>Organization ID: {userInfo.organizationId}</p>
    </div>

    <div class="mb-4">
      <label class="block mb-2">
        Select a file to upload:
        <input
          type="file"
          bind:this={fileInput}
          onchange={handleFileSelect}
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
    <div class="bg-black text-success p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
      {#each logs as log}
        <div>{log}</div>
      {/each}
    </div>
  </div>
</div>
