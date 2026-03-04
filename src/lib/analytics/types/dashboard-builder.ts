/**
 * Dashboard Builder Types
 * Types for the configurable drag-and-drop analytics dashboard.
 */

export type WidgetType =
  | 'descriptive-stats'
  | 'histogram'
  | 'time-series'
  | 'completion-funnel'
  | 'reliability'
  | 'irt';

export interface WidgetPosition {
  /** Column start (0-based, 12-column grid) */
  col: number;
  /** Row start (0-based) */
  row: number;
  /** Column span (1-12) */
  colSpan: number;
  /** Row span (1+) */
  rowSpan: number;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: WidgetPosition;
  config: WidgetConfig;
}

export interface WidgetConfig {
  /** Questionnaire ID to pull data from */
  questionnaireId?: string;
  /** Specific question/variable keys */
  keys?: string[];
  /** Refresh interval in ms (0 = manual only) */
  refreshMs?: number;
  /** Chart color scheme */
  colorScheme?: string;
  /** Additional type-specific settings */
  settings?: Record<string, unknown>;
}

export interface DashboardLayout {
  id: string;
  name: string;
  questionnaireId: string;
  widgets: DashboardWidget[];
  /** Grid columns (always 12) */
  columns: 12;
  /** Row height in pixels */
  rowHeight: number;
  /** Gap between widgets in pixels */
  gap: number;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetPaletteItem {
  type: WidgetType;
  label: string;
  description: string;
  icon: string;
  defaultSize: { colSpan: number; rowSpan: number };
}

export const WIDGET_PALETTE: WidgetPaletteItem[] = [
  {
    type: 'descriptive-stats',
    label: 'Descriptive Statistics',
    description: 'Mean, median, SD, quartiles, and distribution summary',
    icon: 'chart-bar',
    defaultSize: { colSpan: 4, rowSpan: 2 },
  },
  {
    type: 'histogram',
    label: 'Histogram',
    description: 'Frequency distribution of response values',
    icon: 'chart-bar',
    defaultSize: { colSpan: 6, rowSpan: 3 },
  },
  {
    type: 'time-series',
    label: 'Time Series',
    description: 'Response trends over time',
    icon: 'chart-bar',
    defaultSize: { colSpan: 6, rowSpan: 3 },
  },
  {
    type: 'completion-funnel',
    label: 'Completion Funnel',
    description: 'Drop-off rates at each question/page',
    icon: 'chart-bar',
    defaultSize: { colSpan: 6, rowSpan: 3 },
  },
  {
    type: 'reliability',
    label: 'Reliability',
    description: "Cronbach's alpha, item-total correlations, split-half reliability",
    icon: 'chart-bar',
    defaultSize: { colSpan: 4, rowSpan: 2 },
  },
  {
    type: 'irt',
    label: 'IRT Analysis',
    description: 'Item response theory parameters and information curves',
    icon: 'chart-bar',
    defaultSize: { colSpan: 6, rowSpan: 3 },
  },
];

export function createDefaultLayout(questionnaireId: string): DashboardLayout {
  return {
    id: crypto.randomUUID(),
    name: 'Default Dashboard',
    questionnaireId,
    widgets: [],
    columns: 12,
    rowHeight: 80,
    gap: 16,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createWidget(
  type: WidgetType,
  position: WidgetPosition,
  config?: Partial<WidgetConfig>
): DashboardWidget {
  const paletteItem = WIDGET_PALETTE.find(p => p.type === type);
  return {
    id: crypto.randomUUID(),
    type,
    title: paletteItem?.label ?? type,
    position,
    config: {
      refreshMs: 0,
      colorScheme: 'default',
      ...config,
    },
  };
}
