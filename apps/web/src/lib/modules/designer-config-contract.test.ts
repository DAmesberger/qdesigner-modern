import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import FileUploadDesigner from './questions/file-upload/FileUploadDesigner.svelte';
import MediaResponseDesigner from './questions/media-response/MediaResponseDesigner.svelte';
import DrawingDesigner from './questions/drawing/DrawingDesigner.svelte';
import TextDisplayDesigner from './display/text/TextDisplayDesigner.svelte';
import RankingDesigner from './questions/ranking/RankingDesigner.svelte';
import MatrixDesigner from './questions/matrix/MatrixDesigner.svelte';
import DateTimeDesigner from './questions/date-time/DateTimeDesigner.svelte';
import StatisticalFeedbackDesigner from './display/statistical-feedback/StatisticalFeedbackDesigner.svelte';
import TextInputDesigner from './questions/text-input/TextInputDesigner.svelte';
import NumberInputDesigner from './questions/number-input/NumberInputDesigner.svelte';
import RatingDesigner from './questions/rating/RatingDesigner.svelte';
import MultipleChoiceDesigner from './questions/multiple-choice/MultipleChoiceDesigner.svelte';
import { buildModuleRuntimeConfig } from '$lib/runtime/core/moduleConfigAdapter';
import type { Question } from '@qdesigner/questionnaire-core';

afterEach(cleanup);

