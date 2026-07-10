<script lang="ts">
  import { getDesignerContext } from '$lib/stores/designer-context';
  import { generateId } from '$lib/shared';
  import type { ConsentCheckbox, ConsentContent } from '$lib/shared';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import { Plus, Trash2 } from 'lucide-svelte';

  const designerStore = getDesignerContext();

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  // Local edit copies, committed on Save (mirrors DataQualityPanel / QuotaPanel) so
  // the panel never churns Yjs / undo history on every keystroke.
  let localShowProgressBar = $state(true);
  let localRequireConsent = $state(false);
  let localConsentTitle = $state('');
  let localConsentContent = $state('');
  let localCheckboxes = $state<ConsentCheckbox[]>([]);
  let localRequireSignature = $state(false);

  $effect(() => {
    if (open) {
      const settings = designerStore.questionnaire.settings;
      const consent = designerStore.questionnaire.consent;
      // showProgressBar defaults to true (matches DocumentStore.createEmptyQuestionnaire).
      localShowProgressBar = settings.showProgressBar ?? true;
      localRequireConsent = settings.requireConsent ?? false;
      localConsentTitle = consent?.title ?? '';
      localConsentContent = consent?.content ?? '';
      localCheckboxes = (consent?.checkboxes ?? []).map((cb) => ({ ...cb }));
      localRequireSignature = consent?.requireSignature ?? false;
    }
  });

  function addCheckbox() {
    localCheckboxes = [
      ...localCheckboxes,
      { id: generateId(), label: '', required: true },
    ];
  }

  function removeCheckbox(index: number) {
    localCheckboxes = localCheckboxes.filter((_, i) => i !== index);
  }

  function save() {
    // Persist authored consent content regardless of the enable toggle so flipping
    // "require consent" off then on does not discard the author's work. Only the
    // fields the runtime consumes are written (title / content / checkboxes /
    // signature), exactly matching the ConsentScreen prop shape.
    const hasConsentContent =
      localConsentTitle.trim().length > 0 ||
      localConsentContent.trim().length > 0 ||
      localCheckboxes.length > 0 ||
      localRequireSignature;

    const consent: ConsentContent | undefined = hasConsentContent
      ? {
          title: localConsentTitle.trim() || undefined,
          content: localConsentContent,
          checkboxes: localCheckboxes.map((cb) => ({
            id: cb.id,
            label: cb.label,
            required: cb.required,
          })),
          requireSignature: localRequireSignature,
        }
      : undefined;

    designerStore.updateQuestionnaire({
      settings: {
        ...designerStore.questionnaire.settings,
        showProgressBar: localShowProgressBar,
        requireConsent: localRequireConsent,
      },
      consent,
    });

    open = false;
  }

  function cancel() {
    open = false;
  }
</script>

<Dialog bind:open title="Study settings" size="md" onclose={cancel}>
  <div class="space-y-6" data-testid="study-settings-panel">
    <!-- Presentation -->
    <div>
      <h4 class="text-sm font-medium text-foreground mb-3">Presentation</h4>
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={localShowProgressBar}
          class="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
          data-testid="settings-show-progress"
        />
        <span>
          <span class="block text-sm text-foreground">Show progress indicator</span>
          <span class="block text-xs text-muted-foreground">
            Display a completion progress bar to participants while they fill out the study.
          </span>
        </span>
      </label>
    </div>

    <!-- Informed consent -->
    <div>
      <h4 class="text-sm font-medium text-foreground mb-3">Informed consent</h4>
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={localRequireConsent}
          class="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
          data-testid="settings-require-consent"
        />
        <span>
          <span class="block text-sm text-foreground">Require consent before starting</span>
          <span class="block text-xs text-muted-foreground">
            Show a consent screen participants must accept before the study begins.
          </span>
        </span>
      </label>

      {#if localRequireConsent}
        <div class="mt-4 space-y-4 border-l-2 border-border pl-4" data-testid="consent-editor">
          <div>
            <label for="consent-title" class="block text-sm text-foreground mb-1">
              Heading
            </label>
            <input
              id="consent-title"
              type="text"
              bind:value={localConsentTitle}
              placeholder="Informed Consent"
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
              data-testid="consent-title"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Optional. Blank uses the default localized “Informed Consent” heading.
              Base-language only (not yet translated per locale).
            </p>
          </div>

          <div>
            <label for="consent-content" class="block text-sm text-foreground mb-1">
              Consent text
            </label>
            <textarea
              id="consent-content"
              rows="8"
              bind:value={localConsentContent}
              placeholder={'Describe the study, its risks and benefits, data handling, and the participant’s rights.\n\nMarkdown is supported: **bold**, headings, and lists.'}
              class="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary font-mono"
              data-testid="consent-content"
            ></textarea>
            <p class="text-xs text-muted-foreground mt-1">
              Rendered as Markdown. Translate it per language in the Translations panel
              (Consent text slot).
            </p>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="block text-sm text-foreground">Acknowledgement checkboxes</span>
              <button
                type="button"
                onclick={addCheckbox}
                class="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-accent rounded-md transition-colors"
                data-testid="consent-add-checkbox"
              >
                <Plus class="h-3.5 w-3.5" /> Add checkbox
              </button>
            </div>

            {#if localCheckboxes.length === 0}
              <p class="text-xs text-muted-foreground">
                No checkboxes. Participants can accept with a single button.
              </p>
            {:else}
              <div class="space-y-2">
                {#each localCheckboxes as checkbox, i (checkbox.id)}
                  <div class="flex items-center gap-2" data-testid="consent-checkbox-row">
                    <input
                      type="text"
                      bind:value={checkbox.label}
                      placeholder="e.g. I have read and understood the information above."
                      class="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary"
                      data-testid={`consent-checkbox-label-${i}`}
                    />
                    <label
                      class="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                    >
                      <input
                        type="checkbox"
                        bind:checked={checkbox.required}
                        class="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                        data-testid={`consent-checkbox-required-${i}`}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onclick={() => removeCheckbox(i)}
                      aria-label="Remove checkbox"
                      class="p-1.5 text-muted-foreground hover:text-destructive rounded-md transition-colors"
                      data-testid={`consent-checkbox-remove-${i}`}
                    >
                      <Trash2 class="h-4 w-4" />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={localRequireSignature}
              class="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
              data-testid="consent-require-signature"
            />
            <span>
              <span class="block text-sm text-foreground">Require electronic signature</span>
              <span class="block text-xs text-muted-foreground">
                Participants must type their name to record consent.
              </span>
            </span>
          </label>
        </div>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <button
      onclick={cancel}
      class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Cancel
    </button>
    <button
      onclick={save}
      class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      data-testid="study-settings-save"
    >
      Save
    </button>
  {/snippet}
</Dialog>
