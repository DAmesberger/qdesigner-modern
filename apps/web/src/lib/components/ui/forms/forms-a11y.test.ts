import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Input from './Input.svelte';
import Select from './Select.svelte';
import Checkbox from './Checkbox.svelte';
import FormGroup from './FormGroup.svelte';

/**
 * F099 — form-primitive ARIA wiring. Error signalling is no longer color-only:
 * the error prop now auto-derives aria-invalid, the describedby passthrough lets
 * call sites point an input at FormGroup's `{id}-error`/`{id}-hint` text, and
 * Checkbox associates its description paragraph. These tests lock that contract.
 */
describe('Input a11y', () => {
  afterEach(() => cleanup());

  it('sets aria-invalid="true" when error is set (auto-derived)', () => {
    render(Input, { props: { value: '', error: true } });
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('omits aria-invalid when there is no error', () => {
    render(Input, { props: { value: '', error: false } });
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('reflects the describedby prop onto aria-describedby', () => {
    render(Input, { props: { value: '', describedby: 'email-error' } });
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toBe('email-error');
  });
});

describe('Select a11y', () => {
  afterEach(() => cleanup());

  it('sets aria-invalid="true" when error is set', () => {
    render(Select, { props: { value: '', error: true } });
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-invalid')).toBe('true');
  });

  it('reflects the describedby prop onto aria-describedby', () => {
    render(Select, { props: { value: '', describedby: 'role-hint' } });
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-describedby')).toBe('role-hint');
  });
});

describe('Checkbox a11y', () => {
  afterEach(() => cleanup());

  it('associates the description paragraph with the input via aria-describedby', () => {
    render(Checkbox, {
      props: { checked: false, id: 'agree', description: 'You can opt out later' },
    });
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const describedby = box.getAttribute('aria-describedby');
    expect(describedby).toBe('agree-description');
    const descEl = document.getElementById('agree-description');
    expect(descEl?.textContent?.trim()).toBe('You can opt out later');
  });

  it('omits aria-describedby when there is no description', () => {
    render(Checkbox, { props: { checked: false, id: 'agree', label: 'I agree' } });
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.getAttribute('aria-describedby')).toBeNull();
  });
});

describe('FormGroup a11y', () => {
  afterEach(() => cleanup());

  it('marks the error text as role="alert" so it is announced', () => {
    render(FormGroup, { props: { id: 'email', error: 'Required' } });
    const errorEl = document.getElementById('email-error');
    expect(errorEl?.getAttribute('role')).toBe('alert');
  });
});

/**
 * Integration: a call site pointing an errored Input at FormGroup's `{id}-error`
 * text yields a resolvable aria-describedby target (the login/forgot/reset flows).
 */
describe('FormGroup + Input describedby integration', () => {
  afterEach(() => cleanup());

  it('an Input describedby the FormGroup error id resolves to the rendered text', () => {
    render(FormGroup, { props: { id: 'email', error: 'Invalid credentials' } });
    const errorEl = document.getElementById('email-error');
    expect(errorEl).toBeTruthy();
    // Input rendered separately with the matching describedby exposes the same id
    render(Input, { props: { value: '', error: true, describedby: 'email-error' } });
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toBe('email-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
