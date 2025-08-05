import type { Response, ExportFormat, DescriptiveStats, AnalyticsReport } from '../types';

export class DataExporter {
  // Export to CSV format
  exportToCSV(responses: Response[], options?: ExportFormat['options']): Blob {
    const delimiter = options?.delimiter || ',';
    const includeHeaders = options?.includeHeaders !== false;
    const missingValue = options?.missingValue || '';
    
    // Get unique question IDs to create columns
    const questionIds = Array.from(new Set(responses.map(r => r.questionId))).sort();
    
    // Group responses by participant and session
    const grouped = this.groupResponses(responses);
    
    // Build CSV content
    let csv = '';
    
    // Headers
    if (includeHeaders) {
      const headers = [
        'participant_id',
        'session_id',
        'timestamp',
        ...questionIds.map(q => `q${q}`),
        ...questionIds.map(q => `q${q}_rt`) // Reaction times
      ];
      csv += headers.join(delimiter) + '\n';
    }
    
    // Data rows
    grouped.forEach(row => {
      const values = [
        row.participantId,
        row.sessionId,
        row.timestamp,
        ...questionIds.map(qId => {
          const response = row.responses.find(r => r.questionId === qId);
          return response ? this.formatValue(response.value) : missingValue;
        }),
        ...questionIds.map(qId => {
          const response = row.responses.find(r => r.questionId === qId);
          return response?.reactionTime || missingValue;
        })
      ];
      csv += values.join(delimiter) + '\n';
    });
    
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  }
  
  // Export to SPSS syntax format
  exportToSPSS(responses: Response[], metadata?: any): Blob {
    const questionIds = Array.from(new Set(responses.map(r => r.questionId))).sort();
    
    let syntax = `* SPSS Syntax for QDesigner Modern Data Import.
* Generated on ${new Date().toISOString()}.

DATA LIST FREE FILE='data.csv' / 
  participant_id (A20)
  session_id (A20) 
  timestamp (F14.0)`;
    
    // Add variable definitions
    questionIds.forEach(qId => {
      syntax += `\n  q${qId} (F8.2)`;
      syntax += `\n  q${qId}_rt (F10.0)`;
    });
    
    syntax += '.\n\n';
    
    // Add variable labels
    syntax += 'VARIABLE LABELS\n';
    syntax += "  participant_id 'Participant ID'\n";
    syntax += "  session_id 'Session ID'\n";
    syntax += "  timestamp 'Response Timestamp'";
    
    questionIds.forEach(qId => {
      const label = metadata?.questions?.[qId]?.title || `Question ${qId}`;
      syntax += `\n  q${qId} '${label}'`;
      syntax += `\n  q${qId}_rt '${label} - Reaction Time (ms)'`;
    });
    
    syntax += '.\n\n';
    
    // Add value labels if categorical
    const categoricalQuestions = questionIds.filter(qId => {
      const question = metadata?.questions?.[qId];
      return question?.type === 'multiple-choice' || question?.type === 'scale';
    });
    
    if (categoricalQuestions.length > 0) {
      syntax += 'VALUE LABELS\n';
      categoricalQuestions.forEach(qId => {
        const question = metadata?.questions?.[qId];
        if (question?.options) {
          syntax += `  q${qId}\n`;
          question.options.forEach((opt: any) => {
            syntax += `    ${opt.value} '${opt.label}'\n`;
          });
        }
      });
      syntax += '.\n\n';
    }
    
    // Add basic analysis commands
    syntax += '* Basic descriptive statistics.\n';
    syntax += 'DESCRIPTIVES VARIABLES=';
    syntax += questionIds.map(q => `q${q}`).join(' ');
    syntax += '\n  /STATISTICS=MEAN STDDEV MIN MAX.\n\n';
    
    syntax += '* Frequency tables for categorical variables.\n';
    if (categoricalQuestions.length > 0) {
      syntax += 'FREQUENCIES VARIABLES=';
      syntax += categoricalQuestions.map(q => `q${q}`).join(' ');
      syntax += '.\n';
    }
    
    return new Blob([syntax], { type: 'text/plain;charset=utf-8;' });
  }
  
