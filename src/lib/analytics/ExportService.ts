/**
 * Export Service
 * Data export functionality for various statistical software formats
 */

import * as XLSX from 'exceljs';
import Papa from 'papaparse';
import type {
  ExportConfig,
  ExportFormat,
  ExportResult,
  DataTransformation,
  AnalyticsData,
  StatisticalSummary
} from './types';
import type { ResponseData } from '$lib/types/response';

export class ExportService {
  private static instance: ExportService;

  private constructor() {}

  static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  // ============================================================================
  // Main Export Methods
  // ============================================================================

  /**
   * Export analytics data to specified format
   */
  async exportData(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    try {
      const startTime = Date.now();
      const transformedData = await this.transformData(data, config);
      
      let result: ExportResult;
      
      switch (config.format) {
        case 'csv':
          result = await this.exportToCSV(transformedData, config);
          break;
        case 'xlsx':
          result = await this.exportToExcel(transformedData, config);
          break;
        case 'json':
          result = await this.exportToJSON(transformedData, config);
          break;
        case 'spss':
          result = await this.exportToSPSS(transformedData, config);
          break;
        case 'r':
          result = await this.exportToR(transformedData, config);
          break;
        case 'python':
          result = await this.exportToPython(transformedData, config);
          break;
        case 'stata':
          result = await this.exportToStata(transformedData, config);
          break;
        case 'sas':
          result = await this.exportToSAS(transformedData, config);
          break;
        default:
          throw new Error(`Unsupported export format: ${config.format}`);
      }

      result.metadata.exportTime = Date.now() - startTime;
      return result;

    } catch (error) {
      return {
        success: false,
        filename: '',
        size: 0,
        error: error instanceof Error ? error.message : 'Unknown export error',
        metadata: {
          recordCount: 0,
          columnCount: 0,
          exportTime: 0,
          format: config.format
        }
      };
    }
  }

  // ============================================================================
  // CSV Export
  // ============================================================================

