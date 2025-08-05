/**
 * Queue Manager
 * Advanced queue management with priorities, retry logic, and backpressure handling
 */

import type { 
  QueueItem, 
  QueueConfig, 
  QueueStatus, 
  QueueMetrics, 
  QueueAttempt,
  PipelineEvent
} from './types';

export class QueueManager<T = any> {
  private config: Required<QueueConfig>;
  private queues: Map<number, QueueItem<T>[]> = new Map();
  private processing = new Set<string>();
  private completed = new Map<string, { success: boolean; result?: any; error?: string }>();
  private metrics: QueueMetrics;
  private workers = new Set<Promise<void>>();
  private isRunning = false;
  private eventHandlers = new Map<string, Function[]>();
  
  // Timing tracking
  private processingTimes: number[] = [];
  private waitTimes: number[] = [];
  private lastThroughputCheck = Date.now();
  private processedSinceLastCheck = 0;

  constructor(config: QueueConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      backoffMultiplier: config.backoffMultiplier || 2,
      priorityLevels: config.priorityLevels || 5,
      concurrency: config.concurrency || 5,
      timeout: config.timeout || 30000
    };

    // Initialize priority queues
    for (let i = 0; i < this.config.priorityLevels; i++) {
      this.queues.set(i, []);
    }