  // Export to R script format
  exportToR(responses: Response[], stats?: DescriptiveStats[]): Blob {
    let script = `# R Script for QDesigner Modern Data Analysis
# Generated on ${new Date().toISOString()}

# Load required libraries
library(tidyverse)
library(psych)
library(ggplot2)

# Read data
data <- read.csv("data.csv", header = TRUE, stringsAsFactors = FALSE)

# Convert timestamp to datetime
data$timestamp <- as.POSIXct(data$timestamp / 1000, origin = "1970-01-01")

# Basic structure
str(data)
summary(data)

# Descriptive statistics
desc_stats <- describe(data[, grep("^q[0-9]+$", names(data))])
print(desc_stats)

# Reaction time analysis
rt_columns <- grep("_rt$", names(data), value = TRUE)
if (length(rt_columns) > 0) {
  rt_stats <- describe(data[, rt_columns])
  print("Reaction Time Statistics:")
  print(rt_stats)
  
  # Plot reaction time distributions
  rt_data <- data[, rt_columns]
  rt_long <- pivot_longer(rt_data, everything(), names_to = "question", values_to = "rt")
  
  ggplot(rt_long, aes(x = rt)) +
    geom_histogram(bins = 30, fill = "skyblue", color = "black") +
    facet_wrap(~ question, scales = "free") +
    theme_minimal() +
    labs(title = "Reaction Time Distributions by Question",
         x = "Reaction Time (ms)", y = "Frequency")
}

# Correlation matrix
cor_matrix <- cor(data[, grep("^q[0-9]+$", names(data))], use = "complete.obs")
print("Correlation Matrix:")
print(round(cor_matrix, 3))

# Visualization of correlation matrix
library(corrplot)
corrplot(cor_matrix, method = "color", type = "upper", 
         order = "hclust", tl.cex = 0.8, tl.col = "black")

# Reliability analysis (if scale items)
# Uncomment and modify based on your scale structure
# alpha_result <- alpha(data[, c("q1", "q2", "q3", "q4", "q5")])
# print(alpha_result)
`;
    
    // Add provided statistics if available
    if (stats && stats.length > 0) {
      script += '\n\n# Pre-calculated Statistics from QDesigner\n';
      stats.forEach((stat, index) => {
        script += `\n# Question ${index + 1} Statistics\n`;
        script += `q${index + 1}_stats <- list(\n`;
        script += `  n = ${stat.n},\n`;
        script += `  mean = ${stat.mean},\n`;
        script += `  median = ${stat.median},\n`;
        script += `  sd = ${stat.std},\n`;
        script += `  min = ${stat.min},\n`;
        script += `  max = ${stat.max},\n`;
        script += `  skewness = ${stat.skewness},\n`;
        script += `  kurtosis = ${stat.kurtosis}\n`;
        script += ')\n';
      });
    }
    
    return new Blob([script], { type: 'text/plain;charset=utf-8;' });
  }
  
  // Export to Python script format
  exportToPython(responses: Response[], report?: AnalyticsReport): Blob {
    let script = `# Python Script for QDesigner Modern Data Analysis
# Generated on ${new Date().toISOString()}

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
from datetime import datetime

# Configure display options
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
sns.set_style("whitegrid")

# Read data
data = pd.read_csv("data.csv")

# Convert timestamp to datetime
data['timestamp'] = pd.to_datetime(data['timestamp'], unit='ms')

# Display basic information
print("Data Shape:", data.shape)
print("\\nData Types:")
print(data.dtypes)
print("\\nFirst 5 rows:")
print(data.head())

# Identify question columns and reaction time columns
question_cols = [col for col in data.columns if col.startswith('q') and not col.endswith('_rt')]
rt_cols = [col for col in data.columns if col.endswith('_rt')]

# Descriptive statistics
print("\\n" + "="*50)
print("DESCRIPTIVE STATISTICS")
print("="*50)
desc_stats = data[question_cols].describe()
print(desc_stats)

# Additional statistics
for col in question_cols:
    print(f"\\n{col} Statistics:")
    print(f"  Skewness: {stats.skew(data[col].dropna()):.3f}")
    print(f"  Kurtosis: {stats.kurtosis(data[col].dropna()):.3f}")

# Reaction time analysis
if rt_cols:
    print("\\n" + "="*50)
    print("REACTION TIME ANALYSIS")
    print("="*50)
    rt_stats = data[rt_cols].describe()
    print(rt_stats)
    
    # Plot reaction time distributions
    fig, axes = plt.subplots(len(rt_cols), 1, figsize=(10, 4*len(rt_cols)))
    if len(rt_cols) == 1:
        axes = [axes]
    
    for i, col in enumerate(rt_cols):
        axes[i].hist(data[col].dropna(), bins=30, alpha=0.7, color='skyblue', edgecolor='black')
        axes[i].set_xlabel('Reaction Time (ms)')
        axes[i].set_ylabel('Frequency')
        axes[i].set_title(f'{col} Distribution')
        axes[i].axvline(data[col].mean(), color='red', linestyle='--', label=f'Mean: {data[col].mean():.0f}ms')
        axes[i].legend()
    
    plt.tight_layout()
    plt.savefig('reaction_times.png', dpi=300, bbox_inches='tight')
    plt.show()

# Correlation analysis
print("\\n" + "="*50)
print("CORRELATION ANALYSIS")
print("="*50)
corr_matrix = data[question_cols].corr()
print("Correlation Matrix:")
print(corr_matrix.round(3))

# Visualize correlation matrix
plt.figure(figsize=(10, 8))
sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', center=0, 
            square=True, linewidths=1, cbar_kws={"shrink": 0.8})
plt.title('Correlation Matrix of Questions')
plt.tight_layout()
plt.savefig('correlation_matrix.png', dpi=300, bbox_inches='tight')
plt.show()

# Distribution plots for each question
fig, axes = plt.subplots(len(question_cols), 1, figsize=(10, 4*len(question_cols)))
if len(question_cols) == 1:
    axes = [axes]

for i, col in enumerate(question_cols):
    data_clean = data[col].dropna()
    axes[i].hist(data_clean, bins=20, alpha=0.7, color='green', edgecolor='black')
    axes[i].set_xlabel('Response Value')
    axes[i].set_ylabel('Frequency')
    axes[i].set_title(f'{col} Response Distribution')
    
    # Add normal distribution overlay
    mu, std = data_clean.mean(), data_clean.std()
    x = np.linspace(data_clean.min(), data_clean.max(), 100)
    axes[i].plot(x, len(data_clean) * (data_clean.max() - data_clean.min()) / 20 * 
                 stats.norm.pdf(x, mu, std), 'r-', linewidth=2, label='Normal')
    axes[i].legend()

plt.tight_layout()
plt.savefig('response_distributions.png', dpi=300, bbox_inches='tight')
plt.show()

# Cronbach's Alpha (example for scale reliability)
def cronbach_alpha(df):
    """Calculate Cronbach's alpha for scale reliability"""
    df_std = df.loc[:, df.std() > 0]  # Remove zero variance items
    n_items = df_std.shape[1]
    if n_items < 2:
        return np.nan
    
    item_variances = df_std.var(axis=0, ddof=1)
    total_variance = df_std.sum(axis=1).var(ddof=1)
    
    return (n_items / (n_items - 1)) * (1 - item_variances.sum() / total_variance)

# Example: Calculate alpha for all question items
# Modify this based on your scale structure
if len(question_cols) > 1:
    alpha = cronbach_alpha(data[question_cols])
    print(f"\\nCronbach's Alpha (all items): {alpha:.3f}")

# Save processed data
data.to_csv('processed_data.csv', index=False)
print("\\nProcessed data saved to 'processed_data.csv'")
`;
    
    // Add report data if available
    if (report) {
      script += `\n\n# QDesigner Analytics Report Data\n`;
      script += `report_summary = ${JSON.stringify(report.summary, null, 2)}\n`;
      script += `print("\\nQDesigner Report Summary:")\n`;
      script += `print(report_summary)\n`;
    }
    
    return new Blob([script], { type: 'text/plain;charset=utf-8;' });
  }
  
