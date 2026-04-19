export function formatBattery(battery) {
  if (!battery) {
    return 'unknown';
  }

  return `${Math.round((battery.level || 0) * 100)}% ${battery.charging ? 'charging' : 'on battery'}`;
}

export function formatLevel(level) {
  if (!Number.isFinite(level)) {
    return 'level unknown';
  }

  const percent = Math.max(0, Math.min(100, Math.round(level * 100)));
  return `peak ${percent}%`;
}
