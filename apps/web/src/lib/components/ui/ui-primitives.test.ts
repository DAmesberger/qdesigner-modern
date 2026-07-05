import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Button from './Button.svelte';
import Input from './forms/Input.svelte';
import Select from './forms/Select.svelte';
import Checkbox from './forms/Checkbox.svelte';
import FormGroup from './forms/FormGroup.svelte';
import Dialog from './overlays/Dialog.svelte';

// jsdom lacks the Web Animations API some Svelte transitions/animations reach for.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
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

/**
 * Guardrail tests for the shared UI primitives (F076). These assert CURRENT
 * behavior — prop binding, event dispatch, and the error/hint id contract — so
 * that the P1/P2/P4 refactors (context seam, runes migrations) get a fast
 * failing test if they regress these building blocks.
 */
describe('Button', () => {
  afterEach(() => cleanup());

  it('fires onclick when enabled', async () => {
    const onclick = vi.fn();
    render(Button, { props: { onclick } });
    const button = document.querySelector('button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    await fireEvent.click(button);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('applies the disabling (pointer-events-none) treatment when loading', () => {
    render(Button, { props: { loading: true } });
    const button = document.querySelector('button') as HTMLButtonElement;
    expect(button.className).toContain('pointer-events-none');
    expect(button.className).toContain('cursor-not-allowed');
  });

  it('does not apply the disabling treatment when idle and enabled', () => {
    render(Button, { props: {} });
    const button = document.querySelector('button') as HTMLButtonElement;
    expect(button.className).not.toContain('pointer-events-none');
  });

  it('reflects the disabled prop on the button element', () => {
    render(Button, { props: { disabled: true } });
    const button = document.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe('Input', () => {
  afterEach(() => cleanup());

  it('reflects the value prop', () => {
    render(Input, { props: { value: 'hello' } });
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('associates via the id prop (label-for target)', () => {
    render(Input, { props: { id: 'field-1', value: '' } });
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('field-1');
  });

  it('emits oninput with the current value', async () => {
    const oninput = vi.fn();
    render(Input, { props: { value: '', oninput } });
    const input = document.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'typed' } });
    expect(oninput).toHaveBeenCalled();
    expect(input.value).toBe('typed');
  });

  it('toggles the error-ring class on the error prop', () => {
    const { unmount } = render(Input, { props: { value: '', error: true } });
    let input = document.querySelector('input') as HTMLInputElement;
    expect(input.className).toContain('ring-destructive');
    unmount();

    render(Input, { props: { value: '', error: false } });
    input = document.querySelector('input') as HTMLInputElement;
    expect(input.className).toContain('ring-border');
    expect(input.className).not.toContain('ring-destructive');
  });
});

describe('Select', () => {
  afterEach(() => cleanup());

  it('renders the provided options', () => {
    render(Select, {
      props: {
        value: '',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
      },
    });
    const labels = Array.from(document.querySelectorAll('option')).map((o) => o.textContent?.trim());
    expect(labels).toContain('Apple');
    expect(labels).toContain('Banana');
  });

  it('emits onchange with the selected value', async () => {
    const onchange = vi.fn();
    render(Select, {
      props: {
        value: 'a',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
        onchange,
      },
    });
    const select = document.querySelector('select') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'b' } });
    expect(onchange).toHaveBeenCalled();
    expect(select.value).toBe('b');
  });
});

describe('Checkbox', () => {
  afterEach(() => cleanup());

  it('reflects the checked prop', () => {
    render(Checkbox, { props: { checked: true } });
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it('emits onchange when toggled', async () => {
    const onchange = vi.fn();
    render(Checkbox, { props: { checked: false, onchange } });
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await fireEvent.click(box);
    expect(onchange).toHaveBeenCalled();
    expect(box.checked).toBe(true);
  });

  it('associates the label with the checkbox via id', () => {
    render(Checkbox, { props: { checked: false, id: 'agree', label: 'I agree' } });
    const label = document.querySelector('label[for="agree"]') as HTMLLabelElement;
    expect(label).toBeTruthy();
    expect(label.textContent?.trim()).toBe('I agree');
  });
});

describe('FormGroup', () => {
  afterEach(() => cleanup());

  it('renders the `{id}-error` element id when error is set (F099 aria-describedby contract)', () => {
    render(FormGroup, { props: { id: 'email', error: 'Required' } });
    const errorEl = document.getElementById('email-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl?.textContent?.trim()).toBe('Required');
  });

  it('renders the `{id}-hint` element id when a hint (and no error) is set', () => {
    render(FormGroup, { props: { id: 'email', hint: 'Use your work email' } });
    const hintEl = document.getElementById('email-hint');
    expect(hintEl).toBeTruthy();
    expect(hintEl?.textContent?.trim()).toBe('Use your work email');
    // error takes precedence over hint, so with no error the error node is absent
    expect(document.getElementById('email-error')).toBeNull();
  });
});

describe('Dialog', () => {
  afterEach(() => cleanup());

  it('mounts its content only when open', () => {
    const { unmount } = render(Dialog, { props: { open: false, title: 'Settings' } });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    unmount();

    render(Dialog, { props: { open: true, title: 'Settings' } });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(document.getElementById('dialog-title')?.textContent?.trim()).toBe('Settings');
  });

  it('invokes onclose when the backdrop is clicked', async () => {
    const onclose = vi.fn();
    render(Dialog, { props: { open: true, title: 'Settings', onclose } });
    const backdrop = document.querySelector('.backdrop-blur-sm') as HTMLElement;
    expect(backdrop).toBeTruthy();
    await fireEvent.click(backdrop);
    expect(onclose).toHaveBeenCalled();
  });

  it('invokes onclose via the header close button', async () => {
    const onclose = vi.fn();
    render(Dialog, { props: { open: true, title: 'Settings', closable: true, onclose } });
    const closeButton = document.querySelector('button[aria-label="Close dialog"]') as HTMLButtonElement;
    expect(closeButton).toBeTruthy();
    await fireEvent.click(closeButton);
    expect(onclose).toHaveBeenCalled();
  });
});
