import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import Harness from './study-settings-harness.svelte';
import ConsentScreen from '$lib/fillout/components/ConsentScreen.svelte';
import { DesignerStore } from '$lib/stores/designer.svelte';
import type { ConsentContent } from '$lib/shared';

/**
 * F-44: the StudySettingsPanel is the designer surface that writes
 * `settings.showProgressBar`, `settings.requireConsent`, and the top-level
 * `consent` chrome block the fillout runtime reads. These tests assert (1) the
 * panel writes those fields through the normal DocumentStore update path,
 * (2) the checkbox add/remove list logic, and (3) that the authored `consent`
 * object is directly consumable by the real ConsentScreen (shape parity — no
 * parallel schema).
 */

// The decline path inside ConsentScreen is gated behind the shared confirm
// dialog whose host is only mounted in the app layout; stub it (unused here).
vi.mock('$lib/stores/confirm.svelte', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));

// jsdom lacks the Web Animations API used by the Dialog transition.
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

function seed(store: DesignerStore) {
  store.loadQuestionnaireFromDefinition({
    id: 'qn-consent',
    name: 'Consent Settings Test',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    questions: [],
    pages: [{ id: 'p1', name: 'Page 1', questions: [] }],
    flow: [],
    settings: { showProgressBar: true },
  });
}

const testId = (id: string) => `[data-testid="${id}"]`;

describe('StudySettingsPanel (F-44)', () => {
  afterEach(() => cleanup());

  it('writes showProgressBar, requireConsent, and the consent block through the store', async () => {
    const store = new DesignerStore();
    seed(store);

    render(Harness, { props: { store } });

    // Turn the progress indicator OFF (seeded true).
    const progress = document.querySelector(testId('settings-show-progress')) as HTMLInputElement;
    expect(progress.checked).toBe(true);
    await fireEvent.click(progress);

    // Enable consent → the editor appears.
    const requireConsent = document.querySelector(
      testId('settings-require-consent')
    ) as HTMLInputElement;
    await fireEvent.click(requireConsent);
    await waitFor(() => expect(document.querySelector(testId('consent-editor'))).toBeTruthy());

    // Author heading + body.
    const title = document.querySelector(testId('consent-title')) as HTMLInputElement;
    await fireEvent.input(title, { target: { value: 'Please read carefully' } });
    const content = document.querySelector(testId('consent-content')) as HTMLTextAreaElement;
    await fireEvent.input(content, { target: { value: 'This study takes 10 minutes.' } });

    // Add one acknowledgement checkbox and label it.
    await fireEvent.click(document.querySelector(testId('consent-add-checkbox')) as HTMLElement);
    const cbLabel = document.querySelector(testId('consent-checkbox-label-0')) as HTMLInputElement;
    await fireEvent.input(cbLabel, { target: { value: 'I agree to participate.' } });

    // Require an electronic signature.
    await fireEvent.click(document.querySelector(testId('consent-require-signature')) as HTMLElement);

    // Save.
    await fireEvent.click(document.querySelector(testId('study-settings-save')) as HTMLElement);

    await waitFor(() => {
      expect(store.questionnaire.settings.showProgressBar).toBe(false);
      expect(store.questionnaire.settings.requireConsent).toBe(true);
    });

    const consent = store.questionnaire.consent;
    expect(consent).toBeDefined();
    expect(consent?.title).toBe('Please read carefully');
    expect(consent?.content).toBe('This study takes 10 minutes.');
    expect(consent?.requireSignature).toBe(true);
    expect(consent?.checkboxes).toHaveLength(1);
    expect(consent?.checkboxes?.[0]).toMatchObject({
      label: 'I agree to participate.',
      required: true,
    });
    expect(typeof consent?.checkboxes?.[0]?.id).toBe('string');
    expect(consent?.checkboxes?.[0]?.id.length).toBeGreaterThan(0);
  });

  it('adds and removes acknowledgement checkboxes by row', async () => {
    const store = new DesignerStore();
    seed(store);

    render(Harness, { props: { store } });

    await fireEvent.click(
      document.querySelector(testId('settings-require-consent')) as HTMLInputElement
    );
    await waitFor(() => expect(document.querySelector(testId('consent-editor'))).toBeTruthy());

    const addBtn = document.querySelector(testId('consent-add-checkbox')) as HTMLElement;
    await fireEvent.click(addBtn);
    await fireEvent.click(addBtn);
    await waitFor(() =>
      expect(document.querySelectorAll(testId('consent-checkbox-row'))).toHaveLength(2)
    );

    // Label the two rows so we can prove the correct one is removed.
    const first = document.querySelector(testId('consent-checkbox-label-0')) as HTMLInputElement;
    const second = document.querySelector(testId('consent-checkbox-label-1')) as HTMLInputElement;
    await fireEvent.input(first, { target: { value: 'first' } });
    await fireEvent.input(second, { target: { value: 'second' } });

    // Remove the FIRST row.
    await fireEvent.click(
      document.querySelector(testId('consent-checkbox-remove-0')) as HTMLElement
    );

    await waitFor(() =>
      expect(document.querySelectorAll(testId('consent-checkbox-row'))).toHaveLength(1)
    );
    const remaining = document.querySelector(testId('consent-checkbox-label-0')) as HTMLInputElement;
    expect(remaining.value).toBe('second');
  });

  it('produces a consent object whose shape parity the fillout ConsentScreen accepts', () => {
    // The exact shape the panel writes (see save()). The `satisfies` assignments
    // are compile-time (checked by `pnpm check`) parity assertions: each authored
    // field must fit the corresponding ConsentScreen prop type — in particular the
    // checkbox array (questionnaire-core `ConsentCheckbox[]`) must be assignable to
    // ConsentScreen's fillout `ConsentCheckbox[]`, guaranteeing no parallel schema.
    type ConsentScreenProps = ComponentProps<typeof ConsentScreen>;
    const authored: ConsentContent = {
      title: 'Study Consent',
      content: '<p>Participation is voluntary.</p>',
      checkboxes: [
        { id: 'cb-1', label: 'I have read the information.', required: true },
        { id: 'cb-2', label: 'I consent to data processing.', required: false },
      ],
      requireSignature: true,
    };

    authored.title satisfies ConsentScreenProps['title'];
    (authored.content ?? '') satisfies ConsentScreenProps['content'];
    authored.checkboxes satisfies ConsentScreenProps['checkboxes'];
    authored.requireSignature satisfies ConsentScreenProps['requireSignature'];

    // Runtime proof for the non-checkbox fields (ConsentScreen seeds checkbox
    // state in an $effect, so a checkbox-bearing first render is skipped here —
    // the array-shape guarantee above is the compile-time contract).
    render(ConsentScreen, {
      props: {
        title: authored.title,
        content: authored.content ?? '',
        requireSignature: authored.requireSignature,
        onAccept: () => {},
        onDecline: () => {},
      },
    });

    // Authored heading wins over the default localized label...
    expect(document.querySelector(testId('fillout-consent-title'))?.textContent).toContain(
      'Study Consent'
    );
    // ...the body renders...
    expect(document.querySelector(testId('fillout-consent-screen'))?.textContent).toContain(
      'Participation is voluntary.'
    );
    // ...and the signature input is present because requireSignature is set.
    expect(document.querySelector(testId('fillout-consent-signature'))).toBeTruthy();
  });
});
