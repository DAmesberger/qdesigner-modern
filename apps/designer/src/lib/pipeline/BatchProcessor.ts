import type { 
  ResponseData, 
  BatchConfig,
  PipelineContext,
  PipelineError
} from './types';
import { getDataPipeline } from './DataPipeline';

export interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  errors: PipelineError[];
  progress: number;
  estimatedTimeRemaining?: number;
}

export interface BatchResult {
  jobId: string;
  successful: ResponseData[];
  failed: Array<{ data: ResponseData; error: Error }>;
  duration: number;
  averageProcessingTime: number;
}

export class BatchProcessor {
  private jobs: Map<string, BatchJob> = new Map();
  private queue: Array<{ jobId: string; data: ResponseData[] }> = [];
  private isProcessing: boolean = false;
  private config: BatchConfig;
  private pipeline = getDataPipeline();
  private abortControllers: Map<string, AbortController> = new Map();
  
  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      batchSize: 100,
      flushInterval: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      parallelism: 4,
      ...config
    };
  }
  
  // Create a new batch job
  createJob(data: ResponseData[]): string {
    const jobId = this.generateJobId();
    
    const job: BatchJob = {
      id: jobId,
      status: 'pending',
      createdAt: Date.now(),
      totalItems: data.length,
      processedItems: 0,
      failedItems: 0,
      errors: [],
      progress: 0
    };
    
    this.jobs.set(jobId, job);
    
    // Split data into chunks
    const chunks = this.chunkArray(data, this.config.batchSize);
    
    // Add chunks to queue
    chunks.forEach(chunk => {
      this.queue.push({ jobId, data: chunk });
    });
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return jobId;
  }
  
  // Get job status
  getJob(jobId: string): BatchJob | undefined {
    return this.jobs.get(jobId);
  }
  
  // Cancel a job
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return false;
    }
    
    // Abort any ongoing processing
    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
    }
    
    // Remove from queue
    this.queue = this.queue.filter(item => item.jobId !== jobId);
    
    // Update job status
    job.status = 'failed';
    job.completedAt = Date.now();
    job.errors.push({
      stage: 'batch-processor',
      error: new Error('Job cancelled by user'),
      timestamp: Date.now(),
      recovered: false
    });
    
    return true;
  }
  
  // Start processing queue
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      // Process in parallel based on config
      const batch = this.queue.splice(0, this.config.parallelism);
      
      await Promise.all(
        batch.map(item => this.processBatch(item.jobId, item.data))
      );
    }
    
    this.isProcessing = false;
  }
  
  // Process a single batch
  private async processBatch(
    jobId: string, 
    data: ResponseData[]
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    // Update job status
    if (job.status === 'pending') {
      job.status = 'processing';
      job.startedAt = Date.now();
    }
    
    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(jobId, abortController);
    
    const results: Array<{ success: boolean; error?: Error }> = [];
    
    // Process each item with retry logic
    for (const item of data) {
      if (abortController.signal.aborted) {
        break;
      }
      
      let lastError: Error | undefined;
      let success = false;
      
      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          await this.processItem(item, jobId);
          success = true;
          break;
        } catch (error) {
          lastError = error as Error;
          
          if (attempt < this.config.maxRetries - 1) {
            // Wait before retry
            await this.delay(this.config.retryDelay * Math.pow(2, attempt));
          }
        }
      }
      
      results.push({ success, error: lastError });
      
      // Update job progress
      job.processedItems++;
      if (!success && lastError) {
        job.failedItems++;
        job.errors.push({
          stage: 'batch-processor',
          error: lastError,
          timestamp: Date.now(),
          recovered: false
        });
      }
      
      job.progress = (job.processedItems / job.totalItems) * 100;
      
      // Estimate time remaining
      if (job.startedAt) {
        const elapsed = Date.now() - job.startedAt;
        const avgTime = elapsed / job.processedItems;
        const remaining = job.totalItems - job.processedItems;
        job.estimatedTimeRemaining = avgTime * remaining;
      }
    }
    
    // Clean up abort controller
    this.abortControllers.delete(jobId);
    
    // Check if job is complete
    if (job.processedItems >= job.totalItems) {
      job.status = job.failedItems === 0 ? 'completed' : 'failed';
      job.completedAt = Date.now();
    }
  }
  
  // Process a single item
  private async processItem(
    item: ResponseData,
    jobId: string
  ): Promise<void> {
    const context: PipelineContext = {
      sessionId: item.sessionId,
      questionnaireId: item.questionnaireId,
      participantId: item.participantId,
      timestamp: Date.now(),
      metadata: new Map([['batchJobId', jobId]]),
      errors: [],
      warnings: []
    };
    
    await this.pipeline.processResponse(item);
  }
  
  // Get batch results
  async getResults(jobId: string): Promise<BatchResult | null> {
    const job = this.jobs.get(jobId);
    
    if (!job || job.status !== 'completed') {
      return null;
    }
    
    const duration = job.completedAt! - job.startedAt!;
    const averageProcessingTime = duration / job.processedItems;
    
    return {
      jobId,
      successful: [], // Would need to track these
      failed: [], // Would need to track these
      duration,
      averageProcessingTime
    };
  }
  
  // Get all jobs
  getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }
  
  // Get active jobs
  getActiveJobs(): BatchJob[] {
    return this.getAllJobs().filter(
      job => job.status === 'pending' || job.status === 'processing'
    );
  }
  
  // Clean up completed jobs
  cleanupJobs(olderThan: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThan;
    let cleaned = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt < cutoff
      ) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  // Helper methods
  private generateJobId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Batch processor with scheduling
