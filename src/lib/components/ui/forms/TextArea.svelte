<script lang="ts">
  export let value = '';
  export let placeholder = '';
  export let disabled = false;
  export let readonly = false;
  export let required = false;
  export let error = false;
  export let rows = 4;
  export let id: string | undefined = undefined;
  export let name: string | undefined = undefined;
  
  $: textareaClasses = `
    block w-full rounded-md border-0 py-1.5 text-foreground bg-background shadow-sm 
    ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
    ${error 
      ? 'ring-destructive placeholder:text-destructive focus:ring-destructive' 
      : 'ring-border placeholder:text-muted-foreground focus:ring-primary'
    }
    ${disabled ? 'bg-muted text-muted-foreground opacity-50' : ''}
  `;
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
  on:input
  on:change
  on:focus
  on:blur
></textarea>