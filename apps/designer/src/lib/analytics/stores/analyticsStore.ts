import { writable, derived, get } from 'svelte/store';
import type { 
  StatUpdate, 
  DescriptiveStats, 
  CorrelationMatrix,
  RealtimeConfig,
  AnalyticsReport
} from '../types';
import { getRealtimeAnalytics, type RealtimeChannel } from '../realtime/RealtimeAnalytics';
import { initializeWebSocket } from '../realtime/WebSocketManager';

interface AnalyticsState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  questionStats: Map<string, DescriptiveStats>;
  correlations: CorrelationMatrix | null;
  updates: StatUpdate[];
  lastUpdate: number;
}

function createAnalyticsStore() {
  const initialState: AnalyticsState = {
    connected: false,
    connecting: false,
    error: null,
    questionStats: new Map(),
    correlations: null,
    updates: [],
    lastUpdate: 0
  };
  
  const { subscribe, set, update } = writable<AnalyticsState>(initialState);
  
  let subscriptions: Map<string, () => void> = new Map();
  
  return {
    subscribe,
    
    // Initialize WebSocket connection
    async connect(wsUrl: string): Promise<void> {
      update(state => ({ ...state, connecting: true, error: null }));
      
      try {
        await initializeWebSocket(wsUrl);
        update(state => ({ ...state, connected: true, connecting: false }));
      } catch (error) {
        update(state => ({ 
          ...state, 
          connected: false, 
          connecting: false,
          error: error instanceof Error ? error.message : 'Connection failed'
        }));
        throw error;
      }
    },
    
    // Subscribe to real-time updates for a question
    subscribeToQuestion(
      questionnaireId: string,
      questionId: string,
      config: RealtimeConfig = {
        updateInterval: 1000,
        bufferSize: 100,
        aggregation: 'none'
      }
    ): () => void {
      const channel: RealtimeChannel = {
        questionnaireId,
        questionId,
        metric: 'descriptive'
      };
      
      const analytics = getRealtimeAnalytics();
      const unsubscribe = analytics.subscribe(
        channel,
        config,
        (statUpdate: StatUpdate) => {
          update(state => {
            const newStats = new Map(state.questionStats);
            
            if (statUpdate.type === 'descriptive' && statUpdate.questionId) {
              newStats.set(statUpdate.questionId, statUpdate.data as DescriptiveStats);
            }
            
            return {
              ...state,
              questionStats: newStats,
              updates: [...state.updates.slice(-99), statUpdate],
              lastUpdate: Date.now()
            };
          });
        }
      );
      
      const key = `${questionnaireId}:${questionId}`;
      subscriptions.set(key, unsubscribe);
      
      return () => {
        unsubscribe();
        subscriptions.delete(key);
      };
    },
    
    // Subscribe to all questions in a questionnaire
    subscribeToQuestionnaire(
      questionnaireId: string,
      config: RealtimeConfig = {
        updateInterval: 5000,
        bufferSize: 500,
        aggregation: 'mean'
      }
    ): () => void {
      const channel: RealtimeChannel = {
        questionnaireId,
        metric: 'descriptive'
      };
      
      const analytics = getRealtimeAnalytics();
      const unsubscribe = analytics.subscribe(
        channel,
        config,
        (statUpdate: StatUpdate) => {
          update(state => ({
            ...state,
            updates: [...state.updates.slice(-99), statUpdate],
            lastUpdate: Date.now()
          }));
        }
      );
      
      subscriptions.set(questionnaireId, unsubscribe);
      
      return () => {
        unsubscribe();
        subscriptions.delete(questionnaireId);
      };
    },
    
    // Add a response manually (for testing or offline mode)
    addResponse(response: any): void {
      const analytics = getRealtimeAnalytics();
      analytics.addResponse(response);
    },
    
    // Get current stats for a question
    getQuestionStats(questionnaireId: string, questionId: string): DescriptiveStats | null {
      const state = get({ subscribe });
      return state.questionStats.get(questionId) || null;
    },
    
    // Clear all subscriptions
    clearSubscriptions(): void {
      subscriptions.forEach(unsubscribe => unsubscribe());
      subscriptions.clear();
      
      update(state => ({
        ...state,
        questionStats: new Map(),
        correlations: null,
        updates: []
      }));
    },
    
    // Reset store
    reset(): void {
      this.clearSubscriptions();
      set(initialState);
    }
  };
}

export const analyticsStore = createAnalyticsStore();

// Derived stores for specific metrics
export const connectedStatus = derived(
  analyticsStore,
  $store => $store.connected
);

export const latestUpdate = derived(
  analyticsStore,
  $store => $store.updates[0] || null
);

export const statsForQuestion = (questionId: string) => derived(
  analyticsStore,
  $store => $store.questionStats.get(questionId) || null
);