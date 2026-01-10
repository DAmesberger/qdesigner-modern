/**
 * Batch Processor
 * High-performance batch processing with progress tracking, error recovery, and parallel processing
 */

import type { 
  BatchJob, 
  BatchConfig, 
  BatchStatus, 
  BatchProgress, 
  BatchResult, 
  BatchError, 
  BatchProcessor as IBatchProcessor, 
  BatchContext,
  PipelineEvent
} from './types';
import { QueueManager } from './QueueManager';

export class BatchProcessor {
  private jobs = new Map<string, BatchJob>();
  private processors = new Map<string, IBatchProcessor<any, any>>();
  private queueManager: QueueManager;
  private eventHandlers = new Map<string, Function[]>();
  private defaultConfig: BatchConfig;

  constructor(config?: Partial<BatchConfig>) {
    this.defaultConfig = {
      batchSize: 100,
      maxConcurrency: 5,
      timeout: 30000,
      retryOnFailure: true,
      maxRetries: 3,
      retryDelay: 1000,
      stopOnError: false,
      parallelProcessing: true
    };

    Object.assign(this.defaultConfig, config);
    
    this.queueManager = new QueueManager({
      maxSize: 10000,
      concurrency: this.defaultConfig.maxConcurrency,
      timeout: this.defaultConfig.timeout,
      maxRetries: this.defaultConfig.maxRetries,
      retryDelay: this.defaultConfig.retryDelay
    });
  }

  /**
   * Register a batch processor
   */
  public registerProcessor<T, R>(processor: IBatchProcessor<T, R>): void {
    this.processors.set(processor.name, processor);
  }

  /**
   * Submit a batch job
   */
  public async submitJob<T>(
    name: string,
    type: string,
    data: T[],
    processorName: string,
    config?: Partial<BatchConfig>
  ): Promise<string> {
    const processor = this.processors.get(processorName);
    if (!processor) {
      throw new Error(`Processor '${processorName}' not found`);
    }

    const jobConfig: BatchConfig = { ...this.defaultConfig, ...config };
    
    // Validate batch size constraints
    if (processor.maxBatchSize && jobConfig.batchSize > processor.maxBatchSize) {
      jobConfig.batchSize = processor.maxBatchSize;
    }

    const job: BatchJob<T> = {
      id: this.generateJobId(),
      name,
      type: type as any,
      data,
      config: jobConfig,
      status: 'pending',
      progress: {
        total: data.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        percentage: 0
      },
      created: Date.now()
    };

    this.jobs.set(job.id, job);
    
    this.emitEvent('job.submitted', { job });

    // Start processing immediately if parallel processing is disabled
    if (!jobConfig.parallelProcessing) {
      await this.processJob(job, processor);
    } else {
      // Queue for parallel processing
      this.queueJobForProcessing(job, processor);
    }

    return job.id;
  }

