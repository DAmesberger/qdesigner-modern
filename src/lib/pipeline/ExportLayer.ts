/**
 * Export Layer
 * Comprehensive export functionality for CSV, SPSS, R, Excel, and JSON formats
 */

import type {
  ExportRequest,
  ExportResult,
  ExportFormat,
  ExportMetadata,
  CSVExportOptions,
  SPSSExportOptions,
  RExportOptions,
  ExcelExportOptions,
  ExcelWorksheet,
  ExcelChart
} from './types';
import type { QuestionnaireSession, Response, QuestionnaireMetadata } from '$lib/shared/types/response';
import Papa from 'papaparse';
import * as ExcelJS from 'exceljs';

export class ExportLayer {
  private formatters = new Map<ExportFormat, (request: ExportRequest) => Promise<ExportResult>>();

  constructor() {
    this.initializeFormatters();
  }

  /**
   * Export data in specified format
   */
  public async exportData(request: ExportRequest): Promise<ExportResult> {
    const formatter = this.formatters.get(request.format);
    
    if (!formatter) {
      return {
        success: false,
        format: request.format,
        errors: [`Export format '${request.format}' is not supported`]
      };
    }

    try {
      const result = await formatter(request);
      
      return {
        ...result,
        metadata: {
          ...result.metadata,
          exportedAt: new Date(),
          sessionCount: request.sessions.length,
          questionnaireId: request.questionnaire.id
        }
      };

    } catch (error) {
      return {
        success: false,
        format: request.format,
        errors: [`Export failed: ${error.message}`]
      };
    }
  }

  /**
   * Initialize format-specific exporters
   */
  private initializeFormatters(): void {
    this.formatters.set('csv', this.exportToCSV.bind(this));
    this.formatters.set('spss', this.exportToSPSS.bind(this));
    this.formatters.set('r', this.exportToR.bind(this));
    this.formatters.set('excel', this.exportToExcel.bind(this));
    this.formatters.set('json', this.exportToJSON.bind(this));
  }

  /**
   * Export to CSV format
   */
  private async exportToCSV(request: ExportRequest): Promise<ExportResult> {
    const options = request.options as CSVExportOptions;
    const config = {
      separator: options?.separator || ',',
      quote: options?.quote || '"',
      escape: options?.escape || '"',
      header: options?.header !== false,
      encoding: options?.encoding || 'utf8',
      dateFormat: options?.dateFormat || 'YYYY-MM-DD',
      timeFormat: options?.timeFormat || 'HH:mm:ss',
      booleanFormat: options?.booleanFormat || 'true/false',
      includeMetadata: options?.includeMetadata !== false,
      includeTimingData: options?.includeTimingData !== false
    };

    try {
      // Flatten session data into tabular format
      const flatData = this.flattenSessionsForTabular(request.sessions, request.questionnaire, config);
      
      // Configure Papa Parse
      const csvOptions = {
        delimiter: config.separator,
        quotes: true,
        quoteChar: config.quote,
        escapeChar: config.escape,
        header: config.header
      };

      // Generate CSV
      const csvContent = Papa.unparse(flatData, csvOptions);
      
      // Calculate file size
      const size = new Blob([csvContent]).size;

      return {
        success: true,
        format: 'csv',
        data: csvContent,
        filename: this.generateFilename(request.questionnaire.name, 'csv'),
        size,
        metadata: {
          rows: flatData.length,
          columns: flatData.length > 0 ? Object.keys(flatData[0]).length : 0,
          encoding: config.encoding
        }
      };

    } catch (error) {
      return {
        success: false,
        format: 'csv',
        errors: [`CSV export failed: ${error.message}`]
      };
    }
  }

  /**
   * Export to SPSS format (.sav and .sps)
   */
  private async exportToSPSS(request: ExportRequest): Promise<ExportResult> {
    const options = request.options as SPSSExportOptions;
    const config = {
      version: options?.version || '28.0',
      compression: options?.compression !== false,
      variableLabels: options?.variableLabels !== false,
      valueLabels: options?.valueLabels !== false,
      longVariableNames: options?.longVariableNames !== false,
      syntax: options?.syntax !== false
    };

    try {
      // Flatten data for SPSS format
      const flatData = this.flattenSessionsForTabular(request.sessions, request.questionnaire);
      
      // Generate SPSS syntax file
      const syntaxContent = this.generateSPSSSyntax(
        flatData, 
        request.questionnaire, 
        config
      );

      // For now, we'll export as CSV with SPSS syntax
      // In a full implementation, you'd use a library like 'node-spss' to create .sav files
      const csvContent = Papa.unparse(flatData);
      
      const result: ExportResult = {
        success: true,
        format: 'spss',
        data: {
          data: csvContent,
          syntax: syntaxContent
        },
        filename: this.generateFilename(request.questionnaire.name, 'sav'),
        metadata: {
          rows: flatData.length,
          variables: Object.keys(flatData[0] || {}).length,
          hasLabels: config.valueLabels,
          version: config.version
        }
      };

      if (config.syntax) {
        result.metadata!.syntaxFile = this.generateFilename(request.questionnaire.name, 'sps');
      }

      return result;

    } catch (error) {
      return {
        success: false,
        format: 'spss',
        errors: [`SPSS export failed: ${error.message}`]
      };
    }
  }

