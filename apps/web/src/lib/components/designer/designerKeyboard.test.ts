import { describe, it, expect } from 'vitest';
import { isEditableTarget } from './designerKeyboard';

/**
 * F-39: the designer's global Delete/Backspace shortcut deletes the selected
 * question only when focus is NOT inside a text-editing surface. `isEditableTarget`
 * is that guard — it must return true whenever a keystroke would otherwise be
 * swallowed to mutate text (the canvas inline prompt editor is a
 * `contenteditable`, so the "inline-editor focus-race" is covered here).
 */
describe('isEditableTarget (keyboard-delete guard)', () => {
  it('blocks delete when focus is in an <input>', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
  });

  it('blocks delete when focus is in a <textarea>', () => {
    const textarea = document.createElement('textarea');
    expect(isEditableTarget(textarea)).toBe(true);
  });

  it('blocks delete when focus is in a contenteditable region (inline prompt editor)', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    // jsdom does not derive isContentEditable from the attribute, so pin it.
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
    expect(isEditableTarget(div)).toBe(true);
  });

  it('allows delete when focus is on a non-editable question card (a div)', () => {
    const card = document.createElement('div');
    expect(isEditableTarget(card)).toBe(false);
  });

  it('allows delete when focus is on a plain button', () => {
    const button = document.createElement('button');
    expect(isEditableTarget(button)).toBe(false);
  });

  it('is false for a null target', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
