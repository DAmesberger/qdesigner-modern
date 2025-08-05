// Base storage implementation for questions

import type { ModuleStorage, ResponseData } from '$lib/modules/types';
import type { QuestionResponse } from './types';

export abstract class BaseQuestionStorage implements ModuleStorage {
  protected prefix = 'qd_response_';
  protected sessionId: string;
  
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
  }
  
  // Abstract method that each question type must implement
  abstract getAnswerType(): any;
  
  async save(id: string, value: any): Promise<void> {
    const key = this.getKey(id);
    const data: QuestionResponse = {
      questionId: id,
      value,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      questionType: this.getQuestionType(),
      answerType: this.getAnswerType(),
      valid: true, // Will be set by validation
      metadata: {
        device: this.getDeviceInfo(),
        browser: this.getBrowserInfo()
      }
    };
    
    try {
      localStorage.setItem(key, JSON.stringify(data));
      // Notify analytics system
      this.notifyAnalytics(data);
    } catch (error) {
      console.error('Error saving response:', error);
      throw error;
    }
  }
  
  async load(id: string): Promise<any> {
    const key = this.getKey(id);
    
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      const data = JSON.parse(stored) as QuestionResponse;
      return data.value;
    } catch (error) {
      console.error('Error loading response:', error);
      return null;
    }
  }
  
  async clear(id: string): Promise<void> {
    const key = this.getKey(id);
    
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Error clearing response:', error);
    }
  }
  
  async getAll(): Promise<Record<string, any>> {
    const responses: Record<string, any> = {};
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const data = JSON.parse(stored) as QuestionResponse;
            const questionId = key.replace(this.prefix, '');
            responses[questionId] = data;
          }
        }
      }
    } catch (error) {
      console.error('Error getting all responses:', error);
    }
    
    return responses;
  }
  
  // Additional methods for response data
  async getResponseData(id: string): Promise<QuestionResponse | null> {
    const key = this.getKey(id);
    
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      return JSON.parse(stored) as QuestionResponse;
    } catch (error) {
      console.error('Error loading response data:', error);
      return null;
    }
  }
  
  async getAllForSession(sessionId?: string): Promise<QuestionResponse[]> {
    const targetSession = sessionId || this.sessionId;
    const responses: QuestionResponse[] = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const data = JSON.parse(stored) as QuestionResponse;
            if (data.sessionId === targetSession) {
              responses.push(data);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting session responses:', error);
    }
    
    return responses;
  }
  
  // Helper methods
  protected getKey(id: string): string {
    return `${this.prefix}${id}`;
  }
  
  protected getQuestionType(): string {
    // Override in subclasses if needed
    return this.constructor.name.replace('Storage', '').toLowerCase();
  }
  
  protected getOrCreateSessionId(): string {
    const key = 'qd_session_id';
    let sessionId = sessionStorage.getItem(key);
    
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(key, sessionId);
    }
    
    return sessionId;
  }
  
  protected getDeviceInfo(): string {
    const userAgent = navigator.userAgent;
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }
  
  protected getBrowserInfo(): string {
    const userAgent = navigator.userAgent;
    if (/chrome/i.test(userAgent)) return 'chrome';
    if (/firefox/i.test(userAgent)) return 'firefox';
    if (/safari/i.test(userAgent)) return 'safari';
    if (/edge/i.test(userAgent)) return 'edge';
    return 'other';
  }
  
  protected notifyAnalytics(data: QuestionResponse): void {
    // Emit custom event for analytics system
    window.dispatchEvent(new CustomEvent('qd:response:saved', {
      detail: data
    }));
  }
  
  // Storage management
  static clearAllResponses(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('qd_response_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
  
  static getStorageSize(): number {
    let size = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('qd_response_')) {
        const value = localStorage.getItem(key);
        if (value) {
          size += key.length + value.length;
        }
      }
    }
    
    return size;
  }
}