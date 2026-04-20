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

export function formatDateTime(value) {
  if (value === null || value === undefined || value === '') {
    return 'unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return 'unknown';
  }

  if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`;
  }

  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
