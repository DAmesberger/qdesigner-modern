// Scripting Engine Service - Integration with the modular system

import { VariableEngine as Evaluator } from '$lib/scripting-engine';
import type { ConditionalLogic } from '$lib/shared';

class ScriptingEngineService {
  private evaluator: Evaluator;
  private variables: Map<string, any> = new Map();
  private responseCache: Map<string, any> = new Map();
  
  constructor() {
    this.evaluator = new Evaluator();
    this.setupBuiltInVariables();
    this.setupResponseListener();
  }
  
  /**
   * Evaluate a formula with current context
   */
  async evaluate(formula: string, context?: Record<string, any>): Promise<any> {
    const allVariables = this.getAllVariables(context);
    return this.evaluator.evaluate(formula, allVariables);
  }
  
  /**
   * Evaluate conditional logic
   */
  async evaluateCondition(condition: ConditionalLogic): Promise<boolean> {
    if (!condition.enabled) return true;
    
    try {
      const result = await this.evaluate(condition.expression);
      return Boolean(result);
    } catch (error) {
      console.error('Error evaluating condition:', error);
      return true; // Default to showing on error
    }
  }
  
  /**
   * Set a variable value
   */
  setVariable(name: string, value: any): void {
    this.variables.set(name, value);
    this.notifyVariableChange(name, value);
  }
  
  /**
   * Get a variable value
   */
  getVariable(name: string): any {
    return this.variables.get(name);
  }
  
  /**
   * Set multiple variables
   */
  setVariables(variables: Record<string, any>): void {
    Object.entries(variables).forEach(([name, value]) => {
      this.setVariable(name, value);
    });
  }
  
  /**
   * Clear all variables
   */
  clearVariables(): void {
    this.variables.clear();
    this.responseCache.clear();
  }
  
  /**
   * Get response value by question ID
   */
  getResponse(questionId: string): any {
    // Check cache first
    if (this.responseCache.has(questionId)) {
      return this.responseCache.get(questionId);
    }
    
    // Load from localStorage
    const key = `qd_response_${questionId}`;
    const stored = localStorage.getItem(key);
    
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const value = data.value;
        this.responseCache.set(questionId, value);
        return value;
      } catch (error) {
        console.error('Error loading response:', error);
      }
    }
    
    return null;
  }
  
  /**
   * Get all responses for current session
   */
  getAllResponses(): Record<string, any> {
    const responses: Record<string, any> = {};
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('qd_response_')) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const data = JSON.parse(stored);
            const questionId = key.replace('qd_response_', '');
            responses[questionId] = data.value;
          }
        } catch (error) {
          console.error('Error loading response:', error);
        }
      }
    }
    
    return responses;
  }
  
  /**
   * Parse and interpolate variables in text
   */
  interpolateVariables(text: string, context?: Record<string, any>): string {
    const allVariables = this.getAllVariables(context);
    
    // Replace ${variable} patterns
    return text.replace(/\$\{([^}]+)\}/g, (match, expression) => {
      try {
        const result = this.evaluator.evaluate(expression.trim(), allVariables);
        return String(result ?? '');
      } catch (error) {
        console.error('Error interpolating variable:', error);
        return match; // Return original on error
      }
    });
  }
  
  /**
   * Validate a formula
   */
  validateFormula(formula: string): { valid: boolean; error?: string } {
    try {
      // Try to parse the formula
      this.evaluator.validate(formula);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid formula' 
      };
    }
  }
  
  /**
   * Get available functions for formulas
   */
  getAvailableFunctions(): string[] {
    return [
      // Math functions
      'ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'POW', 'MIN', 'MAX',
      // Array functions
      'SUM', 'AVG', 'COUNT', 'MEDIAN', 'MODE', 'STD',
      // String functions
      'CONCAT', 'LENGTH', 'UPPER', 'LOWER', 'TRIM',
      // Logic functions
      'IF', 'AND', 'OR', 'NOT',
      // Date/Time functions
      'NOW', 'DATE', 'TIME_SINCE',
      // Random functions
      'RANDOM', 'RANDINT',
      // Response functions
      'RESPONSE', 'HAS_RESPONSE', 'RESPONSE_TIME'
    ];
  }
  
  // Private methods
  
  private setupBuiltInVariables(): void {
    // System variables
    this.setVariable('NOW', () => new Date());
    this.setVariable('TIMESTAMP', () => Date.now());
    this.setVariable('SESSION_ID', this.getSessionId());
    this.setVariable('PARTICIPANT_ID', this.getParticipantId());
    
    // Response accessor functions
    this.setVariable('RESPONSE', (questionId: string) => this.getResponse(questionId));
    this.setVariable('HAS_RESPONSE', (questionId: string) => this.getResponse(questionId) !== null);
    this.setVariable('RESPONSE_TIME', (questionId: string) => {
      const key = `qd_response_${questionId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          return data.metadata?.reactionTime || null;
        } catch {
          return null;
        }
      }
      return null;
    });
  }
  
  private setupResponseListener(): void {
    // Listen for response save events
    window.addEventListener('qd:response:saved', (event: CustomEvent) => {
      const { questionId, value } = event.detail;
      this.responseCache.set(questionId, value);
      this.notifyVariableChange(`response_${questionId}`, value);
    });
  }
  
  private getAllVariables(context?: Record<string, any>): Record<string, any> {
    const allVars: Record<string, any> = {};
    
    // Add stored variables
    this.variables.forEach((value, key) => {
      allVars[key] = typeof value === 'function' ? value() : value;
    });
    
    // Add all responses
    const responses = this.getAllResponses();
    Object.entries(responses).forEach(([questionId, value]) => {
      allVars[`response_${questionId}`] = value;
    });
    
    // Add context variables (override if needed)
    if (context) {
      Object.assign(allVars, context);
    }
    
    return allVars;
  }
  
  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('qd_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('qd_session_id', sessionId);
    }
    return sessionId;
  }
  
  private getParticipantId(): string {
    let participantId = localStorage.getItem('qd_participant_id');
    if (!participantId) {
      participantId = `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('qd_participant_id', participantId);
    }
    return participantId;
  }
  
  private notifyVariableChange(name: string, value: any): void {
    window.dispatchEvent(new CustomEvent('qd:variable:changed', {
      detail: { name, value }
    }));
  }
}

// Export singleton instance
export const scriptingEngine = new ScriptingEngineService();