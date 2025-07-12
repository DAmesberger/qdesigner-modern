<script lang="ts">
  import PageHeader from '$lib/components/ui/layout/PageHeader.svelte';
  import Container from '$lib/components/ui/layout/Container.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/ui/data/Badge.svelte';
  import EmptyState from '$lib/components/common/EmptyState.svelte';
  
  // Mock data - replace with actual API calls
  const questionnaires = [
    {
      id: 1,
      title: 'Customer Satisfaction Survey',
      description: 'Help us improve our services by sharing your feedback about your recent experience.',
      estimatedTime: 5,
      questionCount: 12,
      category: 'Feedback',
      status: 'new'
    },
    {
      id: 2,
      title: 'Employee Wellness Check',
      description: 'Monthly wellness and satisfaction assessment to help us create a better workplace.',
      estimatedTime: 10,
      questionCount: 20,
      category: 'Internal',
      status: 'in_progress',
      progress: 35
    },
    {
      id: 3,
      title: 'Product Research Study',
      description: 'Share your thoughts on our latest product features and help shape the future.',
      estimatedTime: 15,
      questionCount: 25,
      category: 'Research',
      status: 'new'
    },
    {
      id: 4,
      title: 'User Experience Survey',
      description: 'Tell us about your experience using our platform and mobile applications.',
      estimatedTime: 7,
      questionCount: 15,
      category: 'UX',
      status: 'completed'
    }
  ];
  
  function getCategoryColor(category: string) {
    const colors: Record<string, string> = {
      'Feedback': 'blue',
      'Internal': 'purple',
      'Research': 'green',
      'UX': 'yellow'
    };
    return colors[category] || 'gray';
  }
</script>

<PageHeader 
  title="Available Questionnaires" 
  description="Select a questionnaire to participate in"
/>

<Container>
  <div class="py-8">
    <!-- Filter tabs -->
    <div class="mb-6 border-b border-gray-200">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button class="border-b-2 border-indigo-500 px-1 py-4 text-sm font-medium text-indigo-600">
          All questionnaires
        </button>
        <button class="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
          In progress
        </button>
        <button class="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
          Completed
        </button>
      </nav>
    </div>
    
    <!-- Questionnaire grid -->
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each questionnaires as questionnaire}
        <Card>
          <div class="p-6">
            <div class="flex items-start justify-between">
              <Badge variant={getCategoryColor(questionnaire.category)} size="sm">
                {questionnaire.category}
              </Badge>
              {#if questionnaire.status === 'completed'}
                <svg class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
              {/if}
            </div>
            
            <h3 class="mt-4 text-lg font-semibold text-gray-900">
              {questionnaire.title}
            </h3>
            
            <p class="mt-2 text-sm text-gray-600 line-clamp-2">
              {questionnaire.description}
            </p>
            
            <div class="mt-4 flex items-center text-sm text-gray-500">
              <svg class="mr-1.5 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
              </svg>
              ~{questionnaire.estimatedTime} minutes
              <span class="mx-2">•</span>
              {questionnaire.questionCount} questions
            </div>
            
            {#if questionnaire.status === 'in_progress' && questionnaire.progress}
              <div class="mt-4">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">Progress</span>
                  <span class="font-medium text-gray-900">{questionnaire.progress}%</span>
                </div>
                <div class="mt-1 w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-indigo-600 h-2 rounded-full" style="width: {questionnaire.progress}%"></div>
                </div>
              </div>
            {/if}
            
            <div class="mt-6">
              {#if questionnaire.status === 'completed'}
                <Button variant="secondary" size="sm" disabled class="w-full">
                  <svg class="-ml-0.5 mr-1.5 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                  </svg>
                  Completed
                </Button>
              {:else if questionnaire.status === 'in_progress'}
                <Button variant="primary" size="sm" class="w-full">
                  Continue
                </Button>
              {:else}
                <Button variant="primary" size="sm" class="w-full">
                  Start
                </Button>
              {/if}
            </div>
          </div>
        </Card>
      {/each}
    </div>
    
    <!-- Empty state -->
    {#if questionnaires.length === 0}
      <div class="mt-8">
        <EmptyState
          title="No questionnaires available"
          description="There are currently no questionnaires available for you to participate in."
        />
      </div>
    {/if}
  </div>
</Container>