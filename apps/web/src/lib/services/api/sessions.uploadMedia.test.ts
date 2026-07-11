import { beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #48: FilloutUploadSync reconstructs binary answers as Blobs carrying the
// stored mimeType (OfflineBinaryPersistence.toBlob). The uploadMedia wrapper must
// propagate that type onto the File it builds, or the multipart part declares
// application/octet-stream and the server's text/csv carve-out can't recognize it.

vi.mock('$lib/api/generated/sdk.gen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/api/generated/sdk.gen')>();
  return { ...actual, uploadSessionMedia: vi.fn() };
});

const sdk = await import('$lib/api/generated/sdk.gen');
const { sessions } = await import('./sessions');

const uploadSessionMedia = sdk.uploadSessionMedia as unknown as ReturnType<typeof vi.fn>;

function uploadedFile(): File {
  const body = (uploadSessionMedia.mock.calls[0]![0] as { body: { file: File } }).body;
  return body.file;
}

beforeEach(() => {
  uploadSessionMedia.mockReset();
  uploadSessionMedia.mockResolvedValue({
    url: 'http://media/x',
    filename: 'answer.csv',
    size_bytes: 3,
    content_type: 'text/csv',
  });
});

describe('sessions.uploadMedia file type propagation (#48)', () => {
  it('carries the source blob mimeType onto the wrapped File', async () => {
    const blob = new Blob(['a,b'], { type: 'text/csv' });
    await sessions.uploadMedia('sess-1', blob, 'answer.csv');

    const file = uploadedFile();
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('answer.csv');
    expect(file.type).toBe('text/csv');
  });

  it('preserves an empty type when the blob has none', async () => {
    const blob = new Blob(['a,b']); // no type
    await sessions.uploadMedia('sess-1', blob, 'answer.bin');

    expect(uploadedFile().type).toBe('');
  });

  it('passes a File through unchanged (keeps its own type)', async () => {
    const original = new File(['x'], 'photo.png', { type: 'image/png' });
    await sessions.uploadMedia('sess-1', original, 'ignored.png');

    const file = uploadedFile();
    expect(file).toBe(original);
    expect(file.type).toBe('image/png');
  });
});
