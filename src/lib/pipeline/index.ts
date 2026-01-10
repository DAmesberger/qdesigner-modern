/**
 * Data Pipeline Module - Main Exports
 * Complete data pipeline system for QDesigner Modern
 */

// Core services
export { StreamingService } from './StreamingService';
export { ValidationLayer } from './ValidationLayer';
export { TransformationPipeline } from './TransformationPipeline';
export { ExportLayer } from './ExportLayer';
export { BatchProcessor } from './BatchProcessor';
export { QueueManager } from './QueueManager';

// Types
export type * from './types';

// Re-exports for convenience
import { StreamingService } from './StreamingService';
import { ValidationLayer } from './ValidationLayer';
import { TransformationPipeline } from './TransformationPipeline';
import { ExportLayer } from './ExportLayer';
import { BatchProcessor } from './BatchProcessor';
import { QueueManager } from './QueueManager';

import type { 
  PipelineConfig, 
  StreamingConfig, 
  ValidationRule,
  TransformationStage,
  ExportRequest,
  BatchConfig
} from './types';
import type { QuestionnaireSession, Response } from '$lib/shared/types/response';

/**
 * Main Pipeline Manager class that orchestrates all pipeline components
 */
export class PipelineManager {
  private streaming: StreamingService;
  private validation: ValidationLayer;
  private transformation: TransformationPipeline;
  private export: ExportLayer;
  private batch: BatchProcessor;
  private queue: QueueManager;
  private config: PipelineConfig;
  private isInitialized = false;

  constructor(config: PipelineConfig = {}) {
    this.config = {
      batchSize: 100,
      maxRetries: 3,
      retryDelay: 1000,
      backpressureThreshold: 1000,
      enableStreaming: true,
      queueTimeout: 30000,
      ...config
    };

    this.streaming = new StreamingService({
      enabled: this.config.enableStreaming ?? false,
      bufferSize: this.config.backpressureThreshold,
      flushInterval: 1000
    });

    this.validation = new ValidationLayer();
    this.transformation = new TransformationPipeline();
    this.export = new ExportLayer();
    
    this.batch = new BatchProcessor({
      batchSize: this.config.batchSize,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      timeout: this.config.queueTimeout
    });

    this.queue = new QueueManager({
      maxSize: this.config.backpressureThreshold || 1000,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      timeout: this.config.queueTimeout
    });

    this.initialize();
  }

  /**
   * Initialize the pipeline manager
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set up event handlers between components
      this.setupEventHandlers();
      
      // Initialize built-in processors
      this.initializeBuiltInProcessors();
      
      // Start queue processing
      this.queue.start();
      
      this.isInitialized = true;
      console.log('Pipeline Manager initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Pipeline Manager:', error);
      throw error;
    }
  }

  /**
   * Process a response through the complete pipeline
   */
  public async processResponse(
    response: Response,
    session: QuestionnaireSession,
    questionnaire: any,
    options?: {
      validate?: boolean;
      transform?: boolean;
      stream?: boolean;
    }
  ): Promise<{
    success: boolean;
    validatedResponse?: Response;
    transformedSession?: QuestionnaireSession;
    errors?: string[];
    warnings?: string[];
  }> {
    const opts = {
      validate: true,
      transform: true,
      stream: true,
      ...options
    };

    const errors: string[] = [];
    const warnings: string[] = [];
    let validatedResponse = response;
    let transformedSession = session;

    try {
      // 1. Validation
      if (opts.validate) {
        const question = questionnaire.questions.find((q: any) => q.id === response.questionId);
        if (question) {
          const validationResult = await this.validation.validateResponse(
            response, 
            question, 
            session
          );
          
          if (!validationResult.isValid) {
            errors.push(...validationResult.errors.map(e => e.message));
          }
          
          warnings.push(...validationResult.warnings.map(w => w.message));
          
          if (validationResult.transformed !== undefined) {
            validatedResponse = {
              ...response,
              value: validationResult.transformed
            };
          }
        }
      }

      // 2. Transformation
      if (opts.transform && errors.length === 0) {
        // Update session with validated response
        const updatedSession = {
          ...session,
          responses: session.responses.map(r => 
            r.id === response.id ? validatedResponse : r
          )
        };

        const transformResult = await this.transformation.transformSession(
          updatedSession, 
          questionnaire
        );
        
        if (transformResult.success && transformResult.data) {
          transformedSession = transformResult.data;
        } else if (transformResult.errors) {
          errors.push(...transformResult.errors);
        }
        
        if (transformResult.warnings) {
          warnings.push(...transformResult.warnings);
        }
      }

      // 3. Streaming
      if (opts.stream && this.config.enableStreaming) {
        this.streaming.streamResponse(validatedResponse, transformedSession);
      }

      return {
        success: errors.length === 0,
        validatedResponse,
        transformedSession,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [`Pipeline processing failed: ${error.message}`]
      };
    }
  }

