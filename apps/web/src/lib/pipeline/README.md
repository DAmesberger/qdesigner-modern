# Data Pipeline Module

A comprehensive data pipeline system for QDesigner Modern that handles real-time response streaming, data validation, transformation, and export functionality with advanced queue management and batch processing capabilities.

## Overview

The pipeline module provides:

- **Real-time Response Streaming**: WebSocket-based streaming with backpressure handling
- **Data Validation Layer**: Schema validation, type checking, and custom validation rules
- **Transformation Pipeline**: Data normalization, computed variables, and aggregation functions
- **Export Layer**: Multiple format support (CSV, SPSS, R, Excel, JSON)
- **Batch Processing**: Parallel processing with progress tracking and error recovery
- **Queue Management**: Priority queues with retry logic and backpressure handling

## Quick Start

```typescript
import { PipelineManager, createPipeline } from '$lib/pipeline';

// Create pipeline with default configuration
const pipeline = createPipeline({
  enableStreaming: true,
  batchSize: 100,
  maxRetries: 3
});

// Process a response
const result = await pipeline.processResponse(response, session, questionnaire);

// Export data
const exportResult = await pipeline.exportSessions({
  format: 'csv',
  sessions: [session],
  questionnaire: questionnaireMetadata,
  options: {
    includeTimingData: true,
    encoding: 'utf8'
  }
});
```

## Components

### 1. StreamingService

Real-time response streaming with WebSocket integration.

```typescript
import { StreamingService } from '$lib/pipeline';

const streaming = new StreamingService({
  enabled: true,
  bufferSize: 100,
  flushInterval: 1000
});

// Stream a response
streaming.streamResponse(response, session);

// Subscribe to updates
const subscriptionId = streaming.subscribe(
  sessionId,
  (message) => console.log('New response:', message),
  [{ type: 'question', value: 'q1', operator: 'equals' }]
);
```

### 2. ValidationLayer

Comprehensive data validation with multiple validation types.

```typescript
import { ValidationLayer } from '$lib/pipeline';

const validation = new ValidationLayer();

// Add custom validation rule
validation.addValidationRule({
  name: 'custom-range',
  type: 'custom',
  rule: (value, context) => {
    const errors = [];
    if (typeof value === 'number' && (value < 1 || value > 10)) {
      errors.push({
        field: 'value',
        code: 'OUT_OF_RANGE',
        message: 'Value must be between 1 and 10',
        value
      });
    }
    return { isValid: errors.length === 0, errors, warnings: [] };
  }
});

// Validate response
const result = await validation.validateResponse(response, question, session);
```

### 3. TransformationPipeline

Data transformation with computed variables and aggregations.

```typescript
import { TransformationPipeline } from '$lib/pipeline';

const transformation = new TransformationPipeline();

// Add transformation stage
transformation.addStage({
  name: 'normalize-timestamps',
  type: 'normalize',
  transformer: {
    name: 'normalize',
    transform: async (data, context) => ({
      success: true,
      data: normalizeData(data)
    }),
    supports: (data) => data && data.responses
  },
  order: 1
});

// Transform session
const result = await transformation.transformSession(session, questionnaire);
```

### 4. ExportLayer

Multi-format export functionality.

```typescript
import { ExportLayer } from '$lib/pipeline';

const exporter = new ExportLayer();

// Export to CSV
const csvResult = await exporter.exportData({
  format: 'csv',
  sessions: [session],
  questionnaire: metadata,
  options: {
    separator: ',',
    includeTimingData: true,
    encoding: 'utf8'
  }
});

// Export to Excel with multiple worksheets
const excelResult = await exporter.exportData({
  format: 'excel',
  sessions: sessions,
  questionnaire: metadata,
  options: {
    worksheets: [
      { name: 'Data', data: flatData, filters: true },
      { name: 'Summary', data: summaryData }
    ],
    formatting: {
      headers: { font: { bold: true } },
      alternatingRows: true
    }
  }
});
```

### 5. BatchProcessor

High-performance batch processing with progress tracking.

```typescript
import { BatchProcessor } from '$lib/pipeline';

const batchProcessor = new BatchProcessor({
  batchSize: 50,
  maxConcurrency: 3,
  retryOnFailure: true
});

// Register custom processor
batchProcessor.registerProcessor({
  name: 'data-analysis',
  supports: (item) => item.type === 'analysis',
  process: async (items, context) => {
    return items.map(item => analyzeData(item));
  },
  maxBatchSize: 100,
  timeout: 30000
});

// Submit job
const jobId = await batchProcessor.submitJob(
  'Analysis Job',
  'analysis',
  analysisData,
  'data-analysis'
);

// Monitor progress
batchProcessor.on('job.progress', ({ job }) => {
  console.log(`Progress: ${job.progress.percentage}%`);
});
```

### 6. QueueManager

Advanced queue management with priorities and retry logic.

