import { createBackendUrls } from '../../../shared/net.js';

export async function requestCapture(baseUrl, durationSeconds) {
  const urls = createBackendUrls(baseUrl);
  const response = await fetch(urls.captureRequestsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationSeconds }),
  });

  if (!response.ok) {
    throw new Error(`Capture request failed with ${response.status}`);
  }

  return response.json();
}

export async function submitTranscription(baseUrl, controllerTimestamp, transcription) {
  const urls = createBackendUrls(baseUrl);
  const response = await fetch(urls.transcriptionsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controllerTimestamp, transcription }),
  });

  if (!response.ok) {
    throw new Error(`Transcription upload failed with ${response.status}`);
  }
}
