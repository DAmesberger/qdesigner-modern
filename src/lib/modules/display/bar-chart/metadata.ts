// Bar chart display metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../../questions/shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'bar-chart',
  category: 'display',
  name: 'Bar Chart',
  icon: '📊',
  description: 'Visualize data as vertical or horizontal bars with optional error bars',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: false,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./BarChart.svelte') as any,
    designer: () => import('./BarChartDesigner.svelte') as any
  },
  defaultConfig: {
    display: {
      prompt: 'Chart Feedback',
      chartType: 'bar', // Explicitly set for StatisticalFeedbackConfig
      dataSource: '', // Required by StatisticalFeedbackConfig
      orientation: 'horizontal' as 'vertical' | 'horizontal',
      showErrorBars: false,
      errorType: 'standardError' as 'standardError' | 'standardDeviation' | 'confidence95',
      stacked: false,
      showValues: true,
      showDataLabels: true,
      barWidth: 0.8,
      barSpacing: 0.2,
      value: '', // Main value to display (can be variable or formula)
      referenceValue: '', // Reference value for comparison (can be variable or formula)
      colors: {
        scheme: 'default',
        customColors: []
      },
      axes: {
        x: {
          label: '',
          showGrid: false,
          showTicks: true
        },
        y: {
          label: '',
          showGrid: true,
          showTicks: true,
          min: 'auto',
          max: 'auto'
        }
      }
    }
  }
};