  /**
   * Export to R format
   */
  private async exportToR(request: ExportRequest): Promise<ExportResult> {
    const options = request.options as RExportOptions;
    const config = {
      packageFormat: options?.packageFormat || 'data.frame',
      factorEncoding: options?.factorEncoding !== false,
      dateClass: options?.dateClass || 'POSIXct',
      script: options?.script !== false,
      rds: options?.rds !== false
    };

    try {
      // Flatten data
      const flatData = this.flattenSessionsForTabular(request.sessions, request.questionnaire);
      
      // Generate R script
      const rScript = this.generateRScript(flatData, request.questionnaire, config);
      
      // Convert data to R-compatible JSON
      const rData = this.convertToRFormat(flatData, config);

      return {
        success: true,
        format: 'r',
        data: {
          script: rScript,
          data: rData,
          json: JSON.stringify(flatData, null, 2)
        },
        filename: this.generateFilename(request.questionnaire.name, 'R'),
        metadata: {
          rows: flatData.length,
          columns: Object.keys(flatData[0] || {}).length,
          packageFormat: config.packageFormat,
          hasFactors: config.factorEncoding
        }
      };

    } catch (error) {
      return {
        success: false,
        format: 'r',
        errors: [`R export failed: ${error.message}`]
      };
    }
  }

  /**
   * Export to Excel format
   */
  private async exportToExcel(request: ExportRequest): Promise<ExportResult> {
    const options = request.options as ExcelExportOptions;
    
    try {
      const workbook = new ExcelJS.Workbook();
      
      // Set workbook metadata
      workbook.creator = 'QDesigner Modern';
      workbook.created = new Date();
      workbook.modified = new Date();
      workbook.title = request.questionnaire.name;
      workbook.description = request.questionnaire.description || 'Questionnaire Data Export';

      // Flatten data
      const flatData = this.flattenSessionsForTabular(request.sessions, request.questionnaire);

      // Create main data worksheet
      const mainWorksheet = workbook.addWorksheet('Data');
      
      if (flatData.length > 0) {
        // Add headers
        const headers = Object.keys(flatData[0]);
        mainWorksheet.addRow(headers);
        
        // Style headers
        const headerRow = mainWorksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        flatData.forEach(row => {
          const values = headers.map(header => row[header]);
          mainWorksheet.addRow(values);
        });

        // Auto-fit columns
        mainWorksheet.columns.forEach(column => {
          column.width = Math.min(Math.max(12, (column.header?.toString().length || 0) + 2), 50);
        });

        // Add filters
        if (options?.worksheets?.[0]?.filters !== false) {
          mainWorksheet.autoFilter = {
            from: 'A1',
            to: `${this.getExcelColumnName(headers.length)}1`
          };
        }
      }

      // Add summary worksheet
      const summaryWorksheet = this.createSummaryWorksheet(workbook, request.sessions, request.questionnaire);

      // Add charts if specified
      if (options?.charts) {
        await this.addExcelCharts(workbook, options.charts, flatData);
      }

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      return {
        success: true,
        format: 'excel',
        data: buffer,
        filename: this.generateFilename(request.questionnaire.name, 'xlsx'),
        size: buffer.byteLength,
        metadata: {
          worksheets: workbook.worksheets.length,
          rows: flatData.length,
          columns: Object.keys(flatData[0] || {}).length
        }
      };

    } catch (error) {
      return {
        success: false,
        format: 'excel',
        errors: [`Excel export failed: ${error.message}`]
      };
    }
  }

