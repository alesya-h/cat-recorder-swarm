import fs from 'node:fs/promises';
import path from 'node:path';

export function createRecordingStore({ recordingsDir }) {
  return {
    async writeCaptureRequest({ controllerTimestamp, durationSeconds }) {
      const folder = await ensureRecordingFolder(recordingsDir, controllerTimestamp);
      const requestDetails = {
        controllerTimestamp,
        durationSeconds,
        createdAtIso: new Date(controllerTimestamp).toISOString(),
      };

      await fs.writeFile(path.join(folder, 'request.json'), JSON.stringify(requestDetails, null, 2));
    },

    async writeTranscription({ controllerTimestamp, transcription }) {
      const folder = await ensureRecordingFolder(recordingsDir, controllerTimestamp);
      await fs.writeFile(path.join(folder, 'transcription.txt'), transcription, 'utf8');
    },

    async writeClip({ controllerTimestamp, deviceName, inputName, fromEpochMs, toEpochMs, format, bytes }) {
      const safeDevice = sanitizeName(deviceName);
      const safeInput = sanitizeName(inputName);
      const safeExtension = format === 'flac' ? 'flac' : 'wav';
      const fileName = safeInput
        ? `${safeDevice}_${safeInput}_${fromEpochMs}_${toEpochMs}.${safeExtension}`
        : `${safeDevice}_${fromEpochMs}_${toEpochMs}.${safeExtension}`;

      const folder = await ensureRecordingFolder(recordingsDir, controllerTimestamp);
      await fs.writeFile(path.join(folder, fileName), bytes);
    },
  };
}

export function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unnamed';
}

async function ensureRecordingFolder(recordingsDir, controllerTimestamp) {
  const folder = path.join(recordingsDir, String(controllerTimestamp));
  await fs.mkdir(folder, { recursive: true });
  return folder;
}
