import type { 
  PipelineStage, 
  PipelineContext, 
  ResponseData, 
  PipelineMetrics,
  BatchConfig,
  StreamConfig
} from './types';

export class DataPipeline {
  private stages: Map<string, PipelineStage> = new Map();
  private metrics: PipelineMetrics;
  private isRunning: boolean = false;
  private batchConfig: BatchConfig;
  private streamConfig: StreamConfig;
  private responseBuffer: ResponseData[] = [];
  private flushTimer: number | null = null;
  
  constructor(
    batchConfig: Partial<BatchConfig> = {},
    streamConfig: Partial<StreamConfig> = {}
  ) {
    this.batchConfig = {
      batchSize: 100,
      flushInterval: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      parallelism: 4,
      ...batchConfig
    };
    
    this.streamConfig = {
      bufferSize: 1000,
      backpressureThreshold: 0.8,
      timeout: 30000,
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      ...streamConfig
    };
    
    this.metrics = {
      processed: 0,
      failed: 0,
      latency: [],
      throughput: 0,
      errors: [],
      startTime: Date.now()
    };
  }
  
  // Register a pipeline stage
  addStage(stage: PipelineStage): void {
    this.stages.set(stage.id, stage);
  }
  
  // Remove a pipeline stage
  removeStage(stageId: string): boolean {
    return this.stages.delete(stageId);
  }
  
  // Process a single response through the pipeline
  async processResponse(response: ResponseData): Promise<void> {
    const context: PipelineContext = {
      sessionId: response.sessionId,
      questionnaireId: response.questionnaireId,
      participantId: response.participantId,
      timestamp: Date.now(),
      metadata: new Map(),
      errors: [],
      warnings: []
    };
    
    const startTime = performance.now();
    
    try {
      let data: any = response;
      
      // Sort stages by priority
      const sortedStages = Array.from(this.stages.values())
        .filter(stage => stage.enabled !== false)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      // Process through each stage
      for (const stage of sortedStages) {
        try {
          data = await stage.process(data, context);
        } catch (error) {
          const pipelineError = {
            stage: stage.id,
            error: error as Error,
            timestamp: Date.now(),
            recovered: false
          };
          
          context.errors.push(pipelineError);
          
          if (stage.onError) {
            await stage.onError(error as Error, data, context);
            pipelineError.recovered = true;
          } else {
            throw error;
          }
        }
      }
      
      this.metrics.processed++;
      
    } catch (error) {
      this.metrics.failed++;
      this.metrics.errors.push({
        stage: 'pipeline',
        error: error as Error,
        timestamp: Date.now(),
        recovered: false
      });
      
      throw error;
    } finally {
      const latency = performance.now() - startTime;
      this.metrics.latency.push(latency);
      
      // Keep only last 1000 latency measurements
      if (this.metrics.latency.length > 1000) {
        this.metrics.latency = this.metrics.latency.slice(-1000);
      }
      
      this.updateThroughput();
    }
  }
  
  // Add response to buffer for batch processing
  async addToBatch(response: ResponseData): Promise<void> {
    this.responseBuffer.push(response);
    
    // Check if we should flush
    if (this.responseBuffer.length >= this.batchConfig.batchSize) {
      await this.flushBatch();
    } else if (!this.flushTimer) {
      // Start flush timer
      this.flushTimer = window.setTimeout(() => {
        this.flushBatch();
      }, this.batchConfig.flushInterval);
    }
  }
  
  // Process buffered responses
  async flushBatch(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.responseBuffer.length === 0) {
      return;
    }
    
    const batch = this.responseBuffer.splice(0, this.batchConfig.batchSize);
    
    // Process batch with parallelism
    const chunks = this.chunkArray(batch, this.batchConfig.parallelism);
    
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(response => this.processResponse(response))
      );
    }
    
    // If there are more items, schedule next flush
    if (this.responseBuffer.length > 0) {
      this.flushTimer = window.setTimeout(() => {
        this.flushBatch();
      }, this.batchConfig.flushInterval);
    }
  }
  
  // Start the pipeline
  start(): void {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.metrics.startTime = Date.now();
  }
  
  // Stop the pipeline
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Flush any remaining data
    await this.flushBatch();
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
  
  // Get pipeline metrics
  getMetrics(): PipelineMetrics {
    return {
      ...this.metrics,
      lastProcessed: Date.now()
    };
  }
  
  // Get average latency
  getAverageLatency(): number {
    if (this.metrics.latency.length === 0) {
      return 0;
    }
    
    const sum = this.metrics.latency.reduce((a, b) => a + b, 0);
    return sum / this.metrics.latency.length;
  }
  
  // Get processing rate
  getProcessingRate(): number {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000; // seconds
    return elapsed > 0 ? this.metrics.processed / elapsed : 0;
  }
  
  // Check if pipeline is healthy
  isHealthy(): boolean {
    const errorRate = this.metrics.processed > 0 
      ? this.metrics.failed / this.metrics.processed 
      : 0;
      
    const avgLatency = this.getAverageLatency();
    
    return (
      this.isRunning &&
      errorRate < 0.05 && // Less than 5% error rate
      avgLatency < 1000 && // Less than 1 second average latency
      this.responseBuffer.length < this.streamConfig.bufferSize * this.streamConfig.backpressureThreshold
    );
  }
  
  // Private helper methods
  private updateThroughput(): void {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    this.metrics.throughput = elapsed > 0 ? this.metrics.processed / elapsed : 0;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Singleton instance
let dataPipeline: DataPipeline | null = null;

export function getDataPipeline(
  batchConfig?: Partial<BatchConfig>,
  streamConfig?: Partial<StreamConfig>
): DataPipeline {
  if (!dataPipeline) {
    dataPipeline = new DataPipeline(batchConfig, streamConfig);
  }
  return dataPipeline;
}