  // Export to Excel format (using CSV with multiple sheets info)
  exportToExcel(responses: Response[], stats?: DescriptiveStats[]): Blob {
    // For now, create a structured CSV that can be imported to Excel
    // In production, you'd use a library like ExcelJS
    
    let excel = 'Sheet: Responses\n';
    excel += this.exportToCSV(responses).toString();
    
    if (stats && stats.length > 0) {
      excel += '\n\nSheet: Descriptive Statistics\n';
      excel += 'Question,N,Mean,Median,Mode,Std Dev,Min,Max,Skewness,Kurtosis\n';
      
      stats.forEach((stat, index) => {
        excel += [
          `Q${index + 1}`,
          stat.n,
          stat.mean.toFixed(3),
          stat.median.toFixed(3),
          Array.isArray(stat.mode) ? stat.mode.join(';') : stat.mode,
          stat.std.toFixed(3),
          stat.min.toFixed(3),
          stat.max.toFixed(3),
          stat.skewness.toFixed(3),
          stat.kurtosis.toFixed(3)
        ].join(',') + '\n';
      });
    }
    
    return new Blob([excel], { type: 'text/csv;charset=utf-8;' });
  }
  
  // Export to JSON format
  exportToJSON(responses: Response[], pretty: boolean = true): Blob {
    const data = {
      metadata: {
        exportDate: new Date().toISOString(),
        responseCount: responses.length,
        participantCount: new Set(responses.map(r => r.participantId)).size,
        questionCount: new Set(responses.map(r => r.questionId)).size
      },
      responses: responses
    };
    
    const json = pretty 
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    
    return new Blob([json], { type: 'application/json;charset=utf-8;' });
  }
  
  // Helper methods
  private groupResponses(responses: Response[]) {
    const grouped = new Map<string, any>();
    
    responses.forEach(response => {
      const key = `${response.participantId}_${response.sessionId}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          participantId: response.participantId,
          sessionId: response.sessionId,
          timestamp: response.timestamp,
          responses: []
        });
      }
      
      grouped.get(key).responses.push(response);
    });
    
    return Array.from(grouped.values());
  }
  
  private formatValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
  
  // Main export method
  async exportData(
    responses: Response[], 
    format: ExportFormat,
    additionalData?: {
      stats?: DescriptiveStats[];
      report?: AnalyticsReport;
      metadata?: any;
    }
  ): Promise<Blob> {
    switch (format.type) {
      case 'csv':
        return this.exportToCSV(responses, format.options);
        
      case 'spss':
        return this.exportToSPSS(responses, additionalData?.metadata);
        
      case 'r':
        return this.exportToR(responses, additionalData?.stats);
        
      case 'python':
        return this.exportToPython(responses, additionalData?.report);
        
      case 'excel':
        return this.exportToExcel(responses, additionalData?.stats);
        
      case 'json':
        return this.exportToJSON(responses, true);
        
      default:
        throw new Error(`Unsupported export format: ${format.type}`);
    }
  }
}

// Singleton instance
export const dataExporter = new DataExporter();