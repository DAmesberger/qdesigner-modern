<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    error?: boolean;
    rows?: number;
    id?: string;
    name?: string;
    oninput?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
    onchange?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
    onfocus?: (event: FocusEvent & { currentTarget: HTMLTextAreaElement }) => void;
    onblur?: (event: FocusEvent & { currentTarget: HTMLTextAreaElement }) => void;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    disabled = false,
    readonly = false,
    required = false,
    error = false,
    rows = 4,
    id = undefined,
    name = undefined,
    oninput,
    onchange,
    onfocus,
    onblur,
  }: Props = $props();

  let textareaClasses = $derived(`
    block w-full rounded-md border-0 py-1.5 text-foreground bg-background shadow-sm
    ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
    ${error
      ? 'ring-destructive placeholder:text-destructive focus:ring-destructive'
      : 'ring-border placeholder:text-muted-foreground focus:ring-primary'
    }
    ${disabled ? 'bg-muted text-muted-foreground opacity-50' : ''}
  `);
</script>

<textarea
  {id}
  {name}
  {rows}
  {placeholder}
  {disabled}
  {readonly}
  {required}
  bind:value
  class={textareaClasses}
  {oninput}
  {onchange}
  {onfocus}
  {onblur}
></textarea>
