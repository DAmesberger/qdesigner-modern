<script lang="ts">
  import Skeleton from '../Skeleton.svelte';
</script>

<div class="h-full bg-gray-50 dark:bg-gray-900 p-8">
  <!-- Page header skeleton -->
  <div class="max-w-4xl mx-auto mb-8">
    <Skeleton width="200px" height={32} className="mb-4" />
    <Skeleton width="100%" height={1} className="bg-gray-300 dark:bg-gray-700" />
  </div>

  <!-- Question blocks skeleton -->
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Block 1 -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <Skeleton width="150px" height={20} className="mb-4" />
      
      <!-- Question -->
      <div class="space-y-4">
        <Skeleton width="80%" height={24} />
        
        <!-- Options -->
        <div class="space-y-2">
          {#each Array(4) as _}
            <div class="flex items-center gap-3">
              <Skeleton width={20} height={20} variant="circular" />
              <Skeleton width="60%" height={20} />
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Block 2 -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <Skeleton width="180px" height={20} className="mb-4" />
      
      <!-- Question -->
      <div class="space-y-4">
        <Skeleton width="70%" height={24} />
        
        <!-- Scale -->
        <div class="flex items-center justify-between">
          {#each Array(5) as _}
            <Skeleton width={40} height={40} variant="rounded" />
          {/each}
        </div>
        
        <div class="flex justify-between text-sm">
          <Skeleton width={80} height={16} />
          <Skeleton width={80} height={16} />
        </div>
      </div>
    </div>

    <!-- Block 3 -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <Skeleton width="120px" height={20} className="mb-4" />
      
      <!-- Text input -->
      <div class="space-y-4">
        <Skeleton width="75%" height={24} />
        <Skeleton width="100%" height={40} variant="rounded" />
      </div>
    </div>
  </div>

  <!-- Navigation skeleton -->
  <div class="max-w-4xl mx-auto mt-8 flex justify-between">
    <Skeleton width={100} height={40} variant="rounded" />
    <Skeleton width={100} height={40} variant="rounded" />
  </div>
</div>