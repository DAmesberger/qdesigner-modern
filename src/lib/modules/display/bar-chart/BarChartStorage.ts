// Bar chart analytics storage

import { BaseAnalyticsStorage } from '../shared/analytics/BaseStorage';

export class BarChartStorage extends BaseAnalyticsStorage {
  /**
   * Track specific bar chart interactions
   */
  async trackBarClick(analyticsId: string, data: {
    datasetIndex: number;
    barIndex: number;
    value: number;
    label?: string;
  }): Promise<void> {
    await this.trackInteraction(analyticsId, {
      type: 'click',
      data: {
        ...data,
        chartType: 'bar'
      }
    });
  }
  
  /**
   * Get click patterns
   */
  async getClickPatterns(analyticsId: string): Promise<{
    mostClickedDataset: number | null;
    mostClickedBar: number | null;
    clickDistribution: Record<string, number>;
  }> {
    const events = await this.getEvents(analyticsId);
    const clicks = events.filter(e => e.interaction === 'click');
    
    if (clicks.length === 0) {
      return {
        mostClickedDataset: null,
        mostClickedBar: null,
        clickDistribution: {}
      };
    }
    
    const datasetCounts: Record<number, number> = {};
    const barCounts: Record<number, number> = {};
    const distribution: Record<string, number> = {};
    
    clicks.forEach(click => {
      if (click.data) {
        const { datasetIndex, barIndex } = click.data;
        
        datasetCounts[datasetIndex] = (datasetCounts[datasetIndex] || 0) + 1;
        barCounts[barIndex] = (barCounts[barIndex] || 0) + 1;
        
        const key = `${datasetIndex}-${barIndex}`;
        distribution[key] = (distribution[key] || 0) + 1;
      }
    });
    
    // Find most clicked
    const mostClickedDataset = Object.entries(datasetCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];
    
    const mostClickedBar = Object.entries(barCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];
    
    return {
      mostClickedDataset: mostClickedDataset ? Number(mostClickedDataset) : null,
      mostClickedBar: mostClickedBar ? Number(mostClickedBar) : null,
      clickDistribution: distribution
    };
  }
}