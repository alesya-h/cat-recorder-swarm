export function buildInputName(input, alias, totalSelected) {
  const trimmed = (alias || '').trim();
  if (trimmed) {
    return trimmed;
  }
  if (totalSelected > 1) {
    return input.label;
  }
  return '';
}

export function getInputGainDb(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(-12, Math.min(42, numeric));
}

export function gainFromDb(db) {
  return 10 ** (db / 20);
}

export function formatGain(db) {
  const sign = db > 0 ? '+' : '';
  return `${sign}${db} dB (${gainFromDb(db).toFixed(1)}x)`;
}