```typescript
import { QueueManager } from '$lib/pipeline';

const queue = new QueueManager({
  maxSize: 1000,
  maxRetries: 3,
  concurrency: 5,
  priorityLevels: 5
});

// Enqueue item with priority
const itemId = await queue.enqueue(
  { data: 'to process' },
  2, // priority level
  { maxRetries: 5, delay: 1000 }
);

// Start processing
queue.start();

// Monitor queue
queue.on('item.completed', ({ item, result }) => {
  console.log('Item completed:', item.id);
});
```

## Configuration

### Pipeline Configuration

```typescript
interface PipelineConfig {
  batchSize?: number;           // Default: 100
  maxRetries?: number;          // Default: 3
  retryDelay?: number;          // Default: 1000ms
  backpressureThreshold?: number; // Default: 1000
  enableStreaming?: boolean;    // Default: true
  queueTimeout?: number;        // Default: 30000ms
}
```

### Streaming Configuration

```typescript
interface StreamingConfig {
  enabled: boolean;
  bufferSize?: number;          // Default: 100
  flushInterval?: number;       // Default: 1000ms
  reconnectAttempts?: number;   // Default: 5
  reconnectDelay?: number;      // Default: 2000ms
  compression?: boolean;        // Default: false
}
```

### Export Options

#### CSV Export
```typescript
interface CSVExportOptions {
  separator?: string;           // Default: ','
  encoding?: 'utf8' | 'utf16';  // Default: 'utf8'
  includeTimingData?: boolean;  // Default: true
  dateFormat?: string;          // Default: 'YYYY-MM-DD'
  booleanFormat?: 'true/false' | '1/0' | 'yes/no';
}
```

#### Excel Export
```typescript
interface ExcelExportOptions {
  worksheets?: ExcelWorksheet[];
  formatting?: {
    headers?: { font?: { bold?: boolean; color?: string } };
    alternatingRows?: boolean;
    borders?: boolean;
  };
  charts?: ExcelChart[];
}
```

#### SPSS Export
```typescript
interface SPSSExportOptions {
  version?: string;             // Default: '28.0'
  variableLabels?: boolean;     // Default: true
  valueLabels?: boolean;        // Default: true
  syntax?: boolean;             // Default: true
}
```

#### R Export
```typescript
interface RExportOptions {
  packageFormat?: 'data.frame' | 'tibble' | 'data.table'; // Default: 'data.frame'
  factorEncoding?: boolean;     // Default: true
  dateClass?: 'Date' | 'POSIXct'; // Default: 'POSIXct'
  script?: boolean;             // Default: true
}
```

## Advanced Usage

### Custom Validation Rules

```typescript
// Email validation
pipeline.addValidationRule({
  name: 'email-validation',
  type: 'business',
  rule: (value, context) => {
    const errors = [];
    if (typeof value === 'string' && !isValidEmail(value)) {
      errors.push({
        field: 'value',
        code: 'INVALID_EMAIL',
        message: 'Please enter a valid email address',
        value
      });
    }
    return { isValid: errors.length === 0, errors, warnings: [] };
  }
});

// Statistical outlier detection
pipeline.addValidationRule({
  name: 'outlier-detection',
  type: 'statistical',
  rule: (value, context) => {
    const warnings = [];
    if (typeof value === 'number' && context.previousResponses) {
      const isOutlier = detectOutlier(value, context.previousResponses);
      if (isOutlier) {
        warnings.push({
          field: 'value',
          code: 'STATISTICAL_OUTLIER',
          message: 'This value appears to be a statistical outlier',
          suggestion: 'Please verify this value is correct'
        });
      }
    }
    return { isValid: true, errors: [], warnings };
  }
});
```

### Custom Transformations

```typescript
// Reaction time analysis
pipeline.addTransformationStage({
  name: 'reaction-time-analysis',
  type: 'compute',
  transformer: {
    name: 'rt-analyzer',
    supports: (data) => data.responses.some(r => r.reactionTime),
    transform: async (session, context) => {
      const rtResponses = session.responses.filter(r => r.reactionTime);
      const avgRT = rtResponses.reduce((sum, r) => sum + r.reactionTime, 0) / rtResponses.length;
      const medianRT = calculateMedian(rtResponses.map(r => r.reactionTime));
      
      return {
        success: true,
        data: {
          ...session,
          metadata: {
            ...session.metadata,
            reactionTimeAnalysis: {
              averageRT: avgRT,
              medianRT: medianRT,
              totalResponses: rtResponses.length
            }
          }
        }
      };
    }
  },
  order: 10
});
```

### Streaming with Filters

```typescript
// Subscribe to specific question types
const subscriptionId = pipeline.subscribeToStream(
  sessionId,
  (message) => {
    if (message.type === 'response') {
      handleReactionTimeResponse(message.data.response);
    }
  },
  [
    { type: 'question', value: 'reaction-time', operator: 'equals' },
    { type: 'responseType', value: 'keypress', operator: 'equals' }
  ]
);

// Subscribe to all progress updates
const progressSub = pipeline.subscribeToStream('*', (message) => {
  if (message.type === 'progress') {
    updateProgressBar(message.data.progress);
  }
});
```