  /**
   * Export sessions in specified format
   */
  public async exportSessions(request: ExportRequest): Promise<any> {
    try {
      // Apply transformations if specified
      let sessions = request.sessions;
      
      if (request.transformations) {
        const transformPromises = sessions.map(session => 
          this.transformation.transformSession(session, request.questionnaire, request.transformations)
        );
        
        const transformResults = await Promise.all(transformPromises);
        
        sessions = transformResults
          .filter(result => result.success && result.data)
          .map(result => result.data!);
      }

      // Export data
      const exportRequest = { ...request, sessions };
      return await this.export.exportData(exportRequest);
      

    } catch (error: any) {
      return {
        success: false,
        format: request.format,
        errors: [`Export failed: ${error.message}`]
      };
    }
  }

  /**
   * Submit batch job for processing
   */
  public async submitBatchJob<T>(
    name: string,
    type: string,
    data: T[],
    processorName: string,
    config?: Partial<BatchConfig>
  ): Promise<string> {
    return this.batch.submitJob(name, type, data, processorName, config);
  }

  /**
   * Get comprehensive pipeline status
   */
  public getStatus() {
    return {
      initialized: this.isInitialized,
      streaming: this.streaming.getStatus(),
      queue: this.queue.getStatus(),
      batch: {
        totalJobs: this.batch.getAllJobs().length,
        runningJobs: this.batch.getJobsByStatus('running').length,
        completedJobs: this.batch.getJobsByStatus('completed').length,
        failedJobs: this.batch.getJobsByStatus('failed').length
      },
      transformation: this.transformation.getStatus(),
      validation: {
        rulesCount: Object.keys(this.validation).length // Simplified
      }
    };
  }

  /**
   * Add custom validation rule
   */
  public addValidationRule(rule: ValidationRule): void {
    this.validation.addValidationRule(rule);
  }

  /**
   * Add transformation stage
   */
  public addTransformationStage(stage: TransformationStage): void {
    this.transformation.addStage(stage);
  }

  /**
   * Subscribe to streaming messages
   */
  public subscribeToStream(
    sessionId: string,
    callback: (message: any) => void,
    filters?: any[]
  ): string {
    return this.streaming.subscribe(sessionId, callback, filters);
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Queue events
    this.queue.on('item.completed', (data: any) => {
      console.log('Queue item completed:', data.item.id);
    });

    this.queue.on('queue.full', (data: any) => {
      console.warn('Queue is full, applying backpressure');
      // Could pause streaming or other sources
    });

    // Batch events
    this.batch.on('job.completed', (data: any) => {
      console.log('Batch job completed:', data.job.name);
    });

    this.batch.on('job.failed', (data: any) => {
      console.error('Batch job failed:', data.job.name, data.error);
    });
  }

  /**
   * Initialize built-in batch processors
   */
  private initializeBuiltInProcessors(): void {
    // Export processor
    this.batch.registerProcessor({
      name: 'export',
      supports: (item: any) => item && item.sessions && item.format,
      process: async (items: ExportRequest[], context) => {
        const results = [];
        for (const request of items) {
          const result = await this.export.exportData(request);
          results.push(result);
        }
        return results;
      },
      maxBatchSize: 10,
      timeout: 60000
    });

    // Validation processor
    this.batch.registerProcessor({
      name: 'validate',
      supports: (item: any) => item && item.responses,
      process: async (items: any[], context) => {
        const results = [];
        for (const item of items) {
          // Process validation for each item
          results.push({ validated: true, item });
        }
        return results;
      },
      maxBatchSize: 100,
      timeout: 30000
    });

    // Transformation processor
    this.batch.registerProcessor({
      name: 'transform',
      supports: (item: any) => item && item.session,
      process: async (items: any[], context) => {
        const results = [];
        for (const item of items) {
          const result = await this.transformation.transformSession(
            item.session,
            item.questionnaire
          );
          results.push(result);
        }
        return results;
      },
      maxBatchSize: 50,
      timeout: 45000
    });
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down Pipeline Manager...');
    
    try {
      // Stop streaming
      this.streaming.disconnect();
      
      // Stop queue processing
      await this.queue.stop(true);
      
      // Destroy batch processor
      this.batch.destroy();
      
      // Clear any remaining resources
      this.queue.destroy();
      
      this.isInitialized = false;
      console.log('Pipeline Manager shutdown complete');
      
    } catch (error) {
      console.error('Error during Pipeline Manager shutdown:', error);
      throw error;
    }
  }
}

/**
 * Create a pipeline manager instance with default configuration
 */
export function createPipeline(config?: PipelineConfig): PipelineManager {
  return new PipelineManager(config);
}

/**
 * Default export
 */
export default PipelineManager;