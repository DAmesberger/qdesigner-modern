<script lang="ts">
  import type { ReactionStimulusConfig } from '$lib/runtime/reaction';
  import { createStimulusForKind } from '$lib/modules/questions/reaction-time/model/reaction-schema';

  type StimulusKind = ReactionStimulusConfig['kind'];

  interface Props {
    /** The currently selected stimulus kind. */
    kind: StimulusKind;
    /** Kinds offered in the picker; defaults to the common visual/media set. */
    kinds?: StimulusKind[];
    /**
     * Fired with a freshly-constructed stimulus of the picked kind. The parent
     * assigns this onto its trial (bind:-style or immutable-commit style). The
     * construction is centralised in `createStimulusForKind` so both reaction
     * stacks stay in sync.
     */
    onChange: (next: ReactionStimulusConfig) => void;
  }

  let {
    kind,
    kinds = ['text', 'shape', 'image', 'video', 'audio'],
    onChange,
  }: Props = $props();

  const labels: Record<StimulusKind, string> = {
    text: 'Text',
    shape: 'Shape',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    custom: 'Custom (shader)',
  };

  function select(next: StimulusKind) {
    onChange(createStimulusForKind(next));
  }
</script>

<div class="form-group">
  <span class="label-text">Kind</span>
  <select
    class="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-foreground bg-background shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
    value={kind}
    onchange={(e) => select((e.currentTarget as HTMLSelectElement).value as StimulusKind)}
  >
    {#each kinds as k}
      <option value={k}>{labels[k]}</option>
    {/each}
  </select>
</div>
