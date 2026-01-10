import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '../shared/types';

export class TextInputStorage extends BaseQuestionStorage {
  constructor() {
    super();
  }

  getAnswerType(): string {
    return 'text-input';
  }

  async getResponses(questionId: string): Promise<QuestionResponse[]> {
    return this.getAllForSession();
  }
  
  parseValue(value: any): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return String(value);
  }
  
  formatValue(value: string): any {
    return value || '';
  }
  
  validateResponse(response: QuestionResponse): boolean {

    const value = response.value;
    if (typeof value !== 'string' && value !== null && value !== undefined) {
      console.warn('Text input response must be a string');
      return false;
    }
    
    return true;
  }
  
  // Text-specific aggregations
  async getWordCount(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    const totalWords = responses.reduce((sum: number, r: QuestionResponse) => {
      const text = this.parseValue(r.value);
      return sum + text.split(/\s+/).filter(word => word.length > 0).length;
    }, 0);
    return totalWords;
  }
  
  async getAverageLength(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    if (responses.length === 0) return 0;
    
    const totalLength = responses.reduce((sum: number, r: QuestionResponse) => {
      return sum + this.parseValue(r.value).length;
    }, 0);
    
    return totalLength / responses.length;
  }
  
  async getCommonWords(questionId: string, limit: number = 10): Promise<Array<{word: string, count: number}>> {
    const responses = await this.getResponses(questionId);
    const wordCounts = new Map<string, number>();
    
    // Count word occurrences
    responses.forEach((r: QuestionResponse) => {
      const text = this.parseValue(r.value).toLowerCase();
      const words = text.split(/\s+/).filter(word => word.length > 2); // Ignore very short words
      
      words.forEach(word => {
        // Remove common punctuation
        word = word.replace(/[.,!?;:'"]/g, '');
        if (word) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      });
    });
    
    // Sort by count and return top N
    return Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  
  async getSentimentDistribution(questionId: string): Promise<{positive: number, neutral: number, negative: number}> {
    // Basic sentiment analysis based on keywords
    // In a real implementation, this would use a proper NLP library
    const responses = await this.getResponses(questionId);
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'love', 'wonderful', 'amazing', 'fantastic'];
    const negativeWords = ['bad', 'poor', 'terrible', 'hate', 'awful', 'horrible', 'disappointing', 'worst'];
    
    responses.forEach((r: QuestionResponse) => {
      const text = this.parseValue(r.value).toLowerCase();
      let positiveCount = 0;
      let negativeCount = 0;
      
      positiveWords.forEach(word => {
        if (text.includes(word)) positiveCount++;
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) negativeCount++;
      });
      
      if (positiveCount > negativeCount) {
        sentiments.positive++;
      } else if (negativeCount > positiveCount) {
        sentiments.negative++;
      } else {
        sentiments.neutral++;
      }
    });
    
    return sentiments;
  }
}