export class ScheduledBatchProcessor extends BatchProcessor {
  private schedules: Map<string, {
    pattern: string;
    nextRun: number;
    lastRun?: number;
    jobCreator: () => ResponseData[];
  }> = new Map();
  
  private intervalId: number | null = null;
  
  // Schedule a recurring batch job
  scheduleJob(
    id: string,
    pattern: string,
    jobCreator: () => ResponseData[]
  ): void {
    const nextRun = this.calculateNextRun(pattern);
    
    this.schedules.set(id, {
      pattern,
      nextRun,
      jobCreator
    });
    
    // Start scheduler if not running
    if (!this.intervalId) {
      this.startScheduler();
    }
  }
  
  // Remove scheduled job
  unscheduleJob(id: string): boolean {
    const result = this.schedules.delete(id);
    
    // Stop scheduler if no more jobs
    if (this.schedules.size === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    return result;
  }
  
  // Start the scheduler
  private startScheduler(): void {
    this.intervalId = window.setInterval(() => {
      this.checkScheduledJobs();
    }, 60000); // Check every minute
    
    // Also check immediately
    this.checkScheduledJobs();
  }
  
  // Check and run scheduled jobs
  private checkScheduledJobs(): void {
    const now = Date.now();
    
    for (const [id, schedule] of this.schedules.entries()) {
      if (now >= schedule.nextRun) {
        // Run the job
        try {
          const data = schedule.jobCreator();
          this.createJob(data);
          
          // Update schedule
          schedule.lastRun = now;
          schedule.nextRun = this.calculateNextRun(schedule.pattern, now);
        } catch (error) {
          console.error(`Failed to create scheduled job ${id}:`, error);
        }
      }
    }
  }
  
  // Calculate next run time based on pattern
  private calculateNextRun(pattern: string, from: number = Date.now()): number {
    // Simple interval patterns for now
    const intervals: Record<string, number> = {
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000
    };
    
    const interval = intervals[pattern];
    if (interval) {
      return from + interval;
    }
    
    // Default to daily
    return from + intervals.daily;
  }
}

// Create singleton instances
let batchProcessor: BatchProcessor | null = null;
let scheduledProcessor: ScheduledBatchProcessor | null = null;

export function getBatchProcessor(config?: Partial<BatchConfig>): BatchProcessor {
  if (!batchProcessor) {
    batchProcessor = new BatchProcessor(config);
  }
  return batchProcessor;
}

export function getScheduledBatchProcessor(
  config?: Partial<BatchConfig>
): ScheduledBatchProcessor {
  if (!scheduledProcessor) {
    scheduledProcessor = new ScheduledBatchProcessor(config);
  }
  return scheduledProcessor;
}