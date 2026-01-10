// File Upload question storage with specialized aggregations

import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '../shared/types';

interface FileData {
  id: string;
  name: string;
  size: number;
  type: string;
  data: any;
  metadata?: {
    lastModified: number;
    uploadTime: number;
  };
}

export class FileUploadStorage extends BaseQuestionStorage {
  getAnswerType(): string {
    return 'file-upload';
  }

  async getResponses(questionId: string): Promise<QuestionResponse[]> {
    return this.getAllForSession();
  }

  /**
   * Parse stored value
   */
  protected parseValue(value: any): FileData | FileData[] {
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  }

  /**
   * Get total size of all uploaded files
   */
  async getTotalFileSize(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    let totalSize = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.size) {
          totalSize += file.size;
        }
      });
    });
    
    return totalSize;
  }
  
  /**
   * Get file type distribution
   */
  async getFileTypeDistribution(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<string, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.type) {
          // Extract general type (e.g., 'image' from 'image/jpeg')
          const generalType = file.type.split('/')[0] || 'unknown';
          distribution[generalType] = (distribution[generalType] || 0) + 1;
        }
      });
    });
    
    return distribution;
  }
  
  /**
   * Get file extension distribution
   */
  async getFileExtensionDistribution(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<string, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.name) {
          const extension = file.name.split('.').pop()?.toLowerCase() || 'no-extension';
          distribution[extension] = (distribution[extension] || 0) + 1;
        }
      });
    });
    
    return distribution;
  }
  
  /**
   * Get average file size
   */
  async getAverageFileSize(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    let totalSize = 0;
    let fileCount = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.size) {
          totalSize += file.size;
          fileCount++;
        }
      });
    });
    
    return fileCount > 0 ? totalSize / fileCount : 0;
  }
  
  /**
   * Get largest and smallest files
   */
  async getFileSizeExtremes(questionId: string): Promise<{
    largest: FileData | null,
    smallest: FileData | null
  }> {
    const responses = await this.getResponses(questionId);
    let largest: FileData | null = null;
    let smallest: FileData | null = null;
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.size) {
          if (!largest || file.size > largest.size) {
            largest = file;
          }
          if (!smallest || file.size < smallest.size) {
            smallest = file;
          }
        }
      });
    });
    
    return { largest, smallest };
  }
  
  /**
   * Get upload time distribution
   */
  async getUploadTimeDistribution(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<string, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.metadata?.uploadTime) {
          const date = new Date(file.metadata.uploadTime);
          const hour = date.getHours();
          const timeSlot = `${hour.toString().padStart(2, '0')}:00-${(hour + 1).toString().padStart(2, '0')}:00`;
          distribution[timeSlot] = (distribution[timeSlot] || 0) + 1;
        }
      });
    });
    
    return distribution;
  }
  
  /**
   * Get all file names
   */
  async getAllFileNames(questionId: string): Promise<string[]> {
    const responses = await this.getResponses(questionId);
    const fileNames: string[] = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.name) {
          fileNames.push(file.name);
        }
      });
    });
    
    return fileNames;
  }
  
  /**
   * Get files by type
   */
  async getFilesByType(questionId: string, mimeType: string): Promise<FileData[]> {
    const responses = await this.getResponses(questionId);
    const matchingFiles: FileData[] = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value = this.parseValue(response.value);
      const files = Array.isArray(value) ? value : [value];
      
      files.forEach((file: FileData) => {
        if (file?.type && file.type.includes(mimeType)) {
          matchingFiles.push(file);
        }
      });
    });
    
    return matchingFiles;
  }
  
  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Format aggregation results for display
   */
  formatAggregation(type: string, value: any): string {
    switch (type) {
      case 'totalSize':
      case 'averageSize':
        return this.formatFileSize(value);
      case 'extremes':
        if (!value.largest || !value.smallest) return 'N/A';
        return `Largest: ${value.largest.name} (${this.formatFileSize(value.largest.size)}), ` +
               `Smallest: ${value.smallest.name} (${this.formatFileSize(value.smallest.size)})`;
      case 'fileTypes':
        return Object.entries(value)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');
      default:
        return JSON.stringify(value);
    }
  }
  
  /**
   * Get all available aggregations for file upload questions
   */
  async getAllAggregations(questionId: string): Promise<Record<string, any>> {
    const [totalSize, avgSize, fileTypes, extensions, extremes] = await Promise.all([
      this.getTotalFileSize(questionId),
      this.getAverageFileSize(questionId),
      this.getFileTypeDistribution(questionId),
      this.getFileExtensionDistribution(questionId),
      this.getFileSizeExtremes(questionId)
    ]);
    
    return {
      totalSize,
      averageSize: avgSize,
      fileTypes,
      extensions,
      extremes
    };
  }
}