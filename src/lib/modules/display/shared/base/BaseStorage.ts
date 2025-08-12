// Base storage class for instruction modules

import type { StorageData } from '$lib/services/localStorage';

export abstract class BaseInstructionStorage {
  protected storage: StorageData;
  protected questionnaireId: string;
  
  constructor(storage: StorageData, questionnaireId: string) {
    this.storage = storage;
    this.questionnaireId = questionnaireId;
  }
  
  /**
   * Get all responses for a specific instruction
   */
  async getResponses(questionId: string): Promise<Array<{
    id: string;
    timestamp: string;
    value: any;
  }>> {
    const responses = await this.storage.getResponses(this.questionnaireId);
    return responses.filter(r => r.questionId === questionId);
  }
  
  /**
   * Parse stored value from JSON
   */
  protected parseValue(value: any): any {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  
  /**
   * Get the latest response for an instruction
   */
  async getLatestResponse(questionId: string): Promise<any | null> {
    const responses = await this.getResponses(questionId);
    if (responses.length === 0) return null;
    
    const latest = responses.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    
    return this.parseValue(latest.value);
  }
  
  /**
   * Clear all responses for an instruction
   */
  async clearResponses(questionId: string): Promise<void> {
    const allResponses = await this.storage.getResponses(this.questionnaireId);
    const filtered = allResponses.filter(r => r.questionId !== questionId);
    
    // Save filtered responses back
    for (const response of filtered) {
      await this.storage.saveResponse(response);
    }
  }
}