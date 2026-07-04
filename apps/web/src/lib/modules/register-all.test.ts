import { describe, it, expect } from 'vitest';
import { registerAllModules } from './register-all';
import { moduleRegistry } from './registry';

/**
 * MOD-05: the three enum types that previously had no registered module (and were
 * silently dropped at runtime) must now resolve to a real module/handler.
 */
describe('MOD-05 enum reconciliation', () => {
  it('registers single-choice, instruction, and media-display aliases', async () => {
    await registerAllModules();

    const single = moduleRegistry.get('single-choice');
    expect(single).toBeDefined();
    expect(single?.category).toBe('question');
    expect(single?.components.runtime).toBeTypeOf('function');

    const instruction = moduleRegistry.get('instruction');
    expect(instruction).toBeDefined();
    expect(instruction?.category).toBe('instruction');

    const mediaDisplay = moduleRegistry.get('media-display');
    expect(mediaDisplay).toBeDefined();
    expect(mediaDisplay?.category).toBe('instruction');
  });
});