describe('module editors preserve source configuration and emit user edits', () => {
  it('clears an inherited numeric bound permanently across serialization', async () => {
    const question = {
      id: 'number',
      type: 'number-input',
      display: { min: 2, max: 10 },
      responseType: { type: 'number', min: 1 },
    };
    const onUpdate = vi.fn();
    const screen = render(NumberInputDesigner, {
      question: question as unknown as ComponentProps<typeof NumberInputDesigner>['question'],
      onUpdate,
    });
    await fireEvent.input(screen.getByLabelText('Minimum'), { target: { value: '' } });
    const edited = JSON.parse(
      JSON.stringify({ ...question, ...onUpdate.mock.calls.at(-1)?.[0] })
    ) as Question;
    expect(buildModuleRuntimeConfig(edited).min).toBeUndefined();
    expect(buildModuleRuntimeConfig(edited).max).toBe(10);
  });

  it('shows response-based choice options and preserves them on edit', async () => {
    const question = {
      id: 'choice',
      type: 'single-choice',
      response: {
        type: 'single',
        options: [
          { id: 'a', label: 'A', value: 1, hotkey: 'a' },
          { id: 'b', label: 'B', value: 2 },
        ],
      },
    };
    const onUpdate = vi.fn();
    const screen = render(MultipleChoiceDesigner, {
      question: question as unknown as ComponentProps<typeof MultipleChoiceDesigner>['question'],
      mode: 'edit',
      onUpdate,
    });
    await fireEvent.input(screen.getByLabelText('Label', { selector: '#label-0' }), {
      target: { value: 'Edited' },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: {
        options: [
          { ...question.response.options[0], label: 'Edited' },
          question.response.options[1],
        ],
      },
    });
  });
  it('edits display-based text input without inventing a pattern on mount', async () => {
    const question = {
      id: 'text',
      type: 'text-input',
      display: { inputType: 'email', placeholder: 'Original' },
    };
    const onUpdate = vi.fn();
    const screen = render(TextInputDesigner, {
      question: question as unknown as ComponentProps<typeof TextInputDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText('Placeholder Text'), {
      target: { value: 'Email address' },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { placeholder: 'Email address' } });
    expect(question.display.placeholder).toBe('Original');
  });

  it('edits display-based numeric bounds through the update callback', async () => {
    const question = { id: 'number', type: 'number-input', display: { min: 1, max: 10 } };
    const onUpdate = vi.fn();
    const screen = render(NumberInputDesigner, {
      question: question as unknown as ComponentProps<typeof NumberInputDesigner>['question'],
      onUpdate,
    });
    await fireEvent.input(screen.getByLabelText('Maximum'), { target: { value: '20' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { max: 20 } });
    expect(question.display.max).toBe(10);
  });

  it('preserves rating labels when mounting and editing display-based configuration', async () => {
    const question = {
      id: 'rating',
      type: 'rating',
      display: { levels: 3, style: 'hearts', labels: ['One', 'Two', 'Three', 'Reserved'] },
    };
    const onUpdate = vi.fn();
    const screen = render(RatingDesigner, {
      question: question as unknown as ComponentProps<typeof RatingDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText('Number of Levels'), { target: { value: '4' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { levels: 4 } });
    expect(question.display.labels).toHaveLength(4);
  });

  it('edits display-based choices while preserving option metadata', async () => {
    const question = {
      id: 'choice',
      type: 'single-choice',
      display: {
        options: [
          { id: 'a', label: 'A', value: 1, hotkey: 'a', exclusive: true },
          { id: 'b', label: 'B', value: 2 },
        ],
      },
    };
    const onUpdate = vi.fn();
    const screen = render(MultipleChoiceDesigner, {
      question: question as unknown as ComponentProps<typeof MultipleChoiceDesigner>['question'],
      mode: 'edit',
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText('Label', { selector: '#label-0' }), {
      target: { value: 'Revised A' },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: {
        options: [
          { ...question.display.options[0], label: 'Revised A' },
          question.display.options[1],
        ],
      },
    });
    expect(question.display.options[0]?.label).toBe('A');
  });
  it('keeps the analytics data source when editing the feedback title', async () => {
    const analytics = {
      id: 'feedback',
      type: 'statistical-feedback',
      dataSource: { variables: ['score'], aggregation: 'none' },
      config: { title: 'Original' },
    };
    const onUpdate = vi.fn();
    const screen = render(StatisticalFeedbackDesigner, { analytics, onUpdate });
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Edited' } });
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dataSource: analytics.dataSource,
        config: expect.objectContaining({ title: 'Edited' }),
      })
    );
  });
  it('reorders ranking items by stable identity through the designer callback', async () => {
    const question = {
      id: 'rank',
      type: 'ranking',
      config: {
        items: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(RankingDesigner, {
      question: question as unknown as ComponentProps<typeof RankingDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { items: [before.config.items[1], before.config.items[0]] },
    });
    expect(question).toEqual(before);
  });

  it('edits matrix presentation without losing its rows and columns', async () => {
    const question = {
      id: 'matrix',
      type: 'matrix',
      config: {
        rows: [{ id: 'r', label: 'Row' }],
        columns: [{ id: 'c', label: 'Column', value: 1 }],
        responseType: 'radio',
        stickyHeaders: false,
      },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(MatrixDesigner, {
      question: question as unknown as ComponentProps<typeof MatrixDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByLabelText('Sticky column headers'));
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { ...before.config, stickyHeaders: true },
    });
    expect(question).toEqual(before);
  });

  it('adds a numeric column to a matrix scale', async () => {
    const question = {
      id: 'matrix',
      type: 'matrix',
      config: {
        rows: [{ id: 'r', label: 'Row' }],
        columns: [{ id: 'c', label: 'Low', value: 1 }],
        responseType: 'scale',
      },
    };
    const onUpdate = vi.fn();
    const screen = render(MatrixDesigner, {
      question: question as unknown as ComponentProps<typeof MatrixDesigner>['question'],
      onUpdate,
    });
    await fireEvent.input(screen.getByPlaceholderText('Column label...'), {
      target: { value: 'High' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Add Column' }));
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: {
        ...question.config,
        columns: [question.config.columns[0], { id: expect.any(String), label: 'High', value: 2 }],
      },
    });
  });

  it('preserves a custom date format on mount and saves an explicit format edit', async () => {
    const question = {
      id: 'date',
      type: 'date-time',
      config: {
        mode: 'date',
        format: 'DD/MM/YYYY',
        showCalendar: true,
        minDate: null,
        maxDate: null,
      },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(DateTimeDesigner, {
      question: question as unknown as ComponentProps<typeof DateTimeDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Display Format')).toHaveValue('DD/MM/YYYY');
    await fireEvent.input(screen.getByLabelText('Display Format'), {
      target: { value: 'DD.MM.YYYY' },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { ...before.config, format: 'DD.MM.YYYY' },
    });
    expect(question).toEqual(before);
  });

  it('edits upload limits without normalizing the saved display on mount', async () => {
    const question = {
      id: 'upload',
      type: 'file-upload',
      display: { accept: ['image/png'], maxSize: 1048576, maxFiles: 2, dragDrop: false },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(FileUploadDesigner, {
      question: question as unknown as ComponentProps<typeof FileUploadDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(question).toEqual(before);
    await fireEvent.change(screen.getByLabelText('Maximum File Size'), {
      target: { value: '5242880' },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { maxSize: 5242880 } });
    expect(question).toEqual(before);
  });

  it('edits recording configuration through the designer callback', async () => {
    const question = {
      id: 'record',
      type: 'media-response',
      display: { recordingMode: 'audio', countdown: 0, maxDuration: 30 },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(MediaResponseDesigner, {
      question: question as unknown as ComponentProps<typeof MediaResponseDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.change(screen.getByLabelText('Maximum Duration'), { target: { value: '60' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ config: { maxDuration: 60 } });
    expect(question).toEqual(before);
  });

  it('edits drawing dimensions without replacing the other canvas settings', async () => {
    const question = {
      id: 'draw',
      type: 'drawing',
      config: { canvas: { width: 320, height: 240, background: '#fff' } },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(DrawingDesigner, {
      question: question as unknown as ComponentProps<typeof DrawingDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText('Width (px)'), { target: { value: '480' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { canvas: { width: 480, height: 240, background: '#fff' } },
    });
    expect(question).toEqual(before);
  });

  it('shows authored text and changes its original display field', async () => {
    const question = {
      id: 'intro',
      type: 'text-display',
      display: { content: 'Original instructions', format: 'markdown', enableMarkdown: true },
    };
    const before = structuredClone(question);
    const onUpdate = vi.fn();
    const screen = render(TextDisplayDesigner, {
      question: question as unknown as ComponentProps<typeof TextDisplayDesigner>['question'],
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    const content = screen.getByLabelText('Content');
    expect(content).toHaveValue('Original instructions');
    await fireEvent.input(content, { target: { value: 'Revised instructions' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      display: { ...question.display, content: 'Revised instructions' },
    });
    expect(question).toEqual(before);
  });
});
