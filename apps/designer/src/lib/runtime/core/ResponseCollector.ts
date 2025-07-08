import type { Question, ResponseType } from '@qdesigner/shared';

export interface ResponseHandlerConfig {
  onResponse: (value: any) => void;
  onTimeout?: () => void;
  onInvalid?: (reason: string) => void;
}

/**
 * Handles collecting responses for different question types
 */
export class ResponseCollector {
  private question: Question | null = null;
  private config: ResponseHandlerConfig | null = null;
  private isActive: boolean = false;
  private isPaused: boolean = false;
  
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private mouseHandler: ((e: MouseEvent) => void) | null = null;
  private touchHandler: ((e: TouchEvent) => void) | null = null;
  private timeoutId: number | null = null;
  
  private validKeys: Set<string> = new Set();
  private collectedValue: any = null;
  private startTime: number = 0;
  
  /**
   * Set up response collection for a question
   */
  public setup(question: Question, config: ResponseHandlerConfig): void {
    this.cleanup();
    
    this.question = question;
    this.config = config;
    this.collectedValue = null;
    
    // Configure based on response type
    this.configureHandlers(question.responseType);
  }
  
  /**
   * Start collecting responses
   */
  public start(): void {
    if (!this.question || !this.config) return;
    
    this.isActive = true;
    this.startTime = performance.now();
    
    // Set up timeout if specified
    const timing = this.question.timing;
    if (timing?.responseDuration && timing.responseDuration > 0) {
      this.timeoutId = window.setTimeout(() => {
        if (this.isActive) {
          this.handleTimeout();
        }
      }, timing.responseDuration);
    }
    
    // Attach event listeners
    this.attachEventListeners();
  }
  
  /**
   * Stop collecting responses
   */
  public stop(): void {
    this.isActive = false;
    this.cleanup();
  }
  
  /**
   * Pause response collection
   */
  public pause(): void {
    this.isPaused = true;
  }
  
  /**
   * Resume response collection
   */
  public resume(): void {
    this.isPaused = false;
  }
  
  /**
   * Configure handlers based on response type
   */
  private configureHandlers(responseType: ResponseType): void {
    switch (responseType.type) {
      case 'keypress':
        this.configureKeypressHandler(responseType);
        break;
        
      case 'single':
      case 'multiple':
        this.configureChoiceHandler(responseType);
        break;
        
      case 'scale':
        this.configureScaleHandler(responseType);
        break;
        
      case 'number':
        this.configureNumberHandler(responseType);
        break;
        
      case 'text':
        this.configureTextHandler(responseType);
        break;
        
      case 'click':
        this.configureClickHandler(responseType);
        break;
        
      case 'none':
        // No response needed, just timing
        break;
    }
  }
  
