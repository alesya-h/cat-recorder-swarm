import { WS_PATH } from './constants.js';

export function normalizeBackendUrl(input) {
  const fallback = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const value = (input || fallback).trim().replace(/\/$/, '');
  return value || fallback;
}

export function toWebSocketUrl(httpUrl) {
  const url = new URL(normalizeBackendUrl(httpUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = WS_PATH;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function createBackendUrls(baseUrl) {
  const normalized = normalizeBackendUrl(baseUrl);
  return {
    baseUrl: normalized,
    wsUrl: toWebSocketUrl(normalized),
    captureRequestsUrl: `${normalized}/api/capture-requests`,
    clipsUrl: `${normalized}/api/clips`,
    transcriptionsUrl: `${normalized}/api/transcriptions`,
  };
}
