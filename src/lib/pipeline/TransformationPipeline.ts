/**
 * Transformation Pipeline
 * Data normalization, computed variables, aggregation, and custom transformers
 */

import type {
  TransformationPipeline as IPipeline,
  TransformationStage,
  Transformer,
  TransformationResult,
  TransformationContext,
  ComputedVariable,
  AggregationConfig,
  AggregationFunction,
  FilterConfig
} from './types';
import type { QuestionnaireSession, Response, QuestionnaireMetadata } from '$lib/shared/types/response';
import { VariableEngine } from '$lib/scripting-engine';

export class TransformationPipeline {
  private stages: TransformationStage[] = [];
  private transformers = new Map<string, Transformer>();
  private variableEngine: VariableEngine;
  private computedVariables = new Map<string, ComputedVariable>();

  constructor() {
    this.variableEngine = new VariableEngine();
    this.initializeBuiltInTransformers();
  }

  /**
   * Add transformation stage to pipeline
   */
  public addStage(stage: TransformationStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  /**
   * Remove transformation stage
   */
  public removeStage(name: string): boolean {
    const index = this.stages.findIndex(stage => stage.name === name);
    if (index >= 0) {
      this.stages.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Register custom transformer
   */
  public registerTransformer(transformer: Transformer): void {
    this.transformers.set(transformer.name, transformer);
  }

  /**
   * Transform questionnaire session data
   */
  public async transformSession(
    session: QuestionnaireSession,
    questionnaire: QuestionnaireMetadata,
    pipeline?: IPipeline
  ): Promise<TransformationResult> {
    const context: TransformationContext = {
      questionnaire,
      session,
      pipeline: pipeline || { stages: this.stages },
      stage: 0,
      metadata: {
        startTime: Date.now(),
        sessionId: session.id
      }
    };

    try {
      let transformedData = { ...session };
      const errors: string[] = [];
      const warnings: string[] = [];
      const metadata: Record<string, any> = {};

      const stagesToRun = pipeline?.stages || this.stages;

      for (let i = 0; i < stagesToRun.length; i++) {
        const stage = stagesToRun[i]!;
        context.stage = i;

        // Check stage condition
        if (stage.condition && !stage.condition(transformedData, context)) {
          continue;
        }

        const stageResult = await this.executeStage(stage, transformedData, context);

        if (!stageResult.success) {
          errors.push(...(stageResult.errors || []));
          
          if (pipeline?.stopOnError) {
            break;
          }
        }

        if (stageResult.warnings) {
          warnings.push(...stageResult.warnings);
        }

        if (stageResult.data) {
          transformedData = stageResult.data;
        }

        if (stageResult.metadata) {
          Object.assign(metadata, stageResult.metadata);
        }
      }

      return {
        success: errors.length === 0,
        data: transformedData,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: {
          ...metadata,
          processingTime: Date.now() - context.metadata!.startTime,
          stagesExecuted: context.stage + 1
        }
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [`Pipeline execution failed: ${error.message}`],
        metadata: {
          processingTime: Date.now() - context.metadata!.startTime,
          stagesExecuted: context.stage
        }
      };
    }
  }

  /**
   * Transform multiple sessions in parallel
   */
  public async transformSessions(
    sessions: QuestionnaireSession[],
    questionnaire: QuestionnaireMetadata,
    pipeline?: IPipeline,
    maxConcurrency: number = 5
  ): Promise<TransformationResult[]> {
    const results: TransformationResult[] = [];
    const chunks = this.chunkArray(sessions, maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(session => 
        this.transformSession(session, questionnaire, pipeline)
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            errors: [`Transformation failed: ${result.reason}`]
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute individual transformation stage
   */
  private async executeStage(
    stage: TransformationStage,
    data: any,
    context: TransformationContext
  ): Promise<TransformationResult> {
    const transformer = this.transformers.get(stage.transformer.name);
    
    if (!transformer) {
      return {
        success: false,
        errors: [`Transformer '${stage.transformer.name}' not found`]
      };
    }

    if (!transformer.supports(data)) {
      return {
        success: false,
        errors: [`Transformer '${transformer.name}' does not support this data type`]
      };
    }

    try {
      return await transformer.transform(data, context);
    } catch (error: any) {
      return {
        success: false,
        errors: [`Stage '${stage.name}' failed: ${error.message}`]
      };
    }
  }

  /**
   * Initialize built-in transformers
   */
  private initializeBuiltInTransformers(): void {
    // Data normalization transformer
    this.registerTransformer({
      name: 'normalize',
      supports: (data: any) => data && typeof data === 'object',
      transform: async (data: QuestionnaireSession, context: TransformationContext) => {
        return this.normalizeData(data, context);
      }
    } as Transformer);

    // Computed variables transformer
    this.registerTransformer({
      name: 'compute',
      supports: (data: any) => data && data.responses && Array.isArray(data.responses),
      transform: async (data: QuestionnaireSession, context: TransformationContext) => {
        return this.computeVariables(data, context);
      }
    } as Transformer);

    // Aggregation transformer
    this.registerTransformer({
      name: 'aggregate',
      supports: (data: any) => data && data.responses && Array.isArray(data.responses),
      transform: async (data: QuestionnaireSession, context: TransformationContext) => {
        return this.aggregateData(data, context);
      }
    } as Transformer);

    // Response filtering transformer
    this.registerTransformer({
      name: 'filter',
      supports: (data: any) => data && data.responses && Array.isArray(data.responses),
      transform: async (data: QuestionnaireSession, context: TransformationContext) => {
        return this.filterResponses(data, context);
      }
    } as Transformer);

    // Data cleaning transformer
    this.registerTransformer({
      name: 'clean',
      supports: (data: any) => data && typeof data === 'object',
      transform: async (data: QuestionnaireSession, context: TransformationContext) => {
        return this.cleanData(data, context);
      }
    } as Transformer);
  }

  /**
   * Normalize data (standardize formats, handle missing values, etc.)
   */
  private async normalizeData(
    session: QuestionnaireSession,
    context: TransformationContext
  ): Promise<TransformationResult> {
    const normalized = { ...session };
    const warnings: string[] = [];

    try {
      // Normalize timestamps
      normalized.responses = session.responses.map(response => ({
        ...response,
        timestamp: this.normalizeTimestamp(response.timestamp),
        reactionTime: response.reactionTime ? Math.round(response.reactionTime * 1000) / 1000 : undefined
      }));

      // Normalize response values
      normalized.responses = normalized.responses.map(response => {
        const question = context.questionnaire.questions.find(q => q.id === response.questionId);
        if (question) {
          return {
            ...response,
            value: this.normalizeResponseValue(response.value, question.type)
          };
        }
        return response;
      });

      // Handle missing values
      const missingCount = normalized.responses.filter(r => r.value === null || r.value === undefined).length;
      if (missingCount > 0) {
        warnings.push(`${missingCount} responses have missing values`);
      }

      return {
        success: true,
        data: normalized,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: {
          normalizedResponses: normalized.responses.length,
          missingValues: missingCount
        }
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [`Normalization failed: ${error.message}`]
      };
    }
  }

  /**
   * Compute derived variables
   */
  private async computeVariables(
    session: QuestionnaireSession,
    context: TransformationContext
  ): Promise<TransformationResult> {
    const enhanced = { ...session };
    const computed: Record<string, any> = {};
    const errors: string[] = [];

    try {
      // Create variable context for computation
      const variableContext = this.createVariableContext(session);

      for (const variable of this.computedVariables.values()) {
        try {
          const result = await this.variableEngine.evaluate(variable.formula, variableContext);
          computed[variable.name] = result;
        } catch (error: any) {
          errors.push(`Failed to compute variable '${variable.name}': ${error.message}`);
        }
      }

      // Add computed variables to session metadata
      enhanced.metadata = {
        ...enhanced.metadata,
        computedVariables: computed
      };

      return {
        success: errors.length === 0,
        data: enhanced,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          computedVariables: Object.keys(computed).length
        }
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [`Variable computation failed: ${error.message}`]
      };
    }
  }

  /**
   * Aggregate response data
   */
  private async aggregateData(
    session: QuestionnaireSession,
    context: TransformationContext
  ): Promise<TransformationResult> {
    // This would implement aggregation logic
    // For now, return basic aggregations
    const aggregated = { ...session };
    
    const responseCount = session.responses.length;
    const avgReactionTime = this.calculateAverageReactionTime(session.responses);
    const completionRate = this.calculateCompletionRate(session, context.questionnaire);

    aggregated.metadata = {
      ...aggregated.metadata,
      aggregations: {
        responseCount,
        avgReactionTime,
        completionRate,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.endTime ? session.endTime - session.startTime : undefined
      }
    };

    return {
      success: true,
      data: aggregated,
      metadata: {
        aggregationsComputed: 4
      }
    };
  }

  /**
   * Filter responses based on criteria
   */
  private async filterResponses(
    session: QuestionnaireSession,
    context: TransformationContext
  ): Promise<TransformationResult> {
    const filtered = { ...session };
    let originalCount = session.responses.length;

    // Example filters - these would be configurable
    filtered.responses = session.responses.filter(response => {
      // Filter out invalid responses
      if (!response.valid) {
        return false;
      }

      // Filter out responses with extreme reaction times
      if (response.reactionTime && (response.reactionTime < 50 || response.reactionTime > 10000)) {
        return false;
      }

      return true;
    });

    const filteredCount = originalCount - filtered.responses.length;

    return {
      success: true,
      data: filtered,
      warnings: filteredCount > 0 ? [`Filtered out ${filteredCount} responses`] : undefined,
      metadata: {
        originalCount,
        filteredCount,
        remainingCount: filtered.responses.length
      }
    };
  }

  /**
   * Clean data (remove duplicates, fix formatting, etc.)
   */
  private async cleanData(
    session: QuestionnaireSession,
    context: TransformationContext
  ): Promise<TransformationResult> {
    const cleaned = { ...session };
    const warnings: string[] = [];

    // Remove duplicate responses (keep the last one)
    const responseMap = new Map<string, Response>();
    
    for (const response of session.responses) {
      const key = `${response.questionId}_${response.pageId || ''}`;
      if (responseMap.has(key)) {
        warnings.push(`Duplicate response found for question ${response.questionId}`);
      }
      responseMap.set(key, response);
    }

    cleaned.responses = Array.from(responseMap.values());

    // Sort responses by timestamp
    cleaned.responses.sort((a, b) => a.timestamp - b.timestamp);

    return {
      success: true,
      data: cleaned,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        duplicatesRemoved: session.responses.length - cleaned.responses.length,
        finalCount: cleaned.responses.length
      }
    };
  }

  /**
   * Add computed variable definition
   */
  public addComputedVariable(variable: ComputedVariable): void {
    this.computedVariables.set(variable.id, variable);
  }

  /**
   * Remove computed variable definition
   */
  public removeComputedVariable(id: string): boolean {
    return this.computedVariables.delete(id);
  }

  /**
   * Helper methods
   */
  private normalizeTimestamp(timestamp: number): number {
    // Ensure timestamp is in milliseconds
    if (timestamp < 1e12) {
      return timestamp * 1000;
    }
    return timestamp;
  }

  private normalizeResponseValue(value: any, questionType: string): any {
    switch (questionType) {
      case 'scale':
      case 'rating':
        return typeof value === 'string' ? parseFloat(value) : value;
      
      case 'multiple-choice':
        return Array.isArray(value) ? value : [value];
      
      case 'text-input':
        return typeof value === 'string' ? value.trim() : String(value);
      
      default:
        return value;
    }
  }

  private createVariableContext(session: QuestionnaireSession): Record<string, any> {
    const context: Record<string, any> = {};

    // Add all response values to context
    for (const response of session.responses) {
      const question = session.responses.find(r => r.questionId === response.questionId);
      if (question) {
        context[response.questionId] = response.value;
      }
    }

    // Add session-level variables
    context.sessionId = session.id;
    context.startTime = session.startTime;
    context.endTime = session.endTime;
    context.duration = session.endTime ? session.endTime - session.startTime : null;

    return context;
  }

  private calculateAverageReactionTime(responses: Response[]): number | null {
    const reactionTimes = responses
      .map(r => r.reactionTime)
      .filter((rt): rt is number => rt !== undefined && rt !== null);

    if (reactionTimes.length === 0) {
      return null;
    }

    return reactionTimes.reduce((sum, rt) => sum + rt, 0) / reactionTimes.length;
  }

  private calculateCompletionRate(
    session: QuestionnaireSession, 
    questionnaire: QuestionnaireMetadata
  ): number {
    const totalQuestions = questionnaire.questions.length;
    const answeredQuestions = new Set(session.responses.map(r => r.questionId)).size;
    
    return totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get pipeline status
   */
  public getStatus() {
    return {
      stages: this.stages.length,
      transformers: this.transformers.size,
      computedVariables: this.computedVariables.size
    };
  }
}