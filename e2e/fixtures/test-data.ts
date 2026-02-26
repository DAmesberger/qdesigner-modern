export function questionnaireName(prefix = 'E2E Questionnaire'): string {
  return `${prefix} ${Date.now()}`;
}