  /**
   * Export to JSON format
   */
  private async exportToJSON(request: ExportRequest): Promise<ExportResult> {
    try {
      const exportData = {
        metadata: {
          questionnaire: request.questionnaire,
          exportedAt: new Date().toISOString(),
          sessionCount: request.sessions.length,
          version: '1.0'
        },
        sessions: request.sessions,
        ...(request.metadata && { exportMetadata: request.metadata })
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const size = new Blob([jsonContent]).size;

      return {
        success: true,
        format: 'json',
        data: jsonContent,
        filename: this.generateFilename(request.questionnaire.name, 'json'),
        size,
        metadata: {
          sessions: request.sessions.length,
          totalResponses: request.sessions.reduce((sum, s) => sum + s.responses.length, 0)
        }
      };

    } catch (error) {
      return {
        success: false,
        format: 'json',
        errors: [`JSON export failed: ${error.message}`]
      };
    }
  }

  /**
   * Flatten session data for tabular export formats
   */
  private flattenSessionsForTabular(
    sessions: QuestionnaireSession[],
    questionnaire: QuestionnaireMetadata,
    config?: any
  ): any[] {
    const flatData: any[] = [];

    for (const session of sessions) {
      const baseRow = {
        session_id: session.id,
        questionnaire_id: session.questionnaireId,
        questionnaire_version: session.questionnaireVersion,
        participant_id: session.participantId || '',
        start_time: this.formatDateTime(session.startTime, config?.dateFormat, config?.timeFormat),
        end_time: session.endTime ? this.formatDateTime(session.endTime, config?.dateFormat, config?.timeFormat) : '',
        status: session.status,
        duration_ms: session.endTime ? session.endTime - session.startTime : null
      };

      // Add metadata fields
      if (session.metadata && config?.includeMetadata !== false) {
        Object.entries(session.metadata).forEach(([key, value]) => {
          baseRow[`meta_${key}`] = value;
        });
      }

      // Create response map
      const responseMap = new Map<string, Response>();
      session.responses.forEach(response => {
        responseMap.set(response.questionId, response);
      });

      // Add response columns
      for (const question of questionnaire.questions) {
        const response = responseMap.get(question.id);
        const questionPrefix = `q_${question.id}`;
        
        if (response) {
          baseRow[`${questionPrefix}_value`] = this.formatValue(response.value, config);
          baseRow[`${questionPrefix}_timestamp`] = this.formatDateTime(response.timestamp, config?.dateFormat, config?.timeFormat);
          baseRow[`${questionPrefix}_valid`] = this.formatBoolean(response.valid, config?.booleanFormat);
          
          if (response.reactionTime !== undefined && config?.includeTimingData !== false) {
            baseRow[`${questionPrefix}_reaction_time`] = response.reactionTime;
          }
          
          if (response.attempts !== undefined) {
            baseRow[`${questionPrefix}_attempts`] = response.attempts;
          }
        } else {
          baseRow[`${questionPrefix}_value`] = null;
          baseRow[`${questionPrefix}_timestamp`] = null;
          baseRow[`${questionPrefix}_valid`] = null;
          
          if (config?.includeTimingData !== false) {
            baseRow[`${questionPrefix}_reaction_time`] = null;
          }
        }
      }

      flatData.push(baseRow);
    }

    return flatData;
  }

  /**
   * Generate SPSS syntax file
   */
  private generateSPSSSyntax(
    data: any[],
    questionnaire: QuestionnaireMetadata,
    config: any
  ): string {
    let syntax = `* SPSS Syntax for ${questionnaire.name}\n`;
    syntax += `* Generated on ${new Date().toISOString()}\n\n`;

    // Data file specification
    syntax += `GET DATA\n`;
    syntax += `  /TYPE=TXT\n`;
    syntax += `  /FILE="${questionnaire.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv"\n`;
    syntax += `  /DELIMITERS=","\n`;
    syntax += `  /QUALIFIER='"'\n`;
    syntax += `  /ARRANGEMENT=DELIMITED\n`;
    syntax += `  /FIRSTCASE=2\n`;
    syntax += `  /VARIABLES=\n`;

    // Variable definitions
    if (data.length > 0) {
      const variables = Object.keys(data[0]);
      variables.forEach(varName => {
        const sampleValue = data[0][varName];
        const varType = typeof sampleValue === 'number' ? 'F8.2' : 'A255';
        syntax += `    ${varName} ${varType}\n`;
      });
    }

    syntax += `.\n\n`;

    // Variable labels
    if (config.variableLabels) {
      syntax += `VARIABLE LABELS\n`;
      questionnaire.questions.forEach(question => {
        const label = question.label || `Question ${question.id}`;
        syntax += `  q_${question.id}_value "${label}"\n`;
      });
      syntax += `.\n\n`;
    }

    // Value labels for choice questions
    if (config.valueLabels) {
      syntax += `VALUE LABELS\n`;
      // This would be expanded to include actual value labels
      syntax += `.\n\n`;
    }

    syntax += `EXECUTE.\n`;

    return syntax;
  }

  /**
   * Generate R script
   */
  private generateRScript(
    data: any[],
    questionnaire: QuestionnaireMetadata,
    config: any
  ): string {
    let script = `# R Script for ${questionnaire.name}\n`;
    script += `# Generated on ${new Date().toISOString()}\n\n`;

    script += `# Load required libraries\n`;
    if (config.packageFormat === 'tibble') {
      script += `library(tibble)\n`;
    } else if (config.packageFormat === 'data.table') {
      script += `library(data.table)\n`;
    }
    script += `\n`;

    script += `# Load data\n`;
    script += `data <- jsonlite::fromJSON("${questionnaire.name.replace(/[^a-zA-Z0-9]/g, '_')}.json")\n\n`;

    if (config.packageFormat === 'tibble') {
      script += `# Convert to tibble\n`;
      script += `data <- as_tibble(data)\n\n`;
    } else if (config.packageFormat === 'data.table') {
      script += `# Convert to data.table\n`;
      script += `data <- as.data.table(data)\n\n`;
    }

    // Factor encoding
    if (config.factorEncoding) {
      script += `# Convert categorical variables to factors\n`;
      questionnaire.questions.forEach(question => {
        if (question.responseType === 'single' || question.responseType === 'multiple') {
          script += `data$q_${question.id}_value <- as.factor(data$q_${question.id}_value)\n`;
        }
      });
      script += `\n`;
    }

    // Date conversion
    if (config.dateClass) {
      script += `# Convert timestamps to ${config.dateClass}\n`;
      script += `data$start_time <- as.${config.dateClass}(data$start_time)\n`;
      script += `data$end_time <- as.${config.dateClass}(data$end_time)\n`;
      script += `\n`;
    }

    script += `# Display data structure\n`;
    script += `str(data)\n`;
    script += `summary(data)\n`;

    return script;
  }

  /**
   * Convert data to R-compatible format
   */
  private convertToRFormat(data: any[], config: any): any[] {
    return data.map(row => {
      const rRow: any = {};
      
      Object.entries(row).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          rRow[key] = 'NA';
        } else if (typeof value === 'boolean') {
          rRow[key] = value ? 'TRUE' : 'FALSE';
        } else {
          rRow[key] = value;
        }
      });
      
      return rRow;
    });
  }

  /**
   * Create Excel summary worksheet
   */
  private createSummaryWorksheet(
    workbook: ExcelJS.Workbook,
    sessions: QuestionnaireSession[],
    questionnaire: QuestionnaireMetadata
  ): ExcelJS.Worksheet {
    const worksheet = workbook.addWorksheet('Summary');
    
    // Basic statistics
    worksheet.addRow(['Summary Statistics']);
    worksheet.addRow(['Total Sessions', sessions.length]);
    worksheet.addRow(['Total Questions', questionnaire.questions.length]);
    worksheet.addRow(['Total Responses', sessions.reduce((sum, s) => sum + s.responses.length, 0)]);
    
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    worksheet.addRow(['Completed Sessions', completedSessions]);
    worksheet.addRow(['Completion Rate', `${Math.round((completedSessions / sessions.length) * 100)}%`]);

    // Style the summary
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getColumn('A').width = 20;
    worksheet.getColumn('B').width = 15;

    return worksheet;
  }

  /**
   * Add charts to Excel workbook
   */
  private async addExcelCharts(
    workbook: ExcelJS.Workbook,
    charts: ExcelChart[],
    data: any[]
  ): Promise<void> {
    // Chart implementation would go here
    // ExcelJS has limited chart support, so this would be a basic implementation
  }

  /**
   * Helper methods
   */
  private formatDateTime(timestamp: number, dateFormat?: string, timeFormat?: string): string {
    const date = new Date(timestamp);
    const datePart = date.toISOString().split('T')[0];
    const timePart = date.toISOString().split('T')[1].split('.')[0];
    
    if (dateFormat && timeFormat) {
      return `${datePart} ${timePart}`;
    } else if (dateFormat) {
      return datePart;
    } else if (timeFormat) {
      return timePart;
    }
    
    return date.toISOString();
  }

  private formatValue(value: any, config?: any): any {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (Array.isArray(value)) {
      return value.join(';');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return value;
  }

  private formatBoolean(value: boolean, format: string = 'true/false'): string {
    switch (format) {
      case '1/0':
        return value ? '1' : '0';
      case 'yes/no':
        return value ? 'yes' : 'no';
      default:
        return value ? 'true' : 'false';
    }
  }

  private generateFilename(questionnaireName: string, extension: string): string {
    const cleanName = questionnaireName.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    return `${cleanName}_${timestamp}.${extension}`;
  }

  private getExcelColumnName(columnNumber: number): string {
    let columnName = '';
    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26;
      columnName = String.fromCharCode(65 + remainder) + columnName;
      columnNumber = Math.floor((columnNumber - 1) / 26);
    }
    return columnName;
  }
}