export const LOOP_DURATION_SECONDS = 300;

export const CAPTURE_PRESETS = [
  { label: 'Full 5 min', seconds: LOOP_DURATION_SECONDS },
  { label: 'Last 60 s', seconds: 60 },
  { label: 'Last 30 s', seconds: 30 },
  { label: 'Last 10 s', seconds: 10 },
];

export const WS_PATH = '/ws';

export const RECONNECT_DELAY_MS = 1500;
