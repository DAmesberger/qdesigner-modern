// Analytics module types

import type { BaseModuleConfig, ModuleCategory } from '$lib/modules/types';

export interface AnalyticsModuleConfig extends BaseModuleConfig {
  category: 'display';
  dataSource: {
    variables: string[]; // Variable IDs to visualize
    aggregation?: 'none' | 'mean' | 'sum' | 'count' | 'min' | 'max';
    groupBy?: string; // Variable to group by
  };
  visualization: {
    title?: string;
    subtitle?: string;
    showLegend?: boolean;
    showGrid?: boolean;
    showTooltips?: boolean;
    colorScheme?: 'default' | 'categorical' | 'sequential' | 'diverging';
    customColors?: string[];
  };
  // Analytics don't have answers, they just display data
  config: Record<string, any>;
}

export interface AnalyticsProps {
  analytics: AnalyticsModuleConfig;
  mode?: 'edit' | 'preview' | 'runtime';
  variables?: Record<string, any>;
  data?: any[]; // Computed data for visualization
  onUpdate?: (updates: Partial<AnalyticsModuleConfig>) => void;
  onInteraction?: (event: AnalyticsInteractionEvent) => void;
}

export interface AnalyticsInteractionEvent {
  type: 'view' | 'hover' | 'click' | 'zoom' | 'pan';
  timestamp: number;
  data?: any;
}

export interface AnalyticsAggregation {
  type: string;
  label: string;
  compute: (values: any[]) => any;
}

export interface ChartDataPoint {
  x: any;
  y: any;
  label?: string;
  color?: string;
  size?: number;
}

export interface ChartDataset {
  label: string;
  data: ChartDataPoint[] | number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
  pointRadius?: number;
}

export interface ChartConfiguration {
  type: string;
  data: {
    labels?: string[];
    datasets: ChartDataset[];
  };
  options?: Record<string, any>;
}