  private async exportToCSV(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const flattenedData = this.flattenAnalyticsData(data, config);
    
    const csvOptions = {
      delimiter: config.delimiter || ',',
      header: true,
      skipEmptyLines: true,
      quotes: true
    };

    const csv = Papa.unparse(flattenedData, csvOptions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.csv`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'csv'
      }
    };
  }

  // ============================================================================
  // Excel Export
  // ============================================================================

  private async exportToExcel(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const workbook = new XLSX.Workbook();
    
    // Main data sheet
    const flattenedData = this.flattenAnalyticsData(data, config);
    const mainSheet = workbook.addWorksheet('Data');
    
    if (flattenedData.length > 0) {
      const headers = Object.keys(flattenedData[0]);
      mainSheet.addRow(headers);
      
      flattenedData.forEach(row => {
        mainSheet.addRow(headers.map(header => row[header]));
      });

      // Style headers
      const headerRow = mainSheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }

    // Metadata sheet
    if (config.includeMetadata) {
      this.addMetadataSheet(workbook, data);
    }

    // Statistics sheet
    if (config.includeStatistics) {
      this.addStatisticsSheet(workbook, data);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const filename = `analytics_export_${this.generateTimestamp()}.xlsx`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'xlsx'
      }
    };
  }

  private addMetadataSheet(workbook: XLSX.Workbook, data: AnalyticsData[]): void {
    const metadataSheet = workbook.addWorksheet('Metadata');
    
    metadataSheet.addRow(['Export Information']);
    metadataSheet.addRow(['Export Date', new Date().toISOString()]);
    metadataSheet.addRow(['Total Sessions', data.length]);
    metadataSheet.addRow(['Date Range', this.getDateRange(data)]);
    metadataSheet.addRow([]);
    
    metadataSheet.addRow(['Session Information']);
    data.forEach((session, index) => {
      metadataSheet.addRow([
        `Session ${index + 1}`,
        session.sessionId,
        session.questionnaireId,
        new Date(session.startTime).toISOString(),
        session.endTime ? new Date(session.endTime).toISOString() : 'Incomplete',
        session.responses.length
      ]);
    });
  }

  private addStatisticsSheet(workbook: XLSX.Workbook, data: AnalyticsData[]): void {
    const statsSheet = workbook.addWorksheet('Statistics');
    
    // Response times statistics
    const responseTimes = data.flatMap(session => 
      session.responses
        .filter(r => r.responseTime !== undefined)
        .map(r => r.responseTime!)
    );

    if (responseTimes.length > 0) {
      statsSheet.addRow(['Response Time Statistics']);
      statsSheet.addRow(['Count', responseTimes.length]);
      statsSheet.addRow(['Mean', this.calculateMean(responseTimes)]);
      statsSheet.addRow(['Median', this.calculateMedian(responseTimes)]);
      statsSheet.addRow(['Standard Deviation', this.calculateStdDev(responseTimes)]);
      statsSheet.addRow(['Min', Math.min(...responseTimes)]);
      statsSheet.addRow(['Max', Math.max(...responseTimes)]);
      statsSheet.addRow([]);
    }

    // Completion statistics
    const completedSessions = data.filter(session => session.endTime).length;
    statsSheet.addRow(['Completion Statistics']);
    statsSheet.addRow(['Total Sessions', data.length]);
    statsSheet.addRow(['Completed Sessions', completedSessions]);
    statsSheet.addRow(['Completion Rate', `${((completedSessions / data.length) * 100).toFixed(2)}%`]);
  }

  // ============================================================================
  // JSON Export
  // ============================================================================

  private async exportToJSON(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        format: 'json',
        version: '1.0',
        totalSessions: data.length
      },
      data: config.includeRawData ? data : this.flattenAnalyticsData(data, config),
      ...(config.includeStatistics && { statistics: this.calculateDataStatistics(data) })
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.json`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: Array.isArray(exportData.data) ? exportData.data.length : data.length,
        columnCount: 0, // JSON doesn't have fixed columns
        exportTime: 0,
        format: 'json'
      }
    };
  }

  // ============================================================================
  // SPSS Export
  // ============================================================================

  private async exportToSPSS(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const flattenedData = this.flattenAnalyticsData(data, config);
    
    // Generate SPSS syntax file
    const syntax = this.generateSPSSSyntax(flattenedData);
    const csvContent = Papa.unparse(flattenedData, { header: true });
    
    // Create a combined file with both data and syntax
    const combinedContent = `* SPSS Data Import Syntax
* Generated on ${new Date().toISOString()}

${syntax}

* Data follows below (save as separate .csv file)
/*
${csvContent}
*/`;

    const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.sps`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'spss'
      }
    };
  }

  private generateSPSSSyntax(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const variableDefinitions = headers.map(header => {
      const sampleValue = data[0][header];
      const variableType = typeof sampleValue === 'number' ? 'F8.2' : 'A255';
      return `  ${header} ${variableType}`;
    }).join('\n');

    return `DATA LIST FILE='analytics_data.csv' DELIMITED
/
${variableDefinitions}.

EXECUTE.

* Variable labels
${headers.map(header => `VARIABLE LABELS ${header} '${this.formatSPSSLabel(header)}'.`).join('\n')}

* Save as SPSS file
SAVE OUTFILE='analytics_data.sav'.`;
  }

  private formatSPSSLabel(header: string): string {
    return header
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  // ============================================================================
  // R Export
  // ============================================================================

  private async exportToR(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const flattenedData = this.flattenAnalyticsData(data, config);
    
    const rScript = this.generateRScript(flattenedData, config);
    const blob = new Blob([rScript], { type: 'text/plain;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.R`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'r'
      }
    };
  }

  private generateRScript(data: any[], config: ExportConfig): string {
    if (data.length === 0) return '# No data to export';

    const headers = Object.keys(data[0]);
    
    // Generate data frame creation
    const dataFrameCode = this.generateRDataFrame(data, headers);
    
    return `# QDesigner Modern Analytics Export
# Generated on ${new Date().toISOString()}

# Load required libraries
library(dplyr)
library(ggplot2)
library(psych)

# Create data frame
${dataFrameCode}

# Data summary
print("Data Summary:")
summary(analytics_data)

# Basic statistics
print("Descriptive Statistics:")
describe(analytics_data)

# Save data
save(analytics_data, file = "analytics_data.RData")
write.csv(analytics_data, "analytics_data.csv", row.names = FALSE)

print("Data export complete. Files saved:")
print("- analytics_data.RData")
print("- analytics_data.csv")`;
  }

  private generateRDataFrame(data: any[], headers: string[]): string {
    const columns = headers.map(header => {
      const values = data.map(row => {
        const value = row[header];
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value ?? 'NA';
      });
      return `  ${header} = c(${values.join(', ')})`;
    });

    return `analytics_data <- data.frame(
${columns.join(',\n')}
)`;
  }

  // ============================================================================
  // Python Export
  // ============================================================================

  private async exportToPython(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const flattenedData = this.flattenAnalyticsData(data, config);
    
    const pythonScript = this.generatePythonScript(flattenedData, config);
    const blob = new Blob([pythonScript], { type: 'text/plain;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.py`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'python'
      }
    };
  }

  private generatePythonScript(data: any[], config: ExportConfig): string {
    if (data.length === 0) return '# No data to export';

    const headers = Object.keys(data[0]);
    
    return `#!/usr/bin/env python3
"""
QDesigner Modern Analytics Export
Generated on ${new Date().toISOString()}
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
import pickle

# Create DataFrame
data = {
${headers.map(header => {
  const values = data.map(row => {
    const value = row[header];
    if (typeof value === 'string') {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value ?? 'None';
  });
  return `    "${header}": [${values.join(', ')}]`;
}).join(',\n')}
}

df = pd.DataFrame(data)

# Display basic information
print("Dataset Information:")
print(df.info())
print("\\nDescriptive Statistics:")
print(df.describe())

# Save data
df.to_csv('analytics_data.csv', index=False)
df.to_pickle('analytics_data.pkl')

print("\\nData export complete. Files saved:")
print("- analytics_data.csv")
print("- analytics_data.pkl")

# Example analysis
print("\\nExample Analysis:")
numeric_cols = df.select_dtypes(include=[np.number]).columns
if len(numeric_cols) > 0:
    print(f"Correlation matrix for numeric columns:")
    print(df[numeric_cols].corr())
    
    # Create some basic plots
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    if len(numeric_cols) >= 1:
        df[numeric_cols[0]].hist(ax=axes[0, 0])
        axes[0, 0].set_title(f'Distribution of {numeric_cols[0]}')
    
    if len(numeric_cols) >= 2:
        df[numeric_cols[1]].hist(ax=axes[0, 1])
        axes[0, 1].set_title(f'Distribution of {numeric_cols[1]}')
        
        # Scatter plot if we have at least 2 numeric columns
        axes[1, 0].scatter(df[numeric_cols[0]], df[numeric_cols[1]])
        axes[1, 0].set_xlabel(numeric_cols[0])
        axes[1, 0].set_ylabel(numeric_cols[1])
        axes[1, 0].set_title(f'{numeric_cols[0]} vs {numeric_cols[1]}')
    
    # Box plot
    if len(numeric_cols) >= 1:
        df[numeric_cols].boxplot(ax=axes[1, 1])
        axes[1, 1].set_title('Box Plot of Numeric Variables')
    
    plt.tight_layout()
    plt.savefig('analytics_plots.png', dpi=300, bbox_inches='tight')
    print("- analytics_plots.png")
    
plt.show()`;
  }

  // ============================================================================
  // Stata Export
  // ============================================================================

  private async exportToStata(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const flattenedData = this.flattenAnalyticsData(data, config);
    
    const stataScript = this.generateStataScript(flattenedData);
    const blob = new Blob([stataScript], { type: 'text/plain;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.do`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'stata'
      }
    };
  }

  private generateStataScript(data: any[]): string {
    if (data.length === 0) return '* No data to export';

    const headers = Object.keys(data[0]);
    
    return `* QDesigner Modern Analytics Export
* Generated on ${new Date().toISOString()}

clear all
set more off

* Import CSV data
import delimited "analytics_data.csv", clear

* Variable labels
${headers.map(header => 
  `label variable ${header} "${this.formatStataLabel(header)}"`
).join('\n')}

* Display data summary
describe
summarize

* Save as Stata dataset
save "analytics_data.dta", replace

* Basic analysis
display "Basic descriptive statistics:"
tabstat *, statistics(mean median sd min max n)

display "Data export complete. File saved: analytics_data.dta"`;
  }

  private formatStataLabel(header: string): string {
    return header
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  // ============================================================================
  // SAS Export
  // ============================================================================

  private async exportToSAS(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<ExportResult> {
    const flattenedData = this.flattenAnalyticsData(data, config);
    
    const sasScript = this.generateSASScript(flattenedData);
    const blob = new Blob([sasScript], { type: 'text/plain;charset=utf-8;' });
    const filename = `analytics_export_${this.generateTimestamp()}.sas`;

    return {
      success: true,
      filename,
      size: blob.size,
      downloadUrl: URL.createObjectURL(blob),
      metadata: {
        recordCount: flattenedData.length,
        columnCount: flattenedData.length > 0 ? Object.keys(flattenedData[0]).length : 0,
        exportTime: 0,
        format: 'sas'
      }
    };
  }

  private generateSASScript(data: any[]): string {
    if (data.length === 0) return '/* No data to export */';

    const headers = Object.keys(data[0]);
    
    return `/* QDesigner Modern Analytics Export */
/* Generated on ${new Date().toISOString()} */

/* Import CSV data */
proc import datafile="analytics_data.csv"
    out=analytics_data
    dbms=csv
    replace;
    getnames=yes;
run;

/* Display data information */
proc contents data=analytics_data;
run;

/* Basic descriptive statistics */
proc means data=analytics_data n mean median std min max;
run;

/* Frequency tables for character variables */
proc freq data=analytics_data;
    tables _character_;
run;

proc print data=analytics_data (obs=10);
    title "First 10 observations";
run;

/* Save as permanent SAS dataset */
libname mylib ".";
data mylib.analytics_data;
    set analytics_data;
run;`;
  }

  // ============================================================================
  // Data Transformation and Utilities
  // ============================================================================

  private async transformData(
    data: AnalyticsData[],
    config: ExportConfig
  ): Promise<AnalyticsData[]> {
    // Apply any data transformations specified in config
    // This is a placeholder for future transformation logic
    return data;
  }

  private flattenAnalyticsData(data: AnalyticsData[], config: ExportConfig): any[] {
    const flattened: any[] = [];

    data.forEach(session => {
      const baseRecord = {
        sessionId: session.sessionId,
        questionnaireId: session.questionnaireId,
        startTime: new Date(session.startTime).toISOString(),
        endTime: session.endTime ? new Date(session.endTime).toISOString() : null,
        completionTime: session.completionTime || null,
        participantId: session.metadata.participantId || null
      };

      if (config.includeMetadata && session.metadata.deviceInfo) {
        Object.assign(baseRecord, {
          devicePlatform: session.metadata.deviceInfo.platform,
          screenWidth: session.metadata.deviceInfo.screen.width,
          screenHeight: session.metadata.deviceInfo.screen.height,
          userAgent: session.metadata.deviceInfo.userAgent
        });
      }

      session.responses.forEach((response, index) => {
        flattened.push({
          ...baseRecord,
          responseIndex: index + 1,
          questionId: response.questionId,
          responseValue: response.value,
          responseTime: response.responseTime || null,
          reactionTime: response.reactionTime || null,
          timeOnQuestion: response.timeOnQuestion || null,
          stimulusOnset: response.stimulusOnset || null,
          isValid: response.valid
        });
      });
    });

    return flattened;
  }

  private calculateDataStatistics(data: AnalyticsData[]): any {
    const responseTimes = data.flatMap(session => 
      session.responses
        .filter(r => r.responseTime !== undefined)
        .map(r => r.responseTime!)
    );

    const reactionTimes = data.flatMap(session => 
      session.responses
        .filter(r => r.reactionTime !== undefined)
        .map(r => r.reactionTime!)
    );

    return {
      sessions: {
        total: data.length,
        completed: data.filter(s => s.endTime).length,
        completionRate: data.filter(s => s.endTime).length / data.length
      },
      responses: {
        total: data.reduce((sum, s) => sum + s.responses.length, 0),
        responseTimeStats: responseTimes.length > 0 ? {
          mean: this.calculateMean(responseTimes),
          median: this.calculateMedian(responseTimes),
          std: this.calculateStdDev(responseTimes),
          min: Math.min(...responseTimes),
          max: Math.max(...responseTimes)
        } : null,
        reactionTimeStats: reactionTimes.length > 0 ? {
          mean: this.calculateMean(reactionTimes),
          median: this.calculateMedian(reactionTimes),
          std: this.calculateStdDev(reactionTimes),
          min: Math.min(...reactionTimes),
          max: Math.max(...reactionTimes)
        } : null
      }
    };
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateStdDev(values: number[]): number {
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private getDateRange(data: AnalyticsData[]): string {
    if (data.length === 0) return 'No data';
    
    const startTimes = data.map(d => d.startTime);
    const minTime = Math.min(...startTimes);
    const maxTime = Math.max(...startTimes);
    
    return `${new Date(minTime).toISOString()} to ${new Date(maxTime).toISOString()}`;
  }

  private generateTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  // ============================================================================
  // Public Utility Methods
  // ============================================================================

  /**
   * Get supported export formats
   */
  getSupportedFormats(): ExportFormat[] {
    return ['csv', 'json', 'xlsx', 'spss', 'r', 'python', 'stata', 'sas'];
  }

  /**
   * Validate export configuration
   */
  validateConfig(config: ExportConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.getSupportedFormats().includes(config.format)) {
      errors.push(`Unsupported format: ${config.format}`);
    }

    if (config.format === 'csv' && config.delimiter && config.delimiter.length !== 1) {
      errors.push('CSV delimiter must be a single character');
    }

    if (config.numberFormat?.decimals !== undefined && config.numberFormat.decimals < 0) {
      errors.push('Number of decimals must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Estimate export file size
   */
  estimateFileSize(data: AnalyticsData[], format: ExportFormat): number {
    const flattenedData = this.flattenAnalyticsData(data, { 
      format, 
      includeMetadata: true, 
      includeRawData: true, 
      includeStatistics: false 
    });
    
    if (flattenedData.length === 0) return 0;

    const sampleRecord = JSON.stringify(flattenedData[0]);
    const bytesPerRecord = sampleRecord.length;
    
    // Rough estimates based on format overhead
    const formatMultipliers = {
      csv: 0.8,      // CSV is compact
      json: 1.2,     // JSON has some overhead
      xlsx: 2.0,     // Excel has significant overhead
      spss: 1.5,     // SPSS syntax + data
      r: 1.3,        // R script + data
      python: 1.4,   // Python script + data
      stata: 1.3,    // Stata do file + data
      sas: 1.3       // SAS script + data
    };

    return Math.round(
      bytesPerRecord * flattenedData.length * (formatMultipliers[format] || 1.0)
    );
  }
}