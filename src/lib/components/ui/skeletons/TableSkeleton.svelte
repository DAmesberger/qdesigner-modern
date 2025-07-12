<script lang="ts">
  import Skeleton from '../Skeleton.svelte';
  
  export let rows = 5;
  export let columns = 4;
  export let showHeader = true;
</script>

<div class="overflow-hidden">
  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
    {#if showHeader}
      <thead class="bg-gray-50 dark:bg-gray-800">
        <tr>
          {#each Array(columns) as _, i}
            <th class="px-6 py-3 text-left">
              <Skeleton 
                width={i === 0 ? '150px' : '100px'} 
                height={16} 
                animation="wave"
              />
            </th>
          {/each}
        </tr>
      </thead>
    {/if}
    
    <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
      {#each Array(rows) as _}
        <tr>
          {#each Array(columns) as _, i}
            <td class="px-6 py-4 whitespace-nowrap">
              <Skeleton 
                width={i === 0 ? '200px' : i === columns - 1 ? '80px' : '120px'} 
                height={20}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>