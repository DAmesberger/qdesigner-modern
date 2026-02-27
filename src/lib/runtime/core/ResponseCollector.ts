import type { Question, ResponseType } from '$lib/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response collector captures varying payload types across modules
type DynamicValue = any;

export interface ResponseCaptureMetadata {
  source: 'keyboard' | 'mouse' | 'touch' | 'programmatic';
  timestamp: number;
  responseTimeMs: number;
  rawEvent?: Event;
}

export interface ResponseHandlerConfig {
  onResponse: (value: DynamicValue, metadata?: ResponseCaptureMetadata) => void;
  onTimeout?: () => void;
  onInvalid?: (reason: string) => void;
  eventTarget?: Document | HTMLElement;
  pointerTarget?: HTMLElement;
  now?: () => number;
  isResponseAllowed?: () => boolean;
}

/**
 * Handles collecting responses for different question types.
 *
 * Response collection is now bound to explicit event targets so multiple runtime
 * instances can run safely without relying on global DOM queries.
 */
export class ResponseCollector {
  private question: Question | null = null;
  private config: ResponseHandlerConfig | null = null;
  private isActive = false;
  private isPaused = false;

  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private mouseHandler: ((e: MouseEvent) => void) | null = null;
  private touchHandler: ((e: TouchEvent) => void) | null = null;
  private timeoutId: number | null = null;

  private eventTarget: Document | HTMLElement = document;
  private pointerTarget: HTMLElement | null = null;

  private validKeys: Set<string> = new Set();
  private startTime = 0;
  private now: () => number = () => performance.now();

  public setup(question: Question, config: ResponseHandlerConfig): void {
    this.cleanup();

    this.question = question;
    this.config = config;
    this.eventTarget = config.eventTarget || document;
    this.pointerTarget =
      config.pointerTarget || (this.eventTarget instanceof HTMLElement ? this.eventTarget : null);
    this.now = config.now || (() => performance.now());

    this.configureHandlers((question as DynamicValue).responseType);
  }

  public start(): void {
    if (!this.question || !this.config) return;

    this.isActive = true;
    this.startTime = this.now();

    const questionTiming = (this.question as DynamicValue).timing;
    const responseTypeTiming = (this.question as DynamicValue).responseType?.timeout;
    const timeoutMs = questionTiming?.responseDuration || responseTypeTiming;

    if (timeoutMs && timeoutMs > 0) {
      this.timeoutId = window.setTimeout(() => {
        if (this.isActive) {
          this.handleTimeout();
        }
      }, timeoutMs);
    }

    this.attachEventListeners();
  }

  public stop(): void {
    this.isActive = false;
    this.cleanup();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  private configureHandlers(responseType: ResponseType): void {
    const rt = responseType as DynamicValue;

    switch (rt.type) {
      case 'keypress':
        this.configureKeypressHandler(rt);
        break;
      case 'single':
      case 'multiple':
        this.configureChoiceHandler(rt);
        break;
      case 'scale':
        this.configureScaleHandler(rt);
        break;
      case 'number':
        this.configureNumberHandler(rt);
        break;
      case 'text':
        this.configureTextHandler(rt);
        break;
      case 'click':
        this.configureClickHandler(rt);
        break;
      default:
        this.keyboardHandler = null;
        this.mouseHandler = null;
        this.touchHandler = null;
        break;
    }
  }

  private shouldAcceptResponse(): boolean {
    if (!this.isActive || this.isPaused) return false;
    if (!this.config?.isResponseAllowed) return true;
    return this.config.isResponseAllowed();
  }

  private configureKeypressHandler(responseType: ResponseType): void {
    const rt = responseType as DynamicValue;
    if (rt.type !== 'keypress') return;

    this.validKeys = new Set((rt.keys || []).map((key: string) => key.toLowerCase()));

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (!this.shouldAcceptResponse()) return;

      const key = event.key.toLowerCase();
      if (this.validKeys.size > 0 && !this.validKeys.has(key)) {
        return;
      }

      this.handleResponse(key, 'keyboard', event);
    };
  }

