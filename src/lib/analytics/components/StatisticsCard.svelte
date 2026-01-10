<script lang="ts">
  // Props
  interface Props {
    title: string;
    value: string | number;
    subtitle?: string;
    trend?: {
      value: number;
      direction: 'up' | 'down' | 'neutral';
      period?: string;
    } | null;
    icon?: string;
    color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'gray';
    loading?: boolean;
    onClick?: () => void;
  }

  let {
    title,
    value,
    subtitle,
    trend = null,
    icon = 'chart-bar',
    color = 'blue',
    loading = false,
    onClick,
  }: Props = $props();

  // Icon mapping
  function getIconSVG(iconName: string): string {
    const icons: Record<string, string> = {
      'chart-bar': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />`,
      users: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a4 4 0 11-8 0 4 4 0 018 0z" />`,
      'check-circle': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />`,
      clock: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />`,
      'chat-bubble-left': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />`,
      eye: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`,
      'trending-up': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />`,
      'trending-down': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />`,
      minus: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />`,
      'currency-dollar': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />`,
      'lightning-bolt': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />`,
      heart: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />`,
      star: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />`,
    };

    return icons[iconName] ?? icons['chart-bar'] ?? '';
  }

  // Color theme mapping
  function getColorClasses(colorName: string) {
    const colorMap: Record<string, { bg: string; text: string; icon: string; trend: string }> = {
      blue: {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        text: 'text-blue-600 dark:text-blue-400',
        icon: 'text-blue-500 dark:text-blue-400',
        trend: 'text-blue-600 dark:text-blue-400',
      },
      green: {
        bg: 'bg-green-50 dark:bg-green-900/20',
        text: 'text-green-600 dark:text-green-400',
        icon: 'text-green-500 dark:text-green-400',
        trend: 'text-green-600 dark:text-green-400',
      },
      yellow: {
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        text: 'text-yellow-600 dark:text-yellow-400',
        icon: 'text-yellow-500 dark:text-yellow-400',
        trend: 'text-yellow-600 dark:text-yellow-400',
      },
      red: {
        bg: 'bg-red-50 dark:bg-red-900/20',
        text: 'text-red-600 dark:text-red-400',
        icon: 'text-red-500 dark:text-red-400',
        trend: 'text-red-600 dark:text-red-400',
      },
      purple: {
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        text: 'text-purple-600 dark:text-purple-400',
        icon: 'text-purple-500 dark:text-purple-400',
        trend: 'text-purple-600 dark:text-purple-400',
      },
      indigo: {
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        text: 'text-indigo-600 dark:text-indigo-400',
        icon: 'text-indigo-500 dark:text-indigo-400',
        trend: 'text-indigo-600 dark:text-indigo-400',
      },
      gray: {
        bg: 'bg-gray-50 dark:bg-gray-900/20',
        text: 'text-gray-600 dark:text-gray-400',
        icon: 'text-gray-500 dark:text-gray-400',
        trend: 'text-gray-600 dark:text-gray-400',
      },
    };

    return colorMap[colorName] || colorMap.blue!;
  }

  function getTrendIcon(direction: 'up' | 'down' | 'neutral'): string {
    switch (direction) {
      case 'up':
        return getIconSVG('trending-up');
      case 'down':
        return getIconSVG('trending-down');
      case 'neutral':
        return getIconSVG('minus');
      default:
        return getIconSVG('minus');
    }
  }

  function getTrendColor(direction: 'up' | 'down' | 'neutral'): string {
    switch (direction) {
      case 'up':
        return 'text-green-600 dark:text-green-400';
      case 'down':
        return 'text-red-600 dark:text-red-400';
      case 'neutral':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  function formatValue(val: string | number): string {
    if (typeof val === 'number') {
      // Format large numbers with appropriate suffixes
      if (val >= 1000000) {
        return (val / 1000000).toFixed(1) + 'M';
      } else if (val >= 1000) {
        return (val / 1000).toFixed(1) + 'K';
      } else if (val % 1 !== 0) {
        return val.toFixed(2);
      }
      return val.toString();
    }
    return val;
  }

  const colors = getColorClasses(color);
</script>

<div
  class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700 transition-all duration-200 {onClick
    ? 'cursor-pointer hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600'
    : ''}"
  onclick={onClick}
  role={onClick ? 'button' : undefined}
  tabindex={onClick ? 0 : null}
  onkeydown={(e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  }}
>
  <div class="p-5">
    <div class="flex items-center">
      <div class="flex-shrink-0">
        <div class="w-8 h-8 {colors.bg} rounded-md flex items-center justify-center">
          {#if loading}
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 {colors.text}"></div>
          {:else}
            <svg
              class="w-5 h-5 {colors.icon}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {@html getIconSVG(icon)}
            </svg>
          {/if}
        </div>
      </div>

      <div class="ml-5 w-0 flex-1">
        <dl>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
            {title}
          </dt>
          <dd class="flex items-baseline">
            <div class="text-2xl font-semibold text-gray-900 dark:text-white">
              {loading ? '...' : formatValue(value)}
            </div>

            {#if trend && !loading}
              <div
                class="ml-2 flex items-baseline text-sm font-semibold {getTrendColor(
                  trend.direction
                )}"
              >
                <svg
                  class="self-center flex-shrink-0 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {@html getTrendIcon(trend.direction)}
                </svg>
                <span class="sr-only">
                  {trend.direction === 'up'
                    ? 'Increased'
                    : trend.direction === 'down'
                      ? 'Decreased'
                      : 'No change'} by
                </span>
                {Math.abs(trend.value)}%
                {#if trend.period}
                  <span class="ml-1 text-xs text-gray-500 dark:text-gray-400 font-normal">
                    vs {trend.period}
                  </span>
                {/if}
              </div>
            {/if}
          </dd>

          {#if subtitle && !loading}
            <dd class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {subtitle}
            </dd>
          {/if}
        </dl>
      </div>
    </div>
  </div>

  {#if onClick}
    <!-- Click indicator -->
    <div class="bg-gray-50 dark:bg-gray-700/50 px-5 py-3">
      <div class="text-sm">
        <span
          class="text-gray-600 dark:text-gray-400 font-medium hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          View details
        </span>
        <span class="ml-2 text-gray-400 dark:text-gray-500">→</span>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Ensure consistent hover effects */
  [role='button']:hover {
    transform: translateY(-1px);
  }

  [role='button']:active {
    transform: translateY(0);
  }
</style>
