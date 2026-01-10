import { browser } from '$app/environment';
import type { Tables } from '$lib/services/supabase';

type Project = Tables['projects'];
type Organization = Tables['organizations'];
type QuestionnaireDefinition = Tables['questionnaire_definitions'];

interface CachedData {
  timestamp: number;
  data: any;
}

interface OfflineQueue {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'questionnaire' | 'response';
  data: any;
  timestamp: number;
  retries: number;
}

class OfflineDataService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'qdesigner-offline';
  private readonly DB_VERSION = 1;
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  async init() {
    if (!browser) return;
    
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for cached data (projects, orgs, questionnaires)
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
        
        // Store for offline queue (pending changes)
        if (!db.objectStoreNames.contains('queue')) {
          const queue = db.createObjectStore('queue', { keyPath: 'id' });
          queue.createIndex('timestamp', 'timestamp');
        }
        
        // Store for user session data
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'key' });
        }
      };
    });
  }
  
  private getCacheKey(type: string, id?: string): string {
    return id ? `${type}:${id}` : type;
  }
  
  async cacheData(type: string, id: string | undefined, data: any): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    
    await store.put({
      key: this.getCacheKey(type, id),
      timestamp: Date.now(),
      data
    });
  }
  
  async getCachedData<T>(type: string, id?: string): Promise<T | null> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['cache'], 'readonly');
    const store = transaction.objectStore('cache');
    const key = this.getCacheKey(type, id);
    
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const cached = request.result as CachedData;
        if (!cached) {
          resolve(null);
          return;
        }
        
        // Check if cache is expired
        if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
          resolve(null);
          return;
        }
        
        resolve(cached.data as T);
      };
      request.onerror = () => resolve(null);
    });
  }
  
  async cacheProject(project: Project): Promise<void> {
    await this.cacheData('project', project.id, project);
    
    // Also update the projects list cache
    const projects = await this.getCachedData<Project[]>('projects') || [];
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = project;
    } else {
      projects.push(project);
    }
    await this.cacheData('projects', undefined, projects);
  }
  
  async cacheOrganization(org: Organization): Promise<void> {
    await this.cacheData('organization', org.id, org);
  }
  
  async cacheQuestionnaire(questionnaire: QuestionnaireDefinition): Promise<void> {
    await this.cacheData('questionnaire', questionnaire.id, questionnaire);
  }
  
  async queueOfflineChange(change: Omit<OfflineQueue, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['queue'], 'readwrite');
    const store = transaction.objectStore('queue');
    
    const queueItem: OfflineQueue = {
      ...change,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0
    };
    
    await store.add(queueItem);
  }
  
  async getOfflineQueue(): Promise<OfflineQueue[]> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['queue'], 'readonly');
    const store = transaction.objectStore('queue');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }
  
  async removeFromQueue(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['queue'], 'readwrite');
    const store = transaction.objectStore('queue');
    await store.delete(id);
  }
  
  async saveSessionData(key: string, data: any): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['session'], 'readwrite');
    const store = transaction.objectStore('session');
    
    await store.put({ key, data });
  }
  
  async getSessionData<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['session'], 'readonly');
    const store = transaction.objectStore('session');
    
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data as T : null);
      };
      request.onerror = () => resolve(null);
    });
  }
  
  isOnline(): boolean {
    return browser ? navigator.onLine : true;
  }
  
  onOnlineStatusChange(callback: (online: boolean) => void): () => void {
    if (!browser) return () => {};
    
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }
}

export const offlineData = new OfflineDataService();