export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000_000) {
    const b = value / 1_000_000_000;
    return '$' + (Number.isInteger(b) ? b : b.toFixed(1)) + 'B';
  }
  if (value >= 1_000_000) {
    return '$' + Math.round(value / 1_000_000) + 'M';
  }
  if (value >= 1_000) {
    return '$' + Math.round(value / 1_000) + 'K';
  }
  return formatCurrency(Math.round(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatMultiple(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '0×';
  return Math.round(value) + '×';
}

export function formatPPA(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value) + '/ac';
}