  /**
   * Configure keypress response handler
   */
  private configureKeypressHandler(responseType: ResponseType): void {
    if (responseType.type !== 'keypress') return;
    
    // Set up valid keys
    this.validKeys = new Set(responseType.keys || []);
    
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      const key = e.key.toLowerCase();
      
      // Check if valid key
      if (this.validKeys.size > 0 && !this.validKeys.has(key)) {
        return;
      }
      
      // Record response
      this.handleResponse(key);
    };
  }
  
  /**
   * Configure choice response handler
   */
  private configureChoiceHandler(responseType: ResponseType): void {
    if (responseType.type !== 'single' && responseType.type !== 'multiple') return;
    
    const options = responseType.options || [];
    const isMultiple = responseType.type === 'multiple';
    const selectedValues: Set<string> = new Set();
    
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      const key = e.key.toLowerCase();
      
      // Find matching option
      const option = options.find(opt => 
        opt.value.toLowerCase() === key || 
        opt.key?.toLowerCase() === key
      );
      
      if (!option) return;
      
      if (isMultiple) {
        // Toggle selection
        if (selectedValues.has(option.value)) {
          selectedValues.delete(option.value);
        } else {
          selectedValues.add(option.value);
        }
        
        // Check for submission key (Enter)
        if (e.key === 'Enter' && selectedValues.size > 0) {
          this.handleResponse(Array.from(selectedValues));
        }
      } else {
        // Single choice - immediate response
        this.handleResponse(option.value);
      }
    };
  }
  
  /**
   * Configure scale response handler
   */
  private configureScaleHandler(responseType: ResponseType): void {
    if (responseType.type !== 'scale') return;
    
    const min = responseType.min || 1;
    const max = responseType.max || 5;
    let currentValue = Math.floor((min + max) / 2);
    
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          currentValue = Math.max(min, currentValue - 1);
          break;
          
        case 'ArrowRight':
        case 'ArrowUp':
          currentValue = Math.min(max, currentValue + 1);
          break;
          
        case 'Enter':
        case ' ':
          this.handleResponse(currentValue);
          return;
          
        default:
          // Check for number keys
          const num = parseInt(e.key);
          if (!isNaN(num) && num >= min && num <= max) {
            this.handleResponse(num);
          }
          return;
      }
      
      // Update visual feedback if needed
      // TODO: Add visual feedback for current scale value
    };
  }
  
  /**
   * Configure number response handler
   */
  private configureNumberHandler(responseType: ResponseType): void {
    if (responseType.type !== 'number') return;
    
    let inputValue = '';
    const min = responseType.min;
    const max = responseType.max;
    
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      if (e.key >= '0' && e.key <= '9') {
        inputValue += e.key;
      } else if (e.key === '.' && !inputValue.includes('.')) {
        inputValue += '.';
      } else if (e.key === '-' && inputValue === '') {
        inputValue = '-';
      } else if (e.key === 'Backspace') {
        inputValue = inputValue.slice(0, -1);
      } else if (e.key === 'Enter' && inputValue !== '') {
        const value = parseFloat(inputValue);
        
        // Validate
        if (isNaN(value)) {
          this.config?.onInvalid?.('Invalid number');
          return;
        }
        
        if (min !== undefined && value < min) {
          this.config?.onInvalid?.(`Value must be at least ${min}`);
          return;
        }
        
        if (max !== undefined && value > max) {
          this.config?.onInvalid?.(`Value must be at most ${max}`);
          return;
        }
        
        this.handleResponse(value);
      }
    };
  }
  
  /**
   * Configure text response handler
   */
  private configureTextHandler(responseType: ResponseType): void {
    if (responseType.type !== 'text') return;
    
    let inputValue = '';
    const minLength = responseType.minLength || 0;
    const maxLength = responseType.maxLength;
    
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      if (e.key.length === 1 && (!maxLength || inputValue.length < maxLength)) {
        inputValue += e.key;
      } else if (e.key === 'Backspace') {
        inputValue = inputValue.slice(0, -1);
      } else if (e.key === 'Enter') {
        if (inputValue.length < minLength) {
          this.config?.onInvalid?.(`Text must be at least ${minLength} characters`);
          return;
        }
        
        this.handleResponse(inputValue);
      }
    };
  }
  
  /**
   * Configure click response handler
   */
  private configureClickHandler(responseType: ResponseType): void {
    if (responseType.type !== 'click') return;
    
    this.mouseHandler = (e: MouseEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      const canvas = e.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      
      // Calculate normalized coordinates
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      
      this.handleResponse({ x, y });
    };
    
    this.touchHandler = (e: TouchEvent) => {
      if (!this.isActive || this.isPaused) return;
      
      e.preventDefault();
      const touch = e.touches[0];
      const canvas = e.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      
      const x = (touch.clientX - rect.left) / rect.width;
      const y = (touch.clientY - rect.top) / rect.height;
      
      this.handleResponse({ x, y });
    };
  }
  
  /**
   * Handle valid response
   */
  private handleResponse(value: any): void {
    if (!this.isActive || !this.config) return;
    
    this.collectedValue = value;
    this.isActive = false;
    
    // Clear timeout
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    // Remove event listeners
    this.removeEventListeners();
    
    // Callback
    this.config.onResponse(value);
  }
  
  /**
   * Handle response timeout
   */
  private handleTimeout(): void {
    if (!this.config) return;
    
    this.isActive = false;
    this.removeEventListeners();
    
    if (this.config.onTimeout) {
      this.config.onTimeout();
    } else {
      // Default timeout behavior
      this.config.onResponse(null);
    }
  }
  
  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (this.keyboardHandler) {
      document.addEventListener('keydown', this.keyboardHandler);
    }
    
    if (this.mouseHandler) {
      const canvas = document.querySelector('canvas');
      canvas?.addEventListener('click', this.mouseHandler);
    }
    
    if (this.touchHandler) {
      const canvas = document.querySelector('canvas');
      canvas?.addEventListener('touchstart', this.touchHandler);
    }
  }
  
  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
    }
    
    if (this.mouseHandler) {
      const canvas = document.querySelector('canvas');
      canvas?.removeEventListener('click', this.mouseHandler);
    }
    
    if (this.touchHandler) {
      const canvas = document.querySelector('canvas');
      canvas?.removeEventListener('touchstart', this.touchHandler);
    }
  }
  
  /**
   * Clean up
   */
  private cleanup(): void {
    this.removeEventListeners();
    
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    this.keyboardHandler = null;
    this.mouseHandler = null;
    this.touchHandler = null;
    this.validKeys.clear();
  }
}