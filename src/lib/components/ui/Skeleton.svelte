<script lang="ts">
  interface Props {
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
    className?: string;
  }

  let {
    variant = 'text',
    width = '100%',
    height = 'auto',
    animation = 'pulse',
    className = '',
  }: Props = $props();

  // Convert number values to pixels
  let widthValue = $derived(typeof width === 'number' ? `${width}px` : width);
  let heightValue = $derived(typeof height === 'number' ? `${height}px` : height);

  // Default heights for text variant
  let computedHeight = $derived(variant === 'text' && height === 'auto' ? '1em' : heightValue);

  // Base classes
  let baseClasses = $derived(
    [
      'skeleton',
      `skeleton--${variant}`,
      animation !== 'none' && `skeleton--${animation}`,
      className,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<div
  class={baseClasses}
  style="width: {widthValue}; height: {computedHeight};"
  aria-hidden="true"
></div>

<style>
  .skeleton {
    display: inline-block;
    background-color: var(--skeleton-bg, #e5e7eb);
    position: relative;
    overflow: hidden;
  }

  /* Dark mode support */
  :global(.dark) .skeleton {
    background-color: var(--skeleton-bg-dark, #374151);
  }

  /* Variants */
  .skeleton--text {
    border-radius: 0.25rem;
    margin: 0.125rem 0;
  }

  .skeleton--circular {
    border-radius: 50%;
  }

  .skeleton--rectangular {
    border-radius: 0;
  }

  .skeleton--rounded {
    border-radius: 0.5rem;
  }

  /* Pulse animation */
  .skeleton--pulse {
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
    100% {
      opacity: 1;
    }
  }

  /* Wave animation */
  .skeleton--wave::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    animation: skeleton-wave 1.5s linear infinite;
  }

  :global(.dark) .skeleton--wave::after {
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  }

  @keyframes skeleton-wave {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
</style>
