import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface ProgressState {
  type: 'idle' | 'loading' | 'complete' | 'error';
  loaded: number;
  total: number;
  stage?: string;
  resource?: string;
  error?: string;
}

function createServiceWorkerProgress() {
  const { subscribe, set, update } = writable<ProgressState>({
    type: 'idle',
    loaded: 0,
    total: 0
  });

  let progressChannel: BroadcastChannel | null = null;

  function init() {
    if (!browser || !('BroadcastChannel' in window)) {
      return;
    }

    progressChannel = new BroadcastChannel('sw-progress');
    
    progressChannel.onmessage = (event) => {
      const { data } = event;
      
      switch (data.type) {
        case 'cache-progress':
          update(state => ({
            ...state,
            type: 'loading',
            loaded: data.loaded,
            total: data.total,
            stage: data.stage,
            resource: data.resource
          }));
          break;
          
        case 'cache-complete':
          update(state => ({
            ...state,
            type: 'complete'
          }));
          break;
          
        case 'cache-error':
          update(state => ({
            ...state,
            type: 'error',
            error: data.error
          }));
          break;
      }
    };
  }

  function destroy() {
    if (progressChannel) {
      progressChannel.close();
      progressChannel = null;
    }
  }

  return {
    subscribe,
    init,
    destroy
  };
}

export const serviceWorkerProgress = createServiceWorkerProgress();