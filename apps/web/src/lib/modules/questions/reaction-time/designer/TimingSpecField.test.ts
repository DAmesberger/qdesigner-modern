import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import TimingSpecField from './TimingSpecField.svelte';

/**
 * RT-2a: the one authoring control for a phase duration (ADR 0025). Off = a
 * single fixed-ms input; the "Jitter" toggle swaps it for a min/max pair and
 * turns the bound value into a `{ dist:'uniform', min, max }` object.
 */
describe('TimingSpecField', () => {
  afterEach(() => cleanup());

  it('renders a single number input for a fixed value', () => {
    render(TimingSpecField, { props: { value: 500, label: 'Fixation', id: 'fix' } });
    const inputs = document.querySelectorAll('input[type="number"]');
    expect(inputs).toHaveLength(1);
    expect((inputs[0] as HTMLInputElement).value).toBe('500');
    // Jitter toggle is present and off.
    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('renders a prefilled min/max pair for a uniform value', () => {
    render(TimingSpecField, {
      props: { value: { dist: 'uniform', min: 2000, max: 10000 }, label: 'ISI', id: 'isi' },
    });
    const numbers = Array.from(
      document.querySelectorAll('input[type="number"]')
    ) as HTMLInputElement[];
    expect(numbers).toHaveLength(2);
    expect(numbers[0]!.value).toBe('2000');
    expect(numbers[1]!.value).toBe('10000');
    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('reveals the min/max pair when jitter is toggled on', async () => {
    render(TimingSpecField, {
      props: { value: 400, label: 'Fixation', id: 'fix', fixedDefault: 400 },
    });
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(1);

    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await fireEvent.click(toggle);

    // The single fixed input is replaced by a min/max pair seeded from the value.
    const numbers = Array.from(
      document.querySelectorAll('input[type="number"]')
    ) as HTMLInputElement[];
    expect(numbers).toHaveLength(2);
    expect(numbers[0]!.value).toBe('400');
    expect(numbers[1]!.value).toBe('400');
  });

  it('collapses back to a single input when jitter is toggled off', async () => {
    render(TimingSpecField, {
      props: { value: { dist: 'uniform', min: 300, max: 700 }, label: 'ISI', id: 'isi' },
    });
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(2);

    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await fireEvent.click(toggle);

    const numbers = document.querySelectorAll('input[type="number"]');
    expect(numbers).toHaveLength(1);
    // Collapses to the range minimum.
    expect((numbers[0] as HTMLInputElement).value).toBe('300');
  });

  it('marks inputs invalid when the invalid flag is set', () => {
    render(TimingSpecField, {
      props: {
        value: { dist: 'uniform', min: 800, max: 200 },
        label: 'ISI',
        id: 'isi',
        invalid: true,
      },
    });
    const numbers = document.querySelectorAll('input[type="number"].invalid');
    expect(numbers).toHaveLength(2);
  });
});
