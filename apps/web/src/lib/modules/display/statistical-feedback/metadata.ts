import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  type: 'statistical-feedback',
  category: 'display',
  name: 'Statistical Feedback',
  icon: '📈',
  description:
    'Configurable statistical feedback panel with current-session, cohort, and participant comparison modes',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: true,
    supportsVariables: true,
  },
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    runtime: () => import('./StatisticalFeedback.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    designer: () => import('./StatisticalFeedbackDesigner.svelte') as any,
  },
  options: {
    chartTypes: [
      { value: 'bar', label: 'Bar Chart' },
      { value: 'line', label: 'Line Chart' },
      { value: 'radar', label: 'Radar Chart' },
      { value: 'scatter', label: 'Scatter Plot' },
      { value: 'histogram', label: 'Histogram' },
      { value: 'box', label: 'Box Plot' },
    ],
  },
  defaultConfig: {
    config: {
      title: 'Statistical Feedback',
      subtitle: 'Instant metrics from your questionnaire data',
      chartType: 'bar',
      sourceMode: 'current-session',
      metric: 'mean',
      showPercentile: true,
      showSummary: true,
      refreshMs: 0,
      dataSource: {
        questionnaireId: '',
        source: 'variable',
        key: '',
        currentVariable: '',
        participantId: '{{participantId}}',
        comparisonParticipantId: '',
      },
    },
    dataSource: {
      variables: [],
      aggregation: 'none',
    },
    visualization: {
      title: 'Statistical Feedback',
      subtitle: '',
      showLegend: false,
      showGrid: true,
      showTooltips: true,
      colorScheme: 'default',
    },
    autoAdvance: true,
    displayDuration: 3500,
  },
};