    // Initialize metrics
    this.metrics = {
      totalProcessed: 0,
      totalFailed: 0,
      avgWaitTime: 0,
      avgProcessingTime: 0,
      throughputPerSecond: 0,
      errorRate: 0,
      currentLoad: 0
    };
  }

  /**
   * Add item to queue
   */
  public async enqueue(
    data: T, 
    priority: number = 0, 
    options?: { 
      maxRetries?: number; 
      delay?: number; 
      timeout?: number;
      id?: string;
    }
  ): Promise<string> {
    const normalizedPriority = Math.max(0, Math.min(priority, this.config.priorityLevels - 1));
    
    // Check queue capacity
    if (this.getTotalQueueSize() >= this.config.maxSize) {
      throw new Error('Queue is at maximum capacity');
    }

    const item: QueueItem<T> = {
      id: options?.id || this.generateId(),
      data,
      priority: normalizedPriority,
      retries: 0,
      maxRetries: options?.maxRetries ?? this.config.maxRetries,
      delay: options?.delay || 0,
      created: Date.now(),
      scheduled: Date.now() + (options?.delay || 0),
      attempts: []
    };

    const queue = this.queues.get(normalizedPriority)!;
    queue.push(item);
    
    // Sort by scheduled time (earliest first)
    queue.sort((a, b) => a.scheduled - b.scheduled);

    this.emitEvent('item.enqueued', { item });

    // Start processing if not already running
    if (!this.isRunning) {
      this.start();
    }

    return item.id;
  }

  /**
   * Remove item from queue
   */
  public dequeue(itemId: string): boolean {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(item => item.id === itemId);
      if (index >= 0) {
        const item = queue.splice(index, 1)[0];
        this.emitEvent('item.dequeued', { item });
        return true;
      }
    }
    
    // Check if item is currently processing
    if (this.processing.has(itemId)) {
      // Mark for cancellation (implementation would depend on processor)
      this.emitEvent('item.cancelled', { itemId });
      return true;
    }

    return false;
  }

  /**
   * Start queue processing
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.emitEvent('queue.started', {});

    // Start worker coroutines
    for (let i = 0; i < this.config.concurrency; i++) {
      const worker = this.createWorker(`worker-${i}`);
      this.workers.add(worker);
    }

    // Start metrics update interval
    setInterval(() => this.updateMetrics(), 1000);
  }

  /**
   * Stop queue processing
   */
  public async stop(graceful: boolean = true): Promise<void> {
    this.isRunning = false;
    this.emitEvent('queue.stopping', { graceful });

    if (graceful) {
      // Wait for current items to finish processing
      await Promise.all(this.workers);
    }

    this.workers.clear();
    this.emitEvent('queue.stopped', {});
  }

  /**
   * Pause queue processing
   */
  public pause(): void {
    this.isRunning = false;
    this.emitEvent('queue.paused', {});
  }

  /**
   * Resume queue processing
   */
  public resume(): void {
    if (!this.isRunning) {
      this.start();
      this.emitEvent('queue.resumed', {});
    }
  }

  /**
   * Clear all queues
   */
  public clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    this.completed.clear();
    this.emitEvent('queue.cleared', {});
  }

  /**
   * Get queue status
   */
  public getStatus(): QueueStatus {
    return {
      size: this.getTotalQueueSize(),
      processing: this.processing.size,
      completed: this.completed.size,
      failed: Array.from(this.completed.values()).filter(r => !r.success).length,
      avgProcessingTime: this.metrics.avgProcessingTime,
      throughput: this.metrics.throughputPerSecond
    };
  }

  /**
   * Get detailed metrics
   */
  public getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Get item by ID
   */
  public getItem(itemId: string): QueueItem<T> | null {
    for (const queue of this.queues.values()) {
      const item = queue.find(item => item.id === itemId);
      if (item) {
        return item;
      }
    }
    return null;
  }

  /**
   * Get items by priority
   */
  public getItemsByPriority(priority: number): QueueItem<T>[] {
    const queue = this.queues.get(priority);
    return queue ? [...queue] : [];
  }

  /**
   * Process items with custom processor
   */
  public async processItems<R>(
    processor: (items: T[]) => Promise<R[]>,
    batchSize: number = 1
  ): Promise<void> {
    while (this.isRunning && this.getTotalQueueSize() > 0) {
      const batch = this.getNextBatch(batchSize);
      
      if (batch.length === 0) {
        await this.sleep(100); // Wait before checking again
        continue;
      }

      await this.processBatch(batch, processor);
    }
  }

  /**
   * Register event handler
   */
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unregister event handler
   */
  public off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Create worker coroutine
   */
  private async createWorker(workerId: string): Promise<void> {
    while (this.isRunning) {
      try {
        const item = this.getNextItem();
        
        if (!item) {
          await this.sleep(100); // Wait before checking again
          continue;
        }

        await this.processItem(item, workerId);
        
      } catch (error) {
        console.error(`Worker ${workerId} error:`, error);
        await this.sleep(1000); // Back off on error
      }
    }
  }

  /**
   * Get next item to process (priority-based)
   */
  private getNextItem(): QueueItem<T> | null {
    const now = Date.now();
    
    // Check queues in priority order (0 = highest priority)
    for (let priority = 0; priority < this.config.priorityLevels; priority++) {
      const queue = this.queues.get(priority)!;
      
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        
        // Check if item is ready to be processed
        if (item.scheduled <= now) {
          queue.splice(i, 1);
          return item;
        }
      }
    }
    
    return null;
  }

  /**
   * Get next batch of items
   */
  private getNextBatch(size: number): QueueItem<T>[] {
    const batch: QueueItem<T>[] = [];
    
    while (batch.length < size) {
      const item = this.getNextItem();
      if (!item) break;
      batch.push(item);
    }
    
    return batch;
  }

  /**
   * Process individual item
   */
  private async processItem(item: QueueItem<T>, workerId: string): Promise<void> {
    const startTime = Date.now();
    const waitTime = startTime - item.created;
    
    this.processing.add(item.id);
    this.waitTimes.push(waitTime);
    
    const attempt: QueueAttempt = {
      timestamp: startTime,
      duration: 0,
      success: false
    };

    item.attempts.push(attempt);
    
    this.emitEvent('item.processing', { item, workerId });

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), this.config.timeout);
      });

      // Process item (this would be customized based on your needs)
      const result = await Promise.race([
        this.defaultProcessor(item.data),
        timeoutPromise
      ]);

      // Mark as successful
      attempt.success = true;
      attempt.duration = Date.now() - startTime;
      
      this.processing.delete(item.id);
      this.completed.set(item.id, { success: true, result });
      this.processingTimes.push(attempt.duration);
      this.metrics.totalProcessed++;
      
      this.emitEvent('item.completed', { item, result, workerId });

    } catch (error) {
      attempt.success = false;
      attempt.duration = Date.now() - startTime;
      attempt.error = error.message;
      
      this.processing.delete(item.id);
      
      // Retry logic
      if (item.retries < item.maxRetries) {
        item.retries++;
        const retryDelay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, item.retries - 1);
        item.scheduled = Date.now() + retryDelay;
        
        // Re-queue for retry
        const queue = this.queues.get(item.priority)!;
        queue.push(item);
        queue.sort((a, b) => a.scheduled - b.scheduled);
        
        this.emitEvent('item.retry', { item, error: error.message, retryDelay, workerId });
        
      } else {
        // Max retries exceeded
        this.completed.set(item.id, { success: false, error: error.message });
        this.metrics.totalFailed++;
        
        this.emitEvent('item.failed', { item, error: error.message, workerId });
      }
    }
  }

  /**
   * Process batch of items
   */
  private async processBatch<R>(
    items: QueueItem<T>[],
    processor: (data: T[]) => Promise<R[]>
  ): Promise<void> {
    const startTime = Date.now();
    
    // Mark items as processing
    items.forEach(item => this.processing.add(item.id));
    
    try {
      const data = items.map(item => item.data);
      const results = await processor(data);
      
      // Mark items as completed
      items.forEach((item, index) => {
        this.processing.delete(item.id);
        this.completed.set(item.id, { success: true, result: results[index] });
        this.metrics.totalProcessed++;
      });
      
      const duration = Date.now() - startTime;
      this.processingTimes.push(duration);
      
      this.emitEvent('batch.completed', { items, results, duration });
      
    } catch (error) {
      // Handle batch failure
      items.forEach(item => {
        this.processing.delete(item.id);
        
        if (item.retries < item.maxRetries) {
          item.retries++;
          const retryDelay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, item.retries - 1);
          item.scheduled = Date.now() + retryDelay;
          
          const queue = this.queues.get(item.priority)!;
          queue.push(item);
        } else {
          this.completed.set(item.id, { success: false, error: error.message });
          this.metrics.totalFailed++;
        }
      });
      
      this.emitEvent('batch.failed', { items, error: error.message });
    }
  }

  /**
   * Default item processor (override this for custom processing)
   */
  private async defaultProcessor(data: T): Promise<any> {
    // This is a placeholder - in real usage, you'd inject the actual processor
    await this.sleep(Math.random() * 100); // Simulate processing time
    return { processed: true, data };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastThroughputCheck;
    
    if (timeSinceLastCheck >= 1000) {
      // Update throughput
      this.metrics.throughputPerSecond = (this.processedSinceLastCheck / timeSinceLastCheck) * 1000;
      this.processedSinceLastCheck = 0;
      this.lastThroughputCheck = now;
    }

    // Update average times
    if (this.processingTimes.length > 0) {
      this.metrics.avgProcessingTime = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
      
      // Keep only recent samples
      if (this.processingTimes.length > 100) {
        this.processingTimes.splice(0, this.processingTimes.length - 100);
      }
    }

    if (this.waitTimes.length > 0) {
      this.metrics.avgWaitTime = this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length;
      
      // Keep only recent samples
      if (this.waitTimes.length > 100) {
        this.waitTimes.splice(0, this.waitTimes.length - 100);
      }
    }

    // Update error rate
    const totalProcessed = this.metrics.totalProcessed + this.metrics.totalFailed;
    this.metrics.errorRate = totalProcessed > 0 ? this.metrics.totalFailed / totalProcessed : 0;

    // Update current load
    this.metrics.currentLoad = this.processing.size / this.config.concurrency;
  }

  /**
   * Emit event to registered handlers
   */
  private emitEvent(eventType: string, data: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Event handler error for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Helper methods
   */
  private getTotalQueueSize(): number {
    return Array.from(this.queues.values()).reduce((total, queue) => total + queue.length, 0);
  }

  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stop(false);
    this.clear();
    this.eventHandlers.clear();
  }
}