## Performance Optimization

### Batch Processing Configuration

```typescript
const pipeline = createPipeline({
  batchSize: 200,      // Larger batches for better throughput
  maxRetries: 5,       // More retries for reliability
  queueTimeout: 60000, // Longer timeout for complex processing
  backpressureThreshold: 2000 // Higher threshold for burst handling
});
```

### Memory Management

```typescript
// Clear completed jobs periodically
setInterval(() => {
  const cleared = pipeline.batch.clearCompletedJobs();
  console.log(`Cleared ${cleared} completed jobs`);
}, 300000); // Every 5 minutes
```

### Parallel Export Processing

```typescript
// Process multiple export formats in parallel
const exportPromises = [
  pipeline.exportSessions({ format: 'csv', sessions, questionnaire }),
  pipeline.exportSessions({ format: 'excel', sessions, questionnaire }),
  pipeline.exportSessions({ format: 'spss', sessions, questionnaire })
];

const results = await Promise.allSettled(exportPromises);
```

## Error Handling

### Pipeline-Level Error Handling

```typescript
try {
  const result = await pipeline.processResponse(response, session, questionnaire);
  
  if (!result.success) {
    console.error('Processing errors:', result.errors);
    // Handle validation/transformation errors
  }
  
  if (result.warnings) {
    console.warn('Processing warnings:', result.warnings);
    // Handle warnings (non-blocking issues)
  }
  
} catch (error) {
  console.error('Pipeline error:', error);
  // Handle system-level errors
}
```

### Export Error Handling

```typescript
const exportResult = await pipeline.exportSessions(exportRequest);

if (!exportResult.success) {
  console.error('Export failed:', exportResult.errors);
  
  // Retry with different format or options
  const fallbackResult = await pipeline.exportSessions({
    ...exportRequest,
    format: 'json' // Fallback to JSON
  });
}
```

## Testing

### Unit Testing

```typescript
import { ValidationLayer, TransformationPipeline } from '$lib/pipeline';

describe('ValidationLayer', () => {
  test('validates required fields', async () => {
    const validation = new ValidationLayer();
    const result = await validation.validateResponse(
      { id: '1', questionId: 'q1', value: null, timestamp: Date.now(), valid: false },
      { id: 'q1', type: 'text-input', required: true },
      mockSession
    );
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('REQUIRED_FIELD');
  });
});
```

### Integration Testing

```typescript
describe('Pipeline Integration', () => {
  test('processes response end-to-end', async () => {
    const pipeline = createPipeline({ enableStreaming: false });
    
    const result = await pipeline.processResponse(
      mockResponse,
      mockSession,
      mockQuestionnaire
    );
    
    expect(result.success).toBe(true);
    expect(result.validatedResponse).toBeDefined();
    expect(result.transformedSession).toBeDefined();
  });
});
```

## Monitoring and Metrics

### Pipeline Status

```typescript
// Get comprehensive status
const status = pipeline.getStatus();
console.log('Pipeline Status:', {
  streaming: status.streaming.connected,
  queueSize: status.queue.size,
  processing: status.queue.processing,
  batchJobs: status.batch.runningJobs
});
```

### Custom Metrics

```typescript
// Track processing times
const processingTimes = [];

pipeline.queue.on('item.completed', ({ item, duration }) => {
  processingTimes.push(duration);
  
  if (processingTimes.length > 100) {
    const avgTime = processingTimes.reduce((a, b) => a + b) / processingTimes.length;
    console.log('Average processing time:', avgTime);
    processingTimes.length = 0; // Reset
  }
});
```

## Best Practices

1. **Use appropriate batch sizes**: Start with 100 items per batch and adjust based on processing time and memory usage.

2. **Configure retry policies**: Set reasonable retry limits and delays based on your data reliability requirements.

3. **Monitor queue health**: Watch for backpressure conditions and adjust processing capacity accordingly.

4. **Validate early**: Apply validation as early as possible to catch issues before expensive processing.

5. **Use streaming wisely**: Enable streaming for real-time applications but consider the network overhead.

6. **Export in chunks**: For large datasets, process exports in smaller chunks to avoid memory issues.

7. **Handle errors gracefully**: Always provide fallback options for critical operations like data export.

8. **Clean up resources**: Regularly clear completed jobs and close unused connections.

## Troubleshooting

### Common Issues

**Queue Backpressure**: Increase `backpressureThreshold` or reduce `batchSize`
**Memory Issues**: Implement periodic cleanup of completed jobs
**Slow Exports**: Use batch processing for large datasets
**WebSocket Disconnections**: Check `reconnectAttempts` and `reconnectDelay` settings
**Validation Failures**: Review custom validation rules and error handling

### Debug Mode

```typescript
const pipeline = createPipeline({
  // ... config,
  debug: true // Enable debug logging (if implemented)
});
```

For more detailed information, see the individual component files and TypeScript definitions.