  private configureChoiceHandler(responseType: ResponseType): void {
    const rt = responseType as DynamicValue;
    if (rt.type !== 'single' && rt.type !== 'multiple') return;

    const options: Array<{ value: string | number | boolean; key?: string }> = rt.options || [];
    const isMultiple = rt.type === 'multiple';
    const selectedValues = new Set<string | number | boolean>();

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (!this.shouldAcceptResponse()) return;

      const key = event.key.toLowerCase();
      const normalize = (value: unknown) => String(value ?? '').toLowerCase();
      const option = options.find(
        (entry) => normalize(entry.key) === key || normalize(entry.value) === key
      );

      if (!option) {
        if (isMultiple && event.key === 'Enter' && selectedValues.size > 0) {
          this.handleResponse(Array.from(selectedValues), 'keyboard', event);
        }
        return;
      }

      if (isMultiple) {
        if (selectedValues.has(option.value)) {
          selectedValues.delete(option.value);
        } else {
          selectedValues.add(option.value);
        }
      } else {
        this.handleResponse(option.value, 'keyboard', event);
      }
    };
  }

  private configureScaleHandler(responseType: ResponseType): void {
    const rt = responseType as DynamicValue;
    if (rt.type !== 'scale') return;

    const min = rt.min || 1;
    const max = rt.max || 5;
    let currentValue = Math.floor((min + max) / 2);

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (!this.shouldAcceptResponse()) return;

      switch (event.key) {
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
          this.handleResponse(currentValue, 'keyboard', event);
          return;
        default:
          const numeric = parseInt(event.key, 10);
          if (!Number.isNaN(numeric) && numeric >= min && numeric <= max) {
            this.handleResponse(numeric, 'keyboard', event);
          }
          return;
      }
    };
  }

  private configureNumberHandler(responseType: ResponseType): void {
    const rt = responseType as DynamicValue;
    if (rt.type !== 'number') return;

    let inputValue = '';
    const min = rt.min;
    const max = rt.max;

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (!this.shouldAcceptResponse()) return;

      if (event.key >= '0' && event.key <= '9') {
        inputValue += event.key;
        return;
      }

      if (event.key === '.' && !inputValue.includes('.')) {
        inputValue += '.';
        return;
      }

      if (event.key === '-' && inputValue === '') {
        inputValue = '-';
        return;
      }

      if (event.key === 'Backspace') {
        inputValue = inputValue.slice(0, -1);
        return;
      }

      if (event.key !== 'Enter' || inputValue === '') {
        return;
      }

      const value = parseFloat(inputValue);
      if (Number.isNaN(value)) {
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

      this.handleResponse(value, 'keyboard', event);
    };
  }

  private configureTextHandler(responseType: ResponseType): void {
    const rt = responseType as DynamicValue;
    if (rt.type !== 'text') return;

    let inputValue = '';
    const minLength = rt.minLength || 0;
    const maxLength = rt.maxLength;

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (!this.shouldAcceptResponse()) return;

      if (event.key.length === 1 && (!maxLength || inputValue.length < maxLength)) {
        inputValue += event.key;
        return;
      }

      if (event.key === 'Backspace') {
        inputValue = inputValue.slice(0, -1);
        return;
      }

      if (event.key !== 'Enter') {
        return;
      }

      if (inputValue.length < minLength) {
        this.config?.onInvalid?.(`Text must be at least ${minLength} characters`);
        return;
      }

      this.handleResponse(inputValue, 'keyboard', event);
    };
  }

  private configureClickHandler(responseType: ResponseType): void {
    if (responseType.type !== 'click') return;

    this.mouseHandler = (event: MouseEvent) => {
      if (!this.shouldAcceptResponse()) return;
      if (!this.pointerTarget) return;

      const rect = this.pointerTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      this.handleResponse({ x, y }, 'mouse', event);
    };

    this.touchHandler = (event: TouchEvent) => {
      if (!this.shouldAcceptResponse()) return;
      if (!this.pointerTarget) return;

      const touch = event.touches[0];
      if (!touch) return;

      const rect = this.pointerTarget.getBoundingClientRect();
      const x = (touch.clientX - rect.left) / rect.width;
      const y = (touch.clientY - rect.top) / rect.height;
      this.handleResponse({ x, y }, 'touch', event);
    };
  }

  private handleResponse(
    value: DynamicValue,
    source: ResponseCaptureMetadata['source'],
    rawEvent?: Event
  ): void {
    if (!this.isActive || !this.config) return;

    this.isActive = false;

    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.removeEventListeners();

    const timestamp = this.now();
    const metadata: ResponseCaptureMetadata = {
      source,
      timestamp,
      responseTimeMs: Math.max(0, timestamp - this.startTime),
      rawEvent,
    };

    this.config.onResponse(value, metadata);
  }

  private handleTimeout(): void {
    if (!this.config) return;

    this.isActive = false;
    this.removeEventListeners();

    if (this.config.onTimeout) {
      this.config.onTimeout();
    } else {
      this.config.onResponse(null, {
        source: 'programmatic',
        timestamp: this.now(),
        responseTimeMs: Math.max(0, this.now() - this.startTime),
      });
    }
  }

  private attachEventListeners(): void {
    if (this.keyboardHandler) {
      this.eventTarget.addEventListener('keydown', this.keyboardHandler as EventListener);
    }

    if (this.mouseHandler) {
      (this.pointerTarget || this.canvasFallback())?.addEventListener('click', this.mouseHandler);
    }

    if (this.touchHandler) {
      (this.pointerTarget || this.canvasFallback())?.addEventListener(
        'touchstart',
        this.touchHandler
      );
    }
  }

  private removeEventListeners(): void {
    if (this.keyboardHandler) {
      this.eventTarget.removeEventListener('keydown', this.keyboardHandler as EventListener);
    }

    const pointerTarget = this.pointerTarget || this.canvasFallback();

    if (this.mouseHandler) {
      pointerTarget?.removeEventListener('click', this.mouseHandler);
    }

    if (this.touchHandler) {
      pointerTarget?.removeEventListener('touchstart', this.touchHandler);
    }
  }

  private canvasFallback(): HTMLElement | null {
    return document.querySelector('canvas');
  }

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