  /**
   * Get job status
   */
  public getJob(jobId: string): BatchJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  public getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by status
   */
  public getJobsByStatus(status: BatchStatus): BatchJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  /**
   * Cancel a job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return false; // Cannot cancel completed jobs
    }

    job.status = 'failed';
    this.emitEvent('job.cancelled', { job });
    
    return true;
  }

  /**
   * Pause a job
   */
  public async pauseJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') {
      return false;
    }

    job.status = 'paused';
    this.emitEvent('job.paused', { job });
    
    return true;
  }

  /**
   * Resume a paused job
   */
  public async resumeJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') {
      return false;
    }

    const processor = this.findProcessorForJob(job);
    if (!processor) {
      return false;
    }

    job.status = 'running';
    this.emitEvent('job.resumed', { job });
    
    // Continue processing from where it left off
    await this.processJob(job, processor);
    
    return true;
  }

  /**
   * Clear completed and failed jobs
   */
  public clearCompletedJobs(): number {
    const completedJobs = Array.from(this.jobs.entries())
      .filter(([_, job]) => job.status === 'completed' || job.status === 'failed');
    
    completedJobs.forEach(([jobId, _]) => {
      this.jobs.delete(jobId);
    });

    this.emitEvent('jobs.cleared', { count: completedJobs.length });

    return completedJobs.length;
  }

  /**
   * Process a batch job
   */
  private async processJob<T, R>(
    job: BatchJob<T>,
    processor: IBatchProcessor<T, R>
  ): Promise<void> {
    if (job.status === 'failed') {
      return;
    }

    job.status = 'running';
    job.started = Date.now();
    
    const context: BatchContext = {
      job,
      batch: 0,
      totalBatches: Math.ceil(job.data.length / job.config.batchSize),
      startTime: job.started,
      metadata: {}
    };

    this.emitEvent('job.started', { job, context });

    try {
      const errors: BatchError[] = [];
      const results: R[] = [];
      
      // Split data into batches
      const batches = this.createBatches(job.data, job.config.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const currentStatus = (job as BatchJob<T>).status;
        if (currentStatus === 'failed' || currentStatus === 'paused') {
          break;
        }

        context.batch = i + 1;
        
        try {
          const currentBatch = batches[i];
          if (!currentBatch) continue;

          const batchResults = await this.processBatch(
            currentBatch, 
            processor, 
            context, 
            i
          );
          
          results.push(...batchResults);
          job.progress.succeeded += batchResults.length;
          
        } catch (error: any) {
          const failedBatch = batches[i] || [];
          const batchErrors = this.createBatchErrors(failedBatch, i, error.message);
          errors.push(...batchErrors);
          job.progress.failed += failedBatch.length;
          
          if (job.config.stopOnError) {
            break;
          }
        }

        job.progress.processed = job.progress.succeeded + job.progress.failed;
        job.progress.percentage = (job.progress.processed / job.progress.total) * 100;
        
        // Update estimated time remaining
        const elapsed = Date.now() - job.started!;
        const rate = job.progress.processed / elapsed;
        const remaining = job.progress.total - job.progress.processed;
        job.progress.estimatedTimeRemaining = remaining / rate;
        job.progress.currentBatch = i + 1;
        job.progress.batchProgress = 100; // Batch completed

        this.emitEvent('job.progress', { job, context, batch: i + 1 });
      }

      // Finalize job
      job.completed = Date.now();
      
      const totalProcessed = job.progress.processed;
      const isSuccess = errors.length === 0 || 
                       (job.progress.succeeded > 0 && !job.config.stopOnError);

      job.status = isSuccess ? 'completed' : 'failed';
      
      job.result = {
        success: isSuccess,
        totalItems: job.data.length,
        processedItems: totalProcessed,
        successfulItems: job.progress.succeeded,
        failedItems: job.progress.failed,
        duration: job.completed - job.started!,
        throughput: totalProcessed / ((job.completed - job.started!) / 1000),
        errors,
        warnings: [],
        data: results
      };

      this.emitEvent(
        isSuccess ? 'job.completed' : 'job.failed', 
        { job, result: job.result }
      );

    } catch (error: any) {
      job.status = 'failed';
      job.completed = Date.now();
      
      job.result = {
        success: false,
        totalItems: job.data.length,
        processedItems: job.progress.processed,
        successfulItems: job.progress.succeeded,
        failedItems: job.progress.failed,
        duration: job.completed - job.started!,
        throughput: 0,
        errors: [{
          itemId: 'job',
          batch: 0,
          attempt: 1,
          error: error.message,
          timestamp: Date.now()
        }],
        warnings: []
      };

      this.emitEvent('job.failed', { job, error: (error as any).message });
    }
  }

  /**
   * Process a single batch
   */
  private async processBatch<T, R>(
    items: T[],
    processor: IBatchProcessor<T, R>,
    context: BatchContext,
    batchIndex: number
  ): Promise<R[]> {
    const batchStartTime = Date.now();
    
    this.emitEvent('batch.started', { 
      context, 
      batchIndex, 
      itemCount: items.length 
    });

    try {
      // Check if processor supports these items
      const supportedItems = items.filter(item => processor.supports(item));
      const unsupportedItems = items.filter(item => !processor.supports(item));

      if (unsupportedItems.length > 0) {
        console.warn(`${unsupportedItems.length} items not supported by processor`);
      }

      // Process supported items
      const results = await this.executeWithTimeout(
        () => processor.process(supportedItems, context),
        processor.timeout || context.job.config.timeout
      );

      const batchDuration = Date.now() - batchStartTime;
      
      this.emitEvent('batch.completed', { 
        context, 
        batchIndex, 
        results, 
        duration: batchDuration 
      });

      return results;

    } catch (error: any) {
      const batchDuration = Date.now() - batchStartTime;
      
      this.emitEvent('batch.failed', { 
        context, 
        batchIndex, 
        error: error.message, 
        duration: batchDuration 
      });

      // Retry logic
      if (context.job.config.retryOnFailure && context.job.config.maxRetries > 0) {
        return await this.retryBatch(items, processor, context, batchIndex, 1);
      }

      throw error;
    }
  }

  /**
   * Retry failed batch processing
   */
  private async retryBatch<T, R>(
    items: T[],
    processor: IBatchProcessor<T, R>,
    context: BatchContext,
    batchIndex: number,
    attempt: number
  ): Promise<R[]> {
    if (attempt > context.job.config.maxRetries) {
      throw new Error(`Batch ${batchIndex} failed after ${context.job.config.maxRetries} retries`);
    }

    // Wait before retry
    await this.sleep(context.job.config.retryDelay * attempt);

    this.emitEvent('batch.retry', { 
      context, 
      batchIndex, 
      attempt 
    });

    try {
      const results = await this.executeWithTimeout(
        () => processor.process(items, context),
        processor.timeout || context.job.config.timeout
      );

      this.emitEvent('batch.retry.success', { 
        context, 
        batchIndex, 
        attempt, 
        results 
      });

      return results;

    } catch (error: any) {
      this.emitEvent('batch.retry.failed', { 
        context, 
        batchIndex, 
        attempt, 
        error: error.message 
      });

      return await this.retryBatch(items, processor, context, batchIndex, attempt + 1);
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>, 
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Processing timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Queue job for parallel processing
   */
  private queueJobForProcessing<T, R>(
    job: BatchJob<T>, 
    processor: IBatchProcessor<T, R>
  ): void {
    this.queueManager.enqueue(
      { job, processor },
      job.config.maxConcurrency || 0, // Higher concurrency = higher priority
      {
        timeout: job.config.timeout,
        maxRetries: job.config.maxRetries
      }
    ).then(queueItemId => {
      // Track queue item ID for potential cancellation
      job.metadata = { ...job.metadata, queueItemId };
    });
  }

  /**
   * Event handling
   */
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  public off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

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
  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  private createBatchErrors<T>(
    items: T[], 
    batchIndex: number, 
    errorMessage: string
  ): BatchError[] {
    return items.map((_, itemIndex) => ({
      itemId: `batch_${batchIndex}_item_${itemIndex}`,
      batch: batchIndex,
      attempt: 1,
      error: errorMessage,
      timestamp: Date.now()
    }));
  }

  private findProcessorForJob(job: BatchJob): IBatchProcessor<any, any> | null {
    // This would need more sophisticated logic in a real implementation
    // For now, we assume the processor name is stored in job metadata
    const processorName = job.metadata?.processorName;
    return processorName ? this.processors.get(processorName) || null : null;
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processor statistics
   */
  public getProcessorStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, processor] of this.processors) {
      const jobs = Array.from(this.jobs.values())
        .filter(job => job.metadata?.processorName === name);
      
      stats[name] = {
        totalJobs: jobs.length,
        completedJobs: jobs.filter(j => j.status === 'completed').length,
        failedJobs: jobs.filter(j => j.status === 'failed').length,
        runningJobs: jobs.filter(j => j.status === 'running').length,
        avgProcessingTime: this.calculateAvgProcessingTime(jobs)
      };
    }
    
    return stats;
  }

  private calculateAvgProcessingTime(jobs: BatchJob[]): number {
    const completedJobs = jobs.filter(j => j.completed && j.started);
    if (completedJobs.length === 0) return 0;
    
    const totalTime = completedJobs.reduce((sum, job) => 
      sum + (job.completed! - job.started!), 0
    );
    
    return totalTime / completedJobs.length;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // Cancel all running jobs
    const runningJobs = this.getJobsByStatus('running');
    runningJobs.forEach(job => this.cancelJob(job.id));
    
    this.jobs.clear();
    this.processors.clear();
    this.eventHandlers.clear();
    this.queueManager.destroy();
  }
}