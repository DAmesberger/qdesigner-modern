<script lang="ts">
  export let type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' = 'text';
  export let value = '';
  export let placeholder = '';
  export let disabled = false;
  export let readonly = false;
  export let required = false;
  export let error = false;
  export let id: string | undefined = undefined;
  export let name: string | undefined = undefined;
  export let pattern: string | undefined = undefined;
  export let minLength: number | undefined = undefined;
  export let maxLength: number | undefined = undefined;
  // Autocomplete disabled per business decision
  export let autocomplete: HTMLInputElement['autocomplete'] = "off";
  let className = '';
  export { className as class };
  
  $: inputClasses = `
    block w-full rounded-md border-0 py-1.5 text-foreground bg-background shadow-sm 
    ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
    ${error 
      ? 'ring-destructive placeholder:text-destructive focus:ring-destructive' 
      : 'ring-border placeholder:text-muted-foreground focus:ring-primary'
    }
    ${disabled ? 'bg-muted text-muted-foreground opacity-50' : ''}
    ${className}
  `;
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
  {autocomplete}
  bind:value
  class={inputClasses}
  on:input
  on:change
  on:focus
  on:blur
  on:keydown
  on:keyup
  on:keypress
/>