<script lang="ts">
  import Skeleton from '../Skeleton.svelte';
  
  export let count = 3;
</script>

<div class="space-y-4">
  {#each Array(count) as _, i}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <!-- Title -->
          <Skeleton width="60%" height={24} className="mb-2" />
          
          <!-- Description -->
          <Skeleton width="90%" height={16} className="mb-1" />
          <Skeleton width="75%" height={16} className="mb-4" />
          
          <!-- Meta info -->
          <div class="flex items-center gap-4">
            <Skeleton width={100} height={20} variant="rounded" />
            <Skeleton width={120} height={20} variant="rounded" />
            <Skeleton width={80} height={20} variant="rounded" />
          </div>
        </div>
        
        <!-- Actions -->
        <div class="flex gap-2">
          <Skeleton width={32} height={32} variant="rounded" />
          <Skeleton width={32} height={32} variant="rounded" />
        </div>
      </div>
    </div>
  {/each}
</div>