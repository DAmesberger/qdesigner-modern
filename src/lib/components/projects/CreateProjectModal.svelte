<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { goto } from '$app/navigation';
  import Dialog from '../ui/overlays/Dialog.svelte';
  import Button from '../common/Button.svelte';
  import LoadingButton from '../common/LoadingButton.svelte';
  import { toast } from '$lib/stores/toast';
  import { handleAPIError } from '$lib/utils/errorHandler';
  
  export let open = false;
  export let organizationId: string;
  
  const dispatch = createEventDispatcher();
  
  let loading = false;
  let formData = {
    name: '',
    description: '',
    code: '',
    isPublic: false,
    maxParticipants: null as number | null,
    irbNumber: '',
    startDate: '',
    endDate: ''
  };
  
  let errors: Record<string, string> = {};
  
  function validateForm() {
    errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Project name is required';
    }
    
    if (formData.name.length < 3) {
      errors.name = 'Project name must be at least 3 characters';
    }
    
    if (formData.code && !/^[a-zA-Z0-9-_]+$/.test(formData.code)) {
      errors.code = 'Code can only contain letters, numbers, hyphens, and underscores';
    }
    
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (end < start) {
        errors.endDate = 'End date must be after start date';
      }
    }
    
    return Object.keys(errors).length === 0;
  }
  
  async function handleSubmit() {
    if (!validateForm()) return;
    
    loading = true;
    
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          organization_id: organizationId,
          max_participants: formData.maxParticipants || undefined,
          is_public: formData.isPublic,
          irb_number: formData.irbNumber || undefined,
          start_date: formData.startDate || undefined,
          end_date: formData.endDate || undefined
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      
      const project = await response.json();
      
      toast.success('Project created successfully!');
      dispatch('created', project);
      
      // Navigate to the new project
      goto(`/projects/${project.id}`);
      
      // Reset form
      resetForm();
      open = false;
    } catch (error) {
      const apiError = handleAPIError(error);
      toast.error(apiError.details || apiError.message);
    } finally {
      loading = false;
    }
  }
  
  function resetForm() {
    formData = {
      name: '',
      description: '',
      code: '',
      isPublic: false,
      maxParticipants: null,
      irbNumber: '',
      startDate: '',
      endDate: ''
    };
    errors = {};
  }
  
  function handleClose() {
    if (!loading) {
      open = false;
      resetForm();
      dispatch('close');
    }
  }
  
  // Generate project code from name
  $: if (formData.name && !formData.code) {
    formData.code = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20);
  }
</script>

<Dialog 
  bind:open 
  title="Create New Project"
  description="Start a new research project to organize your questionnaires and data collection."
  size="lg"
  on:close={handleClose}
>
  <form on:submit|preventDefault={handleSubmit} class="space-y-6">
    <div>
      <label for="name" class="block text-sm font-medium text-foreground">
        Project Name <span class="text-destructive">*</span>
      </label>
      <input
        type="text"
        id="name"
        bind:value={formData.name}
        disabled={loading}
        class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
               placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring
               disabled:cursor-not-allowed disabled:opacity-50
               {errors.name ? 'border-destructive focus:ring-destructive' : ''}"
        placeholder="My Research Project"
      />
      {#if errors.name}
        <p class="mt-1 text-sm text-destructive">{errors.name}</p>
      {/if}
    </div>
    
    <div>
      <label for="description" class="block text-sm font-medium text-foreground">
        Description
      </label>
      <textarea
        id="description"
        bind:value={formData.description}
        disabled={loading}
        rows={3}
        class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
               placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring
               disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="Brief description of your research project..."
      ></textarea>
    </div>
    
    <div>
      <label for="code" class="block text-sm font-medium text-foreground">
        Project Code
      </label>
      <input
        type="text"
        id="code"
        bind:value={formData.code}
        disabled={loading}
        class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
               placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring
               disabled:cursor-not-allowed disabled:opacity-50
               {errors.code ? 'border-destructive focus:ring-destructive' : ''}"
        placeholder="my-project"
      />
      {#if errors.code}
        <p class="mt-1 text-sm text-destructive">{errors.code}</p>
      {:else}
        <p class="mt-1 text-sm text-muted-foreground">
          Short identifier for URLs and participant access
        </p>
      {/if}
    </div>
    
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="startDate" class="block text-sm font-medium text-foreground">
          Start Date
        </label>
        <input
          type="date"
          id="startDate"
          bind:value={formData.startDate}
          disabled={loading}
          class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
                 focus:outline-none focus:ring-1 focus:ring-ring
                 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      
      <div>
        <label for="endDate" class="block text-sm font-medium text-foreground">
          End Date
        </label>
        <input
          type="date"
          id="endDate"
          bind:value={formData.endDate}
          disabled={loading}
          class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
                 focus:outline-none focus:ring-1 focus:ring-ring
                 disabled:cursor-not-allowed disabled:opacity-50
                 {errors.endDate ? 'border-destructive focus:ring-destructive' : ''}"
        />
        {#if errors.endDate}
          <p class="mt-1 text-sm text-destructive">{errors.endDate}</p>
        {/if}
      </div>
    </div>
    
    <div>
      <label for="maxParticipants" class="block text-sm font-medium text-foreground">
        Maximum Participants
      </label>
      <input
        type="number"
        id="maxParticipants"
        bind:value={formData.maxParticipants}
        disabled={loading}
        min="1"
        class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
               focus:outline-none focus:ring-1 focus:ring-ring
               disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="No limit"
      />
      <p class="mt-1 text-sm text-muted-foreground">
        Leave empty for unlimited participants
      </p>
    </div>
    
    <div>
      <label for="irbNumber" class="block text-sm font-medium text-foreground">
        IRB Number
      </label>
      <input
        type="text"
        id="irbNumber"
        bind:value={formData.irbNumber}
        disabled={loading}
        class="mt-1 block w-full rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors
               focus:outline-none focus:ring-1 focus:ring-ring
               disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="IRB-2024-001"
      />
      <p class="mt-1 text-sm text-muted-foreground">
        Institutional Review Board approval number
      </p>
    </div>
    
    <div class="flex items-center">
      <input
        type="checkbox"
        id="isPublic"
        bind:checked={formData.isPublic}
        disabled={loading}
        class="h-4 w-4 rounded border-input text-primary 
               focus:ring-ring focus:ring-offset-2"
      />
      <label for="isPublic" class="ml-2 block text-sm text-foreground">
        Make this project publicly accessible
      </label>
    </div>
  </form>
  
  {#snippet footer()}
    <Button
      variant="ghost"
      on:click={handleClose}
      disabled={loading}
    >
      Cancel
    </Button>
    
    <LoadingButton
      type="button"
      variant="primary"
      {loading}
      loadingText="Creating..."
      on:click={handleSubmit}
    >
      Create Project
    </LoadingButton>
  {/snippet}
</Dialog>