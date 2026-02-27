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
  projectQuestionnaireRun: (projectId: string, questionnaireId: string): string =>
    `/projects/${encodeSegment(projectId)}/questionnaires/${encodeSegment(questionnaireId)}/run`,
};
