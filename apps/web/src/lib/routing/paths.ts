const encodeSegment = (value: string): string => encodeURIComponent(value);

export const appPaths = {
  home: (): string => '/',
  login: (): string => '/login',
  dashboard: (): string => '/dashboard',
  projects: (): string => '/projects',
  onboardingOrganization: (): string => '/onboarding/organization',

  project: (projectId: string): string => `/projects/${encodeSegment(projectId)}`,
  projectDesigner: (projectId: string, questionnaireId: string): string =>
    `/projects/${encodeSegment(projectId)}/designer/${encodeSegment(questionnaireId)}`,
  projectDesignerNew: (
    projectId: string,
    options?: { name?: string; description?: string }
  ): string => {
    const path = `/projects/${encodeSegment(projectId)}/designer/new`;
    if (!options) return path;

    const query = new URLSearchParams();
    if (options.name) query.set('name', options.name);
    if (options.description) query.set('description', options.description);
    const suffix = query.toString();
    return suffix ? `${path}?${suffix}` : path;
  },
  // Public fillout code — first 8 hex chars of the questionnaire UUID, upper-cased.
  // Mirrors the server's by-code lookup (see get_questionnaire_by_code) and the
  // designer's DistributionPanel; there is no stored code column.
  questionnaireFilloutCode: (questionnaireId: string): string =>
    questionnaireId.replace(/-/g, '').substring(0, 8).toUpperCase(),
  questionnaireFillout: (questionnaireId: string): string =>
    `/q/${appPaths.questionnaireFilloutCode(questionnaireId)}`,
  projectAnalytics: (projectId: string): string =>
    `/projects/${encodeSegment(projectId)}/analytics`,
  projectMembers: (projectId: string): string =>
    `/projects/${encodeSegment(projectId)}/members`,
};
