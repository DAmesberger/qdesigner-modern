<script lang="ts">
  interface Props {
    type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    error?: boolean;
    id?: string;
    name?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
    autocomplete?: HTMLInputElement['autocomplete'];
    class?: string;
    oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    onfocus?: (event: FocusEvent & { currentTarget: HTMLInputElement }) => void;
    onblur?: (event: FocusEvent & { currentTarget: HTMLInputElement }) => void;
    onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
    onkeyup?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
    onkeypress?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
  }

  let {
    type = 'text',
    value = $bindable(''),
    placeholder = '',
    disabled = false,
    readonly = false,
    required = false,
    error = false,
    id = undefined,
    name = undefined,
    pattern = undefined,
    minLength = undefined,
    maxLength = undefined,
    inputmode = undefined,
    autocomplete = 'off',
    class: className = '',
    oninput,
    onchange,
    onfocus,
    onblur,
    onkeydown,
    onkeyup,
    onkeypress,
  }: Props = $props();

  let inputClasses = $derived(`
    block w-full rounded-md border-0 py-1.5 text-foreground bg-background shadow-sm
    ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
    ${error
      ? 'ring-destructive placeholder:text-destructive focus:ring-destructive'
      : 'ring-border placeholder:text-muted-foreground focus:ring-primary'
    }
    ${disabled ? 'bg-muted text-muted-foreground opacity-50' : ''}
    ${className}
  `);
</script>

<input
  {type}
  {id}
  {name}
  {placeholder}
  {disabled}
  {readonly}
  {required}
  {pattern}
  minlength={minLength}
  maxlength={maxLength}
  inputmode={inputmode}
  {autocomplete}
  bind:value
  class={inputClasses}
  {oninput}
  {onchange}
  {onfocus}
  {onblur}
  {onkeydown}
  {onkeyup}
  {onkeypress}
/>
