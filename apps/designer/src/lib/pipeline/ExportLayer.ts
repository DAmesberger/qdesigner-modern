import type { 
  ResponseData, 
  PipelineStage,
  PipelineContext,
  ExportConfig,
  StorageAdapter
} from './types';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

export interface ExportFormat {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  formatter: (data: ResponseData[], options?: any) => Promise<Blob | string>;
}

export class ExportLayer implements PipelineStage<ResponseData[], void> {
  id = 'export';
  name = 'Data Export Layer';
  type = 'storage' as const;
  priority = 50; // Run after transformation
  
  private formats: Map<string, ExportFormat> = new Map();
  private storageAdapters: Map<string, StorageAdapter> = new Map();
  private exportQueue: ResponseData[][] = [];
  private batchSize: number = 1000;
  
  constructor() {
    this.registerBuiltInFormats();
  }
  
  // Register export format
  registerFormat(format: ExportFormat): void {
    this.formats.set(format.id, format);
  }
  
  // Register storage adapter
  registerStorageAdapter(adapter: StorageAdapter): void {
    this.storageAdapters.set(adapter.name, adapter);
  }
  
  // Process batch of responses for export
  async process(
    responses: ResponseData[], 
    context: PipelineContext
  ): Promise<void> {
    // Add to export queue
    this.exportQueue.push(responses);
    
    // Check if we should flush
    const totalResponses = this.exportQueue.reduce((sum, batch) => sum + batch.length, 0);
    
    if (totalResponses >= this.batchSize) {
      await this.flushExports(context);
    }
  }
  
  // Export data in specific format
  async export(
    data: ResponseData[],
    config: ExportConfig
  ): Promise<Blob | string> {
    const format = this.formats.get(config.format);
    
    if (!format) {
      throw new Error(`Unknown export format: ${config.format}`);
    }
    
    return await format.formatter(data, config.options);
  }
  
  // Flush pending exports
  private async flushExports(context: PipelineContext): Promise<void> {
    if (this.exportQueue.length === 0) return;
    
    // Flatten all responses
    const allResponses = this.exportQueue.flat();
    this.exportQueue = [];
    
    // Store in configured adapters
    for (const adapter of this.storageAdapters.values()) {
      try {
        await adapter.store(allResponses, context);
      } catch (error) {
        context.errors.push({
          stage: this.id,
          error: error as Error,
          timestamp: Date.now(),
          recovered: false
        });
      }
    }
  }
  
  // Register built-in export formats
  private registerBuiltInFormats(): void {
    // CSV Format
    this.registerFormat({
      id: 'csv',
      name: 'CSV',
      extension: 'csv',
      mimeType: 'text/csv',
      formatter: async (data, options = {}) => {
        const { delimiter = ',', includeHeaders = true } = options;
        
        if (data.length === 0) {
          return new Blob([''], { type: 'text/csv' });
        }
        
        // Flatten nested data
        const flatData = data.map(response => this.flattenResponse(response));
        
        // Generate CSV
        const csv = Papa.unparse(flatData, {
          delimiter,
          header: includeHeaders
        });
        
        return new Blob([csv], { type: 'text/csv' });
      }
    });
    
    // JSON Format
    this.registerFormat({
      id: 'json',
      name: 'JSON',
      extension: 'json',
      mimeType: 'application/json',
      formatter: async (data, options = {}) => {
        const { pretty = true } = options;
        
        const json = pretty 
          ? JSON.stringify(data, null, 2)
          : JSON.stringify(data);
          
        return new Blob([json], { type: 'application/json' });
      }
    });
    
    // Excel Format
    this.registerFormat({
      id: 'excel',
      name: 'Excel',
      extension: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      formatter: async (data, options = {}) => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Responses');
        
        if (data.length === 0) {
          const buffer = await workbook.xlsx.writeBuffer();
          return new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
          });
        }
        
        // Flatten data
        const flatData = data.map(response => this.flattenResponse(response));
        
        // Add headers
        const headers = Object.keys(flatData[0]);
        worksheet.addRow(headers);
        
        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        
        // Add data
        flatData.forEach(row => {
          worksheet.addRow(headers.map(header => row[header]));
        });
        
        // Auto-fit columns
        headers.forEach((header, index) => {
          const column = worksheet.getColumn(index + 1);
          column.width = Math.min(
            Math.max(header.length, 10),
            50
          );
        });
        
        const buffer = await workbook.xlsx.writeBuffer();
        return new Blob([buffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
      }
    });
    
    // SPSS Format
    this.registerFormat({
      id: 'spss',
      name: 'SPSS',
      extension: 'sav',
      mimeType: 'application/x-spss-sav',
      formatter: async (data, options = {}) => {
        // Generate SPSS syntax instead of .sav file
        const syntax = this.generateSPSSSyntax(data, options);
        return new Blob([syntax], { type: 'text/plain' });
      }
    });
    
