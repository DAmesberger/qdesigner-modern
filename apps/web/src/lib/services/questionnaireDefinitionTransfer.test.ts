import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/api', () => ({
  api: {
    questionnaires: {
      exportDefinition: vi.fn(),
    },
  },
}));

import { api } from '$lib/services/api';
import { downloadQuestionnaireDefinition } from './questionnaireDefinitionTransfer';

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadQuestionnaireDefinition', () => {
  it('downloads the exact canonical bytes with a definition-specific filename', async () => {
    const canonical = '{"format":"qdesigner.questionnaire"}\n';
    (api.questionnaires.exportDefinition as ReturnType<typeof vi.fn>).mockResolvedValue({
      canonical,
      digest: 'sha256:abc123',
      revision: 4,
      metadata: {
        questionnaireName: 'Welcome / study',
        questionnaireVersion: '1.0.0',
        formatVersion: '1.0.0',
        questionCount: 1,
        pageCount: 1,
      },
      diagnostics: [],
    });

    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:qdef';
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureDownload(this: HTMLAnchorElement) {
        expect(this.download).toBe('welcome-study.qdef.json');
      });

    const result = await downloadQuestionnaireDefinition('project-1', 'questionnaire-1');

    expect(api.questionnaires.exportDefinition).toHaveBeenCalledWith(
      'project-1',
      'questionnaire-1'
    );
    expect(click).toHaveBeenCalledOnce();
    expect(blobs).toHaveLength(1);
    expect(await readBlob(blobs[0]!)).toBe(canonical);
    expect(result.digest).toBe('sha256:abc123');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qdef');
  });
});
