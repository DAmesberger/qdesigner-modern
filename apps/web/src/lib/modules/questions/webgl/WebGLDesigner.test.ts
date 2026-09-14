import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import WebGLDesigner from './WebGLDesigner.svelte';
import { createDefaultWebGLConfig } from './model/webgl-config';
import type { Question } from '@qdesigner/questionnaire-core';

afterEach(cleanup);

it('reconciles a collaborator change before emitting an edit to another field', async () => {
  const question = {
    id: 'shared-webgl',
    type: 'webgl',
    config: createDefaultWebGLConfig(),
  } as Question & { config: ReturnType<typeof createDefaultWebGLConfig> };
  const onUpdate = vi.fn();
  const screen = render(WebGLDesigner, { question, onUpdate });
  const remote = structuredClone(question);
  remote.config.timing.preDelay = 321;
  await screen.rerender({ question: remote, onUpdate });
  await expect(screen.getByLabelText('Pre-stimulus Delay (ms)')).toHaveValue(321);
  expect(onUpdate).not.toHaveBeenCalled();
  await fireEvent.input(screen.getByLabelText('Response Timeout (ms)'), {
    target: { value: '3400' },
  });
  await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  expect(onUpdate.mock.calls.at(-1)?.[0].config.timing).toMatchObject({
    preDelay: 321,
    responseDuration: 3400,
  });
});

it('owns its draft and emits explicit edits without rewriting the source on mount', async () => {
  const question = {
    id: 'webgl',
    type: 'webgl',
    config: createDefaultWebGLConfig(),
  } as Question & { config: ReturnType<typeof createDefaultWebGLConfig> };
  const before = structuredClone(question);
  const onUpdate = vi.fn();
  const screen = render(WebGLDesigner, { question, onUpdate });
  await tick();
  await tick();
  expect(question).toEqual(before);
  expect(onUpdate).not.toHaveBeenCalled();
  await fireEvent.input(screen.getByLabelText('Response Timeout (ms)'), {
    target: { value: '3400' },
  });
  await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  expect(onUpdate.mock.calls.at(-1)?.[0].config).toEqual({
    ...before.config,
    timing: { ...before.config.timing, responseDuration: 3400 },
  });
  expect(question).toEqual(before);
});
