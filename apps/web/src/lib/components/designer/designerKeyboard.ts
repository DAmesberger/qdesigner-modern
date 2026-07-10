/**
 * Designer keyboard guards (F-39).
 *
 * `isEditableTarget` is the single predicate that decides whether a global
 * designer shortcut (notably the destructive Delete/Backspace) must stand down
 * because focus is inside a text-editing surface — an `<input>`, `<textarea>`,
 * or a `contenteditable` region such as the canvas inline prompt editor. Without
 * this guard, pressing Delete while editing text would delete the whole
 * question (the "inline-editor focus-race"). Extracted as a pure function so the
 * guard is unit-testable independent of the component.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true
  );
}
