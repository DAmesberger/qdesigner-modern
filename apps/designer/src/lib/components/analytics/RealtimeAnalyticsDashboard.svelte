<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { analyticsStore, connectedStatus } from '$lib/analytics/stores';
  import type { RealtimeConfig } from '$lib/analytics/types';
  import DescriptiveStatsCard from './DescriptiveStatsCard.svelte';
  import { fade, slide } from 'svelte/transition';
  
  export let questionnaireId: string;
  export let questionIds: string[] = [];
  export let wsUrl: string = 'ws://localhost:3001/analytics';
  export let updateInterval: number = 1000;
  export let showConnectionStatus: boolean = true;
  
  let subscriptions: (() => void)[] = [];
  let connectionError: string | null = null;
  let selectedQuestionId: string | null = null;
  
  const realtimeConfig: RealtimeConfig = {
    updateInterval,
    bufferSize: 500,
    aggregation: 'none'
  };
  
  onMount(async () => {
    // Connect to WebSocket
    try {
      await analyticsStore.connect(wsUrl);
      
      // Subscribe to all questions
      if (questionIds.length > 0) {
        questionIds.forEach(questionId => {
          const unsubscribe = analyticsStore.subscribeToQuestion(
            questionnaireId,
            questionId,
            realtimeConfig
          );
          subscriptions.push(unsubscribe);
        });
        
        // Select first question by default
        selectedQuestionId = questionIds[0];
      } else {
        // Subscribe to entire questionnaire
        const unsubscribe = analyticsStore.subscribeToQuestionnaire(
          questionnaireId,
          realtimeConfig
        );
        subscriptions.push(unsubscribe);
      }
    } catch (error) {
      connectionError = error instanceof Error ? error.message : 'Failed to connect';
    }
  });
  
  onDestroy(() => {
    // Clean up subscriptions
    subscriptions.forEach(unsubscribe => unsubscribe());
    analyticsStore.clearSubscriptions();
  });
  
  $: questionStats = selectedQuestionId 
    ? $analyticsStore.questionStats.get(selectedQuestionId)
    : null;
  
  $: lastUpdateTime = $analyticsStore.lastUpdate
    ? new Date($analyticsStore.lastUpdate).toLocaleTimeString()
    : 'Never';
  
  function selectQuestion(questionId: string) {
    selectedQuestionId = questionId;
  }
  
  function getUpdateCount(): number {
    return $analyticsStore.updates.length;
  }
  
  function getResponseRate(): string {
    if ($analyticsStore.updates.length === 0) return '0/min';
    
    const oldestUpdate = $analyticsStore.updates[$analyticsStore.updates.length - 1];
    const newestUpdate = $analyticsStore.updates[0];
    
    if (!oldestUpdate || !newestUpdate) return '0/min';
    
    const timeDiff = (newestUpdate.timestamp - oldestUpdate.timestamp) / 1000 / 60; // minutes
    const rate = $analyticsStore.updates.length / Math.max(timeDiff, 1);
    
    return `${rate.toFixed(1)}/min`;
  }
</script>

<div class="analytics-dashboard">
  {#if showConnectionStatus}
    <div class="connection-status" transition:slide>
      <div class="status-indicator" class:connected={$connectedStatus}>
        <span class="status-dot" />
        <span class="status-text">
          {#if $connectedStatus}
            Connected
          {:else if $analyticsStore.connecting}
            Connecting...
          {:else}
            Disconnected
          {/if}
        </span>
      </div>
      
      {#if connectionError}
        <div class="error-message">
          {connectionError}
        </div>
      {/if}
      
      <div class="status-stats">
        <div class="stat">
          <span class="label">Last Update</span>
          <span class="value">{lastUpdateTime}</span>
        </div>
        <div class="stat">
          <span class="label">Updates</span>
          <span class="value">{getUpdateCount()}</span>
        </div>
        <div class="stat">
          <span class="label">Rate</span>
          <span class="value">{getResponseRate()}</span>
        </div>
      </div>
    </div>
  {/if}
  
  {#if questionIds.length > 1}
    <div class="question-tabs">
      {#each questionIds as questionId}
        <button
          class="tab"
          class:active={selectedQuestionId === questionId}
          on:click={() => selectQuestion(questionId)}
        >
          Question {questionId}
        </button>
      {/each}
    </div>
  {/if}
  
  <div class="dashboard-content">
    {#if selectedQuestionId}
      <DescriptiveStatsCard
        stats={questionStats}
        title="Question Statistics"
        loading={$analyticsStore.connecting}
        error={connectionError}
      />
    {:else}
      <div class="no-selection">
        <p>Select a question to view statistics</p>
      </div>
    {/if}
  </div>
  
  {#if $analyticsStore.updates.length > 0}
    <div class="recent-updates" transition:fade>
      <h3>Recent Updates</h3>
      <div class="updates-list">
        {#each $analyticsStore.updates.slice(0, 5) as update}
          <div class="update-item">
            <span class="update-type">{update.type}</span>
            <span class="update-question">Q{update.questionId || 'All'}</span>
            <span class="update-time">
              {new Date(update.timestamp).toLocaleTimeString()}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .analytics-dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .connection-status {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  
  .status-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: var(--color-gray-400);
    transition: background 0.3s;
  }
  
  .status-indicator.connected .status-dot {
    background: var(--color-green-500);
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.6; }
    100% { opacity: 1; }
  }
  
  .status-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
  }
  
  .error-message {
    background: var(--color-red-50);
    color: var(--color-red-700);
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }
  
  .status-stats {
    display: flex;
    gap: 1.5rem;
  }
  
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .stat .label {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .stat .value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .question-tabs {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  
  .tab {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }
  
  .tab:hover {
    background: var(--color-gray-50);
  }
  
  .tab.active {
    background: var(--color-blue-500);
    color: white;
    border-color: var(--color-blue-500);
  }
  
  .dashboard-content {
    flex: 1;
  }
  
  .no-selection {
    background: var(--color-gray-50);
    border: 2px dashed var(--color-gray-300);
    border-radius: 0.5rem;
    padding: 3rem;
    text-align: center;
  }
  
  .no-selection p {
    margin: 0;
    color: var(--color-gray-600);
  }
  
  .recent-updates {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .recent-updates h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
  }
  
  .updates-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .update-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: var(--color-gray-50);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
  
  .update-type {
    padding: 0.125rem 0.375rem;
    background: var(--color-blue-100);
    color: var(--color-blue-700);
    border-radius: 0.125rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .update-question {
    font-weight: 500;
    color: var(--color-gray-700);
  }
  
  .update-time {
    margin-left: auto;
    color: var(--color-gray-500);
  }
  
  @media (max-width: 768px) {
    .status-stats {
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .question-tabs {
      -webkit-overflow-scrolling: touch;
    }
  }
</style>