<script lang="ts">
  import { useFormatters } from '$lib/i18n/hooks';
  
  interface Props {
    value: number;
    style?: 'decimal' | 'currency' | 'percent' | 'unit';
    currency?: string;
    unit?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    useGrouping?: boolean;
    notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
    signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
    compact?: boolean;
  }
  
  let {
    value,
    style = 'decimal',
    currency = 'USD',
    unit,
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping = true,
    notation = 'standard',
    signDisplay = 'auto',
    compact = false
  }: Props = $props();
  
  const { formatNumber, formatCurrency, formatPercentage } = useFormatters();
  
  $: formattedValue = (() => {
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping,
      notation: compact ? 'compact' : notation,
      signDisplay
    };
    
    switch (style) {
      case 'currency':
        return formatCurrency(value, currency);
        
      case 'percent':
        return formatPercentage(value * 100, minimumFractionDigits || 0);
        
      case 'unit':
        return formatNumber(value, { ...options, style: 'unit', unit });
        
      default:
        return formatNumber(value, options);
    }
  })();
</script>

<span class="formatted-number" data-value={value}>
  {formattedValue}
</span>

<style>
  .formatted-number {
    /* Ensure numbers in RTL languages display correctly */
    unicode-bidi: embed;
  }
</style>