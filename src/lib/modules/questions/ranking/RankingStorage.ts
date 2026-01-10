import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '../shared/types';

export class RankingStorage extends BaseQuestionStorage {
  constructor() {
    super();
  }

  getAnswerType(): string {
    return 'ranking';
  }
  
  parseValue(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(v => typeof v === 'string');
  }
  
  formatValue(value: string[]): any {
    return value || [];
  }
  
  validateResponse(response: QuestionResponse): boolean {

    const value = response.value;
    if (!Array.isArray(value)) {
      console.warn('Ranking response must be an array');
      return false;
    }
    
    // Check for duplicates
    const uniqueItems = new Set(value);
    if (uniqueItems.size !== value.length) {
      console.warn('Ranking response contains duplicate items');
      return false;
    }
    
    return true;
  }
  
  // Helper to get responses (mock implementation matching usage pattern)
  async getResponses(questionId: string): Promise<QuestionResponse[]> {
    return this.getAllForSession();
  }

  // Ranking-specific aggregations
  async getAverageRankPerItem(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const rankSums: Record<string, { sum: number; count: number }> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const ranking = this.parseValue(response.value);
      ranking.forEach((itemId: string, index: number) => {
        if (!rankSums[itemId]) {
          rankSums[itemId] = { sum: 0, count: 0 };
        }
        rankSums[itemId].sum += index + 1; // Rank is 1-based
        rankSums[itemId].count++;
      });
    });
    
    const averageRanks: Record<string, number> = {};
    Object.entries(rankSums).forEach(([itemId, { sum, count }]) => {
      averageRanks[itemId] = count > 0 ? sum / count : 0;
    });
    
    return averageRanks;
  }
  
  async getTopRankedItems(questionId: string, topN: number = 3): Promise<Array<{itemId: string, score: number}>> {
    const averageRanks = await this.getAverageRankPerItem(questionId);
    
    return Object.entries(averageRanks)
      .map(([itemId, avgRank]) => ({ itemId, score: avgRank }))
      .sort((a, b) => a.score - b.score) // Lower rank number is better
      .slice(0, topN);
  }
  
  async getRankingConsensus(questionId: string): Promise<number> {
    // Calculate Kendall's W (coefficient of concordance)
    // 0 = no agreement, 1 = complete agreement
    const responses = await this.getResponses(questionId);
    if (responses.length < 2) return 0;
    
    const rankings = responses.map(r => this.parseValue(r.value));
    const allItems = new Set<string>();
    rankings.forEach((ranking: string[]) => ranking.forEach((item: string) => allItems.add(item)));
    
    const items = Array.from(allItems);
    const n = responses.length; // number of raters
    const k = items.length; // number of items
    
    // Calculate rank sums for each item
    const rankSums = new Map<string, number>();
    items.forEach(item => rankSums.set(item, 0));
    
    rankings.forEach((ranking: string[]) => {
      ranking.forEach((itemId: string, index: number) => {
        const currentSum = rankSums.get(itemId) || 0;
        rankSums.set(itemId, currentSum + index + 1);
      });
    });
    
    // Calculate mean rank sum
    const meanRankSum = (n * (k + 1)) / 2;
    
    // Calculate sum of squared deviations
    let sumSquaredDeviations = 0;
    rankSums.forEach(sum => {
      sumSquaredDeviations += Math.pow(sum - meanRankSum, 2);
    });
    
    // Calculate Kendall's W
    const maxSumSquaredDeviations = (n * n * k * (k * k - 1)) / 12;
    const w = sumSquaredDeviations / maxSumSquaredDeviations;
    
    return Math.min(1, Math.max(0, w));
  }
  
  async getPartialRankingRate(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    if (responses.length === 0) return 0;
    
    // Need to know total items to calculate partial rate
    // For now, we'll find the max number of unique items across all responses
    const allItems = new Set<string>();
    responses.forEach((response: QuestionResponse) => {
      const ranking = this.parseValue(response.value);
      ranking.forEach((item: string) => allItems.add(item));
    });
    
    const totalItems = allItems.size;
    let partialCount = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const ranking = this.parseValue(response.value);
      if (ranking.length < totalItems) {
        partialCount++;
      }
    });
    
    return partialCount / responses.length;
  }
  
  async getRankingPatterns(questionId: string): Promise<Array<{pattern: string[], count: number}>> {
    const responses = await this.getResponses(questionId);
    const patternCounts = new Map<string, number>();
    
    responses.forEach((response: QuestionResponse) => {
      const ranking = this.parseValue(response.value);
      const patternKey = JSON.stringify(ranking);
      patternCounts.set(patternKey, (patternCounts.get(patternKey) || 0) + 1);
    });
    
    return Array.from(patternCounts.entries())
      .map(([pattern, count]) => ({ pattern: JSON.parse(pattern), count }))
      .sort((a, b) => b.count - a.count);
  }
}