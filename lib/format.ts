export function cnDelta(value: number, invert = false): string {
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  if (good) return "text-signal";
  if (bad) return "text-danger";
  return "text-muted-foreground";
}

export function formatDeltaPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function formatDeltaPosition(value: number): string {
  // value is previous - current; positive means improved (moved up)
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return "0.0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}
