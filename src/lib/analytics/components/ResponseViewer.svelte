<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { RealtimeAnalytics } from '../RealtimeAnalytics';
  import type { RealtimeEvent, ConnectionStatus } from '../types';

  // Props
  interface Props {
    realtimeAnalytics: RealtimeAnalytics;
    questionnaireId: string;
    maxEvents?: number;
  }

  let { realtimeAnalytics, questionnaireId, maxEvents = 100 }: Props = $props();

  // State using Svelte 5 runes
  let events = $state<RealtimeEvent[]>([]);
  let connectionStatus = $state<ConnectionStatus>({
    connected: false,
    connectionType: 'offline',
    reconnectAttempts: 0,
    errors: [],
  });
  let selectedEventTypes = $state<Set<string>>(
    new Set(['response_submitted', 'session_completed'])
  );
  let autoScroll = $state(true);
  let showDetails = $state(false);
  let selectedEvent = $state<RealtimeEvent | null>(null);
  let filterText = $state('');

  // Container reference for auto-scrolling
  let eventsContainer = $state<HTMLDivElement>();

  // Computed filtered events
  let filteredEvents = $derived.by(() => {
    return events.filter((event) => {
      // Filter by selected event types
      if (!selectedEventTypes.has(event.type)) return false;

      // Filter by questionnaire ID
      if (event.questionnaireId !== questionnaireId) return false;

      // Filter by text search if provided
      if (filterText) {
        const searchText = filterText.toLowerCase();
        const eventText = JSON.stringify(event).toLowerCase();
        if (!eventText.includes(searchText)) return false;
      }

      return true;
    });
  });

  // Setup event listeners
  onMount(() => {
    setupEventListeners();
    updateConnectionStatus();

    // Update connection status periodically
    const statusInterval = setInterval(updateConnectionStatus, 1000);

    return () => {
      clearInterval(statusInterval);
    };
  });

  onDestroy(() => {
    // Clean up event listeners
    realtimeAnalytics.off('response_submitted', handleRealtimeEvent);
    realtimeAnalytics.off('session_completed', handleRealtimeEvent);
    realtimeAnalytics.off('session_started', handleRealtimeEvent);
    realtimeAnalytics.off('question_viewed', handleRealtimeEvent);
    realtimeAnalytics.off('error_occurred', handleRealtimeEvent);
    realtimeAnalytics.off('connection', handleConnectionChange);
  });

  function setupEventListeners() {
    // Listen to various event types
    realtimeAnalytics.on('response_submitted', handleRealtimeEvent);
    realtimeAnalytics.on('session_completed', handleRealtimeEvent);
    realtimeAnalytics.on('session_started', handleRealtimeEvent);
    realtimeAnalytics.on('question_viewed', handleRealtimeEvent);
    realtimeAnalytics.on('error_occurred', handleRealtimeEvent);
    realtimeAnalytics.on('connection', handleConnectionChange);
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    // Add new event to the beginning of the array
    events = [event, ...events];

    // Limit the number of events to prevent memory issues
    if (events.length > maxEvents) {
      events = events.slice(0, maxEvents);
    }

    // Auto-scroll to latest event if enabled
    // Auto-scroll to latest event if enabled
    if (autoScroll && eventsContainer) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        if (eventsContainer) eventsContainer.scrollTop = 0;
      });
    }
  }

  function handleConnectionChange(status: { connected: boolean; type: string }) {
    updateConnectionStatus();
  }

  function updateConnectionStatus() {
    connectionStatus = realtimeAnalytics.getConnectionStatus();
  }

  function toggleEventType(eventType: string) {
    const newSet = new Set(selectedEventTypes);
    if (newSet.has(eventType)) {
      newSet.delete(eventType);
    } else {
      newSet.add(eventType);
    }
    selectedEventTypes = newSet;
  }

  function clearEvents() {
    events = [];
  }

  function exportEvents() {
    const dataStr = JSON.stringify(filteredEvents, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `realtime_events_${new Date().toISOString().slice(0, 19)}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  function formatEventData(data: any): string {
    if (data === null || data === undefined) return 'null';
    if (typeof data === 'string') return data;
    if (typeof data === 'number') return data.toString();
    return JSON.stringify(data, null, 2);
  }

  function getEventIcon(eventType: string): string {
    switch (eventType) {
      case 'response_submitted':
        return '✓';
      case 'session_completed':
        return '🏁';
      case 'session_started':
        return '🚀';
      case 'question_viewed':
        return '👁';
      case 'error_occurred':
        return '❌';
      case 'performance_metric':
        return '📊';
      default:
        return '•';
    }
  }

  function getEventColor(eventType: string): string {
    switch (eventType) {
      case 'response_submitted':
        return 'text-green-600 dark:text-green-400';
      case 'session_completed':
        return 'text-blue-600 dark:text-blue-400';
      case 'session_started':
        return 'text-purple-600 dark:text-purple-400';
      case 'question_viewed':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error_occurred':
        return 'text-red-600 dark:text-red-400';
      case 'performance_metric':
        return 'text-indigo-600 dark:text-indigo-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  function showEventDetails(event: RealtimeEvent) {
    selectedEvent = event;
    showDetails = true;
  }

  // Auto-scroll effect
  $effect(() => {
    if (autoScroll && eventsContainer && events.length > 0) {
      eventsContainer.scrollTop = 0;
    }
  });

  function closeDetails() {
    showDetails = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeDetails();
    }
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeDetails();
    }
  }
</script>

<div class="p-6">
  <!-- Header with controls -->
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center space-x-4">
      <!-- Connection status -->
      <div class="flex items-center space-x-2">
        <div
          class="w-3 h-3 rounded-full {connectionStatus.connected
            ? 'bg-green-500'
            : 'bg-red-500'} animate-pulse"
        ></div>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {connectionStatus.connected
            ? `Connected (${connectionStatus.connectionType})`
            : 'Disconnected'}
        </span>
        {#if connectionStatus.latency}
          <span class="text-xs text-gray-500 dark:text-gray-400">
            ({connectionStatus.latency}ms)
          </span>
        {/if}
      </div>

      <!-- Event count -->
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {filteredEvents.length} events
      </span>
    </div>

    <div class="flex items-center space-x-2">
      <!-- Auto-scroll toggle -->
      <button
        onclick={() => (autoScroll = !autoScroll)}
        class="flex items-center px-3 py-1 text-xs font-medium rounded {autoScroll
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}"
      >
        Auto-scroll
      </button>

      <!-- Export button -->
      <button
        onclick={exportEvents}
        disabled={filteredEvents.length === 0}
        class="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
      >
        Export
      </button>

      <!-- Clear button -->
      <button
        onclick={clearEvents}
        disabled={events.length === 0}
        class="px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-800 rounded hover:bg-red-200 dark:hover:bg-red-700 disabled:opacity-50"
      >
        Clear
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="mb-4 space-y-3">
    <!-- Event type filters -->
    <div>
      <h3 class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Event Types</h3>
      <div class="flex flex-wrap gap-2">
        {#each ['response_submitted', 'session_completed', 'session_started', 'question_viewed', 'error_occurred', 'performance_metric'] as eventType}
          <button
            onclick={() => toggleEventType(eventType)}
            class="flex items-center px-3 py-1 text-xs font-medium rounded-full border {selectedEventTypes.has(
              eventType
            )
              ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-600'
              : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'}"
          >
            <span class="mr-1">{getEventIcon(eventType)}</span>
            {eventType.replace('_', ' ')}
          </button>
        {/each}
      </div>
    </div>

    <!-- Text filter -->
    <div>
      <label
        for="event-filter"
        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        Filter Events
      </label>
      <input
        id="event-filter"
        type="text"
        bind:value={filterText}
        placeholder="Search events..."
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  </div>

  <!-- Events list -->
  <div
    bind:this={eventsContainer}
    class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto"
  >
    {#if filteredEvents.length === 0}
      <div class="flex items-center justify-center h-full text-center">
        <div class="text-gray-500 dark:text-gray-400">
          {events.length === 0 ? 'No events received yet' : 'No events match the current filters'}
        </div>
      </div>
    {:else}
      <div class="space-y-2">
        {#each filteredEvents as event (event.timestamp + event.sessionId)}
          <button
            class="w-full text-left bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
            onclick={() => showEventDetails(event)}
          >
            <div class="flex items-start justify-between">
              <div class="flex items-start space-x-3">
                <span class="text-lg {getEventColor(event.type)}">
                  {getEventIcon(event.type)}
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center space-x-2">
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                      {event.type
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </h4>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>

                  <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Session: {event.sessionId.slice(0, 8)}...
                  </div>

                  {#if event.data && typeof event.data === 'object'}
                    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                      {JSON.stringify(event.data).slice(0, 100)}...
                    </div>
                  {:else if event.data}
                    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {String(event.data).slice(0, 100)}
                    </div>
                  {/if}
                </div>
              </div>

              <div class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Event details modal -->
{#if showDetails && selectedEvent}
  <div
    class="fixed inset-0 z-50 overflow-y-auto"
    aria-labelledby="modal-title"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
    >
      <div
        class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
        onclick={closeDetails}
        onkeydown={handleBackdropKeydown}
        role="button"
        tabindex="0"
        aria-label="Close modal"
      ></div>

      <div
        class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full"
      >
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              Event Details
            </h3>
            <button
              onclick={closeDetails}
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div class="space-y-4">
            <div>
              <span class="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
              <div class="mt-1 text-sm text-gray-900 dark:text-white">{selectedEvent.type}</div>
            </div>

            <div>
              <span class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >Timestamp</span
              >
              <div class="mt-1 text-sm text-gray-900 dark:text-white">
                {new Date(selectedEvent.timestamp).toLocaleString()}
              </div>
            </div>

            <div>
              <span class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >Session ID</span
              >
              <div class="mt-1 text-sm text-gray-900 dark:text-white font-mono">
                {selectedEvent.sessionId}
              </div>
            </div>

            <div>
              <span class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >Questionnaire ID</span
              >
              <div class="mt-1 text-sm text-gray-900 dark:text-white font-mono">
                {selectedEvent.questionnaireId}
              </div>
            </div>

            <div>
              <span class="block text-sm font-medium text-gray-700 dark:text-gray-300">Data</span>
              <div class="mt-1">
                <pre
                  class="bg-gray-100 dark:bg-gray-900 p-3 rounded-md text-xs text-gray-900 dark:text-white overflow-x-auto">{formatEventData(
                    selectedEvent.data
                  )}</pre>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            onclick={closeDetails}
            class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
