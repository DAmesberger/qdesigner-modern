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
    runtime: () => import('./StatisticalFeedback.svelte') as any,
    designer: () => import('./StatisticalFeedbackDesigner.svelte') as any,
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
