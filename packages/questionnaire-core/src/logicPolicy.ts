/** Legacy executable fields are rejected, never interpreted as Safe Logic (ADR 0039). */
export interface LogicPolicyDiagnostic {
  code: 'UNSAFE_JAVASCRIPT';
  path: string;
  message: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function findJavaScriptHooks(definition: unknown): LogicPolicyDiagnostic[] {
  const diagnostics: LogicPolicyDiagnostic[] = [];
  const visited = new WeakSet<object>();

  function inspect(value: unknown, path: string): void {
    const node = record(value);
    if (!node || visited.has(node)) return;
    visited.add(node);

    for (const key of ['script', 'scripts', 'hooks', 'customFunctions', 'globalScripts', 'global_scripts']) {
      if (hasContent(node[key])) {
        const fieldPath = `${path}.${key}`;
        diagnostics.push({
          code: 'UNSAFE_JAVASCRIPT',
          path: fieldPath,
          message: `JavaScript hooks are no longer supported (${fieldPath}). Remove this field and author the behavior in Safe Logic. Safe Logic hook execution is not yet available.`,
        });
      }
    }

    for (const key of ['settings', 'content', 'definition']) inspect(node[key], `${path}.${key}`);
    for (const key of ['pages', 'blocks', 'questions']) {
      const children = node[key];
      if (Array.isArray(children)) {
        children.forEach((child, index) => inspect(child, `${path}.${key}[${index}]`));
      } else {
        for (const [id, child] of Object.entries(record(children) ?? {})) {
          inspect(child, `${path}.${key}[${JSON.stringify(id)}]`);
        }
      }
    }
  }

  inspect(definition, 'questionnaire');
  return diagnostics;
}

export function assertNoJavaScriptHooks(definition: unknown): void {
  const diagnostics = findJavaScriptHooks(definition);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(({ code, message }) => `${code}: ${message}`).join('\n'));
  }
}
