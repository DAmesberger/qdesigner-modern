/**
 * Cross-Project Analytics
 *
 * Provides aggregation and comparison of response data across multiple
 * questionnaires within an organization, leveraging the backend
 * `/api/organizations/{org_id}/analytics` endpoint and the existing
 * StatisticalEngine for client-side supplementary computations.
 */

import { api } from '$lib/services/api';
import type {
  CrossProjectAnalyticsData,
  QuestionnaireAnalytics,
  CrossComparison,
  SessionStatsSummary,
} from '$lib/types/api';
import { StatisticalEngine } from './StatisticalEngine';

export interface CompareQuestionnaireOptions {
  organizationId: string;
  questionnaireIds: string[];
  metrics?: string[];
  source?: 'variable' | 'response';
  key?: string;
}

export interface VariableCorrelationResult {
  questionnaireA: string;
  questionnaireB: string;
  correlation: number | null;
  sampleSize: number;
}

export class CrossProjectAnalytics {
  private static instance: CrossProjectAnalytics;
  private engine: StatisticalEngine;

  private constructor() {
    this.engine = StatisticalEngine.getInstance();
  }

  static getInstance(): CrossProjectAnalytics {
    if (!CrossProjectAnalytics.instance) {
      CrossProjectAnalytics.instance = new CrossProjectAnalytics();
    }
    return CrossProjectAnalytics.instance;
  }

  // --------------------------------------------------------------------------
  // Core Methods
  // --------------------------------------------------------------------------

  /**
   * Compare multiple questionnaires within an organization.
   * Delegates the heavy lifting to the backend endpoint which aggregates
   * response counts, completion rates, timing stats, and variable stats
   * across all requested questionnaire IDs.
   */
  async compareQuestionnaires(
    options: CompareQuestionnaireOptions
  ): Promise<CrossProjectAnalyticsData> {
    if (!options.organizationId) {
      throw new Error('Organization ID is required for cross-project analytics');
    }
    if (!options.questionnaireIds.length) {
      throw new Error('At least one questionnaire ID is required');
    }

    return api.organizations.analytics(options.organizationId, {
      questionnaireIds: options.questionnaireIds,
      metrics: options.metrics,
      source: options.source,
      key: options.key,
    });
  }

  /**
   * Aggregate response data across multiple questionnaires and return
   * a unified set of stats.  Essentially a convenience wrapper that
   * returns just the aggregate portion of the cross-project analytics.
   */
  async aggregateResponses(
    organizationId: string,
    questionnaireIds: string[],
    options?: { source?: 'variable' | 'response'; key?: string }
  ): Promise<{
    totalResponses: number;
    totalCompletedSessions: number;
    overallCompletionRate: number;
    timingStats: SessionStatsSummary | null;
    variableStats: SessionStatsSummary | null;
  }> {
    const result = await this.compareQuestionnaires({
      organizationId,
      questionnaireIds,
      source: options?.source,
      key: options?.key,
    });

    return {
      totalResponses: result.aggregate.totalResponses,
      totalCompletedSessions: result.aggregate.totalCompletedSessions,
      overallCompletionRate: result.aggregate.overallCompletionRate,
      timingStats: result.aggregate.overallTimingStats,
      variableStats: result.aggregate.overallVariableStats,
    };
  }

  /**
   * Correlate a specific variable across two questionnaires.
   * Uses the cross-comparison data returned by the backend (Pearson r).
   */
  async correlateVariables(
    organizationId: string,
    questionnaireAId: string,
    questionnaireBId: string,
    variableKey: string,
    source: 'variable' | 'response' = 'variable'
  ): Promise<VariableCorrelationResult> {
    const result = await this.compareQuestionnaires({
      organizationId,
      questionnaireIds: [questionnaireAId, questionnaireBId],
      source,
      key: variableKey,
      metrics: ['correlation'],
    });

    const comparison = result.crossComparisons?.find(
      (c) =>
        (c.questionnaireA === questionnaireAId && c.questionnaireB === questionnaireBId) ||
        (c.questionnaireA === questionnaireBId && c.questionnaireB === questionnaireAId)
    );

    // Determine sample size from the smaller questionnaire
    const sampleA =
      result.questionnaires.find((q) => q.questionnaireId === questionnaireAId)?.responseCount ?? 0;
    const sampleB =
      result.questionnaires.find((q) => q.questionnaireId === questionnaireBId)?.responseCount ?? 0;

    return {
      questionnaireA: questionnaireAId,
      questionnaireB: questionnaireBId,
      correlation: comparison?.correlation ?? null,
      sampleSize: Math.min(sampleA, sampleB),
    };
  }

  // --------------------------------------------------------------------------
  // Client-Side Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute an effect size (Cohen's d) between two questionnaires based on
   * their per-questionnaire variable stats returned from the backend.
   */
  computeEffectSize(
    statsA: SessionStatsSummary,
    statsB: SessionStatsSummary
  ): number | null {
    if (
      statsA.mean === null ||
      statsB.mean === null ||
      statsA.stdDev === null ||
      statsB.stdDev === null
    ) {
      return null;
    }

    const pooledStd = Math.sqrt(
      (statsA.stdDev * statsA.stdDev + statsB.stdDev * statsB.stdDev) / 2
    );

    if (pooledStd === 0) return null;
    return (statsA.mean - statsB.mean) / pooledStd;
  }

  /**
   * Rank questionnaires by a given metric, returning them sorted.
   */
  rankByMetric(
    questionnaires: QuestionnaireAnalytics[],
    metric: 'completionRate' | 'responseCount' | 'mean' | 'median',
    ascending = false
  ): QuestionnaireAnalytics[] {
    const sorted = [...questionnaires].sort((a, b) => {
      let valA: number;
      let valB: number;

      switch (metric) {
        case 'completionRate':
          valA = a.completionRate;
          valB = b.completionRate;
          break;
        case 'responseCount':
          valA = a.responseCount;
          valB = b.responseCount;
          break;
        case 'mean':
          valA = a.variableStats?.mean ?? 0;
          valB = b.variableStats?.mean ?? 0;
          break;
        case 'median':
          valA = a.variableStats?.median ?? 0;
          valB = b.variableStats?.median ?? 0;
          break;
        default:
          valA = 0;
          valB = 0;
      }

      return ascending ? valA - valB : valB - valA;
    });

    return sorted;
  }

  /**
   * Summarize cross-comparisons into a human-readable format.
   */
  summarizeCrossComparisons(
    comparisons: CrossComparison[],
    questionnaireMap: Map<string, string>
  ): Array<{
    nameA: string;
    nameB: string;
    meanDelta: number | null;
    medianDelta: number | null;
    correlation: number | null;
    correlationStrength: string;
  }> {
    return comparisons.map((c) => {
      const nameA = questionnaireMap.get(c.questionnaireA) ?? c.questionnaireA;
      const nameB = questionnaireMap.get(c.questionnaireB) ?? c.questionnaireB;

      let correlationStrength = 'none';
      if (c.correlation !== null) {
        const abs = Math.abs(c.correlation);
        if (abs >= 0.7) correlationStrength = 'strong';
        else if (abs >= 0.4) correlationStrength = 'moderate';
        else if (abs >= 0.2) correlationStrength = 'weak';
        else correlationStrength = 'negligible';
      }

      return {
        nameA,
        nameB,
        meanDelta: c.meanDelta,
        medianDelta: c.medianDelta,
        correlation: c.correlation,
        correlationStrength,
      };
    });
  }
}