    // R Format
    this.registerFormat({
      id: 'r',
      name: 'R Script',
      extension: 'R',
      mimeType: 'text/plain',
      formatter: async (data, options = {}) => {
        const script = this.generateRScript(data, options);
        return new Blob([script], { type: 'text/plain' });
      }
    });
    
    // Python Format
    this.registerFormat({
      id: 'python',
      name: 'Python Script',
      extension: 'py',
      mimeType: 'text/x-python',
      formatter: async (data, options = {}) => {
        const script = this.generatePythonScript(data, options);
        return new Blob([script], { type: 'text/x-python' });
      }
    });
  }
  
  // Flatten response object for tabular formats
  private flattenResponse(response: ResponseData): Record<string, any> {
    const flat: Record<string, any> = {
      id: response.id,
      questionId: response.questionId,
      questionnaireId: response.questionnaireId,
      sessionId: response.sessionId,
      participantId: response.participantId,
      timestamp: response.timestamp,
      value: response.value
    };
    
    // Add reaction time if present
    if (response.reactionTime !== undefined) {
      flat.reactionTime = response.reactionTime;
    }
    
    // Flatten metadata
    if (response.metadata) {
      Object.entries(response.metadata).forEach(([key, value]) => {
        flat[`metadata_${key}`] = value;
      });
    }
    
    // Flatten validation results
    if (response.validation) {
      flat.validation_valid = response.validation.valid;
      flat.validation_errors = response.validation.errors.length;
      flat.validation_warnings = response.validation.warnings.length;
    }
    
    return flat;
  }
  
  // Generate SPSS syntax
  private generateSPSSSyntax(data: ResponseData[], options: any): string {
    const { dataFile = 'data.csv' } = options;
    
    let syntax = `* SPSS Syntax for importing questionnaire data.\n`;
    syntax += `* Generated on ${new Date().toISOString()}.\n\n`;
    
    syntax += `GET DATA /TYPE=TXT\n`;
    syntax += `  /FILE="${dataFile}"\n`;
    syntax += `  /DELIMITERS=","\n`;
    syntax += `  /QUALIFIER='"'\n`;
    syntax += `  /ARRANGEMENT=DELIMITED\n`;
    syntax += `  /FIRSTCASE=2\n`;
    syntax += `  /VARIABLES=\n`;
    
    if (data.length > 0) {
      const sample = this.flattenResponse(data[0]);
      Object.entries(sample).forEach(([key, value]) => {
        const type = typeof value === 'number' ? 'F8.2' : 'A255';
        syntax += `    ${key} ${type}\n`;
      });
    }
    
    syntax += `.\n\n`;
    syntax += `* Variable labels.\n`;
    syntax += `VARIABLE LABELS\n`;
    syntax += `  id 'Response ID'\n`;
    syntax += `  questionId 'Question ID'\n`;
    syntax += `  participantId 'Participant ID'\n`;
    syntax += `  timestamp 'Response Timestamp'\n`;
    syntax += `  value 'Response Value'\n`;
    syntax += `  reactionTime 'Reaction Time (ms)'\n`;
    syntax += `.\n\n`;
    
    syntax += `* Basic descriptive statistics.\n`;
    syntax += `DESCRIPTIVES VARIABLES=ALL\n`;
    syntax += `  /STATISTICS=MEAN STDDEV MIN MAX.\n`;
    
    return syntax;
  }
  
  // Generate R script
  private generateRScript(data: ResponseData[], options: any): string {
    const { dataFile = 'data.csv' } = options;
    
    let script = `# R Script for analyzing questionnaire data\n`;
    script += `# Generated on ${new Date().toISOString()}\n\n`;
    
    script += `# Load required libraries\n`;
    script += `library(tidyverse)\n`;
    script += `library(psych)\n`;
    script += `library(ggplot2)\n\n`;
    
    script += `# Load data\n`;
    script += `data <- read.csv("${dataFile}", stringsAsFactors = FALSE)\n\n`;
    
    script += `# Convert timestamp to datetime\n`;
    script += `data$timestamp <- as.POSIXct(data$timestamp / 1000, origin = "1970-01-01")\n\n`;
    
    script += `# Basic summary\n`;
    script += `summary(data)\n\n`;
    
    script += `# Response time analysis\n`;
    script += `if("reactionTime" %in% names(data)) {\n`;
    script += `  cat("\\nReaction Time Statistics:\\n")\n`;
    script += `  print(describe(data$reactionTime))\n`;
    script += `  \n`;
    script += `  # Plot reaction time distribution\n`;
    script += `  ggplot(data, aes(x = reactionTime)) +\n`;
    script += `    geom_histogram(bins = 30, fill = "blue", alpha = 0.7) +\n`;
    script += `    labs(title = "Reaction Time Distribution",\n`;
    script += `         x = "Reaction Time (ms)",\n`;
    script += `         y = "Frequency") +\n`;
    script += `    theme_minimal()\n`;
    script += `}\n\n`;
    
    script += `# Group by question\n`;
    script += `question_summary <- data %>%\n`;
    script += `  group_by(questionId) %>%\n`;
    script += `  summarise(\n`;
    script += `    n_responses = n(),\n`;
    script += `    unique_participants = n_distinct(participantId)\n`;
    script += `  )\n`;
    script += `print(question_summary)\n`;
    
    return script;
  }
  
  // Generate Python script
  private generatePythonScript(data: ResponseData[], options: any): string {
    const { dataFile = 'data.csv' } = options;
    
    let script = `# Python script for analyzing questionnaire data\n`;
    script += `# Generated on ${new Date().toISOString()}\n\n`;
    
    script += `import pandas as pd\n`;
    script += `import numpy as np\n`;
    script += `import matplotlib.pyplot as plt\n`;
    script += `import seaborn as sns\n`;
    script += `from datetime import datetime\n\n`;
    
    script += `# Load data\n`;
    script += `df = pd.read_csv('${dataFile}')\n\n`;
    
    script += `# Convert timestamp\n`;
    script += `df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')\n\n`;
    
    script += `# Basic information\n`;
    script += `print("Data shape:", df.shape)\n`;
    script += `print("\\nColumn types:")\n`;
    script += `print(df.dtypes)\n`;
    script += `print("\\nBasic statistics:")\n`;
    script += `print(df.describe())\n\n`;
    
    script += `# Reaction time analysis\n`;
    script += `if 'reactionTime' in df.columns:\n`;
    script += `    print("\\nReaction Time Analysis:")\n`;
    script += `    print(f"Mean: {df['reactionTime'].mean():.2f} ms")\n`;
    script += `    print(f"Median: {df['reactionTime'].median():.2f} ms")\n`;
    script += `    print(f"Std Dev: {df['reactionTime'].std():.2f} ms")\n`;
    script += `    \n`;
    script += `    # Plot distribution\n`;
    script += `    plt.figure(figsize=(10, 6))\n`;
    script += `    plt.hist(df['reactionTime'], bins=30, alpha=0.7, color='blue', edgecolor='black')\n`;
    script += `    plt.xlabel('Reaction Time (ms)')\n`;
    script += `    plt.ylabel('Frequency')\n`;
    script += `    plt.title('Reaction Time Distribution')\n`;
    script += `    plt.grid(True, alpha=0.3)\n`;
    script += `    plt.show()\n\n`;
    
    script += `# Response patterns\n`;
    script += `response_counts = df.groupby('questionId').size()\n`;
    script += `print("\\nResponses per question:")\n`;
    script += `print(response_counts)\n\n`;
    
    script += `# Participant analysis\n`;
    script += `participant_summary = df.groupby('participantId').agg({\n`;
    script += `    'id': 'count',\n`;
    script += `    'timestamp': ['min', 'max']\n`;
    script += `})\n`;
    script += `participant_summary.columns = ['response_count', 'first_response', 'last_response']\n`;
    script += `participant_summary['duration'] = (\n`;
    script += `    participant_summary['last_response'] - participant_summary['first_response']\n`;
    script += `).dt.total_seconds()\n`;
    script += `print("\\nParticipant Summary:")\n`;
    script += `print(participant_summary.head())\n`;
    
    return script;
  }
}

// Create file storage adapter
export class FileStorageAdapter implements StorageAdapter {
  name = 'file';
  type = 'file' as const;
  
  constructor(
    private exportLayer: ExportLayer,
    private config: { format: string; directory: string }
  ) {}
  
  async store(data: ResponseData[], context: PipelineContext): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `responses_${context.questionnaireId}_${timestamp}`;
    
    const blob = await this.exportLayer.export(data, {
      format: this.config.format,
      destination: 'file',
      options: {}
    });
    
    // In a real implementation, this would save to filesystem
    // For browser environment, trigger download
    if (typeof window !== 'undefined' && blob instanceof Blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${this.getExtension()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
  
  private getExtension(): string {
    const formatMap: Record<string, string> = {
      csv: 'csv',
      json: 'json',
      excel: 'xlsx',
      spss: 'sps',
      r: 'R',
      python: 'py'
    };
    
    return formatMap[this.config.format] || 'txt';
  }
}