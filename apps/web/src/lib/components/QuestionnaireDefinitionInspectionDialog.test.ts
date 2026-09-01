import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

vi.mock('$lib/services/api', () => ({
  api: {
    questionnaires: {
      dryRunDefinition: vi.fn(),
    },
  },
}));

import { api } from '$lib/services/api';
import QuestionnaireDefinitionInspectionDialog from './QuestionnaireDefinitionInspectionDialog.svelte';

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom Web Animations polyfill
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({
      cancel() {},
      finish() {},
      onfinish: null,
      finished: Promise.resolve(),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionnaireDefinitionInspectionDialog', () => {
  it('uploads a QDef for dry-run inspection and reports metadata, digest, and diagnostics', async () => {
    (api.questionnaires.dryRunDefinition as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      committed: false,
      canonical: '{"format":"qdesigner.questionnaire"}\n',
      digest: 'sha256:abc123',
      metadata: {
        questionnaireName: 'Welcome study',
        questionnaireVersion: '1.2.3',
        formatVersion: '1.0.0',
        questionCount: 2,
        pageCount: 1,
      },
      diagnostics: [
        {
          code: 'QDEF_QUESTION_UNREFERENCED',
          severity: 'warning',
          path: '/questions/spare',
          message: "Question 'spare' is not referenced by any block.",
          hint: 'Add it to a block.',
          relatedPaths: [],
        },
      ],
    });

    render(QuestionnaireDefinitionInspectionDialog, {
      open: true,
      projectId: 'project-1',
    });

    const definition = JSON.stringify({
      format: 'qdesigner.questionnaire',
      formatVersion: '1.0.0',
    });
    const input = screen.getByTestId('qdef-file-input') as HTMLInputElement;
    const file = new File([definition], 'welcome.qdef.json', {
      type: 'application/json',
    });
    await userEvent.setup().upload(input, file);
    await waitFor(() => {
      expect(api.questionnaires.dryRunDefinition).toHaveBeenCalledWith('project-1', definition);
    });
    expect(screen.getByText('Welcome study')).toBeTruthy();
    expect(screen.getByText('sha256:abc123')).toBeTruthy();
    expect(screen.getByText('QDEF_QUESTION_UNREFERENCED')).toBeTruthy();
    expect(screen.getByText('No changes were made.')).toBeTruthy();
    expect(screen.queryByText('Import now')).toBeNull();
  });
});
