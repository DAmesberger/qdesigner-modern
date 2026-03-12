// Analytics block types

import type { AnalyticsBlock } from '$lib/modules/types';

// Extended analytics block configuration
export interface AnalyticsBlockConfig extends AnalyticsBlock {
  // Visualization-specific config will be added by each block type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- visualization config varies by block type
  visualConfig?: any;
  
  // Update frequency for real-time data
  refreshInterval?: number;
  
  // Export options
  exportable?: boolean;
  exportFormats?: ('png' | 'svg' | 'csv' | 'json')[];
}

// Base calculation result
export interface CalculationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- calculation result can be any type
  value: any;
  formula: string;
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic calculation inputs
  inputs: Record<string, any>;
  error?: string;
}

// Data point for visualizations
export interface DataPoint {
  label: string;
  value: number | string | boolean;
  metadata?: Record<string, unknown>;
}

// Series data for multi-series visualizations
export interface DataSeries {
  name: string;
  data: DataPoint[];
  color?: string;
  type?: string;
}

// Analytics block metadata extension
export interface AnalyticsBlockMetadata {
  supportsRealtime?: boolean;
  supportsMultipleSeries?: boolean;
  supportsInteractivity?: boolean;
  requiredDataTypes?: string[];
  optimalDataSize?: { min?: number; max?: number };
}