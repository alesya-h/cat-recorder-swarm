import fs from 'node:fs/promises';
import path from 'node:path';

export function createRecordingStore({ recordingsDir }) {
  return {
    async listRecordings() {
      const entries = await readDirectory(recordingsDir, { withFileTypes: true });
      const folderNames = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => Number(right) - Number(left));

      const recordings = await Promise.all(folderNames.map(async (folderName) => {
        const folder = path.join(recordingsDir, folderName);
        const requestDetails = await readJsonFile(path.join(folder, 'request.json'));
        const transcription = await readTextFile(path.join(folder, 'transcription.txt'));
        const files = await readDirectory(folder, { withFileTypes: true });
        const clips = files
          .filter((entry) => entry.isFile() && /\.(wav|flac)$/i.test(entry.name))
          .map((entry) => buildClipSummary(folderName, entry.name))
          .sort((left, right) => {
            if (!Number.isFinite(left.fromEpochMs) || !Number.isFinite(right.fromEpochMs)) {
              return left.fileName.localeCompare(right.fileName);
            }

            return left.fromEpochMs - right.fromEpochMs;
          });

        const requestedAtEpochMs = Number(requestDetails?.controllerTimestamp || folderName);

        return {
          controllerTimestamp: String(requestDetails?.controllerTimestamp || folderName),
          requestedAtEpochMs: Number.isFinite(requestedAtEpochMs) ? requestedAtEpochMs : null,
          requestedDurationSeconds: Number(requestDetails?.durationSeconds) || null,
          transcription: transcription || '',
          clips,
        };
      }));

      return recordings;
    },

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

function buildClipSummary(folderName, fileName) {
  const clipMatch = fileName.match(/^(.*)_(\d+)_(\d+)\.(wav|flac)$/i);
  const fromEpochMs = clipMatch ? Number(clipMatch[2]) : null;
  const toEpochMs = clipMatch ? Number(clipMatch[3]) : null;
  const durationSeconds = Number.isFinite(fromEpochMs) && Number.isFinite(toEpochMs)
    ? Math.max(0, (toEpochMs - fromEpochMs) / 1000)
    : null;

  return {
    fileName,
    sourceName: clipMatch ? clipMatch[1] : fileName,
    fromEpochMs,
    toEpochMs,
    durationSeconds,
    audioPath: `/recordings-files/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`,
  };
}

async function readDirectory(target, options) {
  try {
    return await fs.readdir(target, options);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function readJsonFile(target) {
  try {
    const text = await fs.readFile(target, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function readTextFile(target) {
  try {
    return await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

async function ensureRecordingFolder(recordingsDir, controllerTimestamp) {
  const folder = path.join(recordingsDir, String(controllerTimestamp));
  await fs.mkdir(folder, { recursive: true });
  return folder;
}
