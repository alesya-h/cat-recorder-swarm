import { encodeWav } from './wav.js';

let flacModulePromise = null;

export async function encodeAudioClip(clip) {
  try {
    const bytes = await encodeFlac(clip);
    return { bytes, format: 'flac' };
  } catch {
    return { bytes: encodeWav(clip), format: 'wav' };
  }
}

async function encodeFlac({ sampleRate, channelData }) {
  const Flac = await loadFlac();
  const channelCount = channelData.length;
  const frameCount = channelData[0]?.length || 0;

  if (channelCount === 0 || frameCount === 0) {
    throw new Error('No audio data to encode');
  }

  const encoder = Flac.create_libflac_encoder(sampleRate, channelCount, 16, 5, 0, false, 0);
  if (!encoder) {
    throw new Error('Could not create FLAC encoder');
  }

  const chunks = [];

  try {
    const initStatus = Flac.init_encoder_stream(
      encoder,
      (encodedData) => {
        chunks.push(new Uint8Array(encodedData));
      },
      () => {},
    );

    if (initStatus !== 0) {
      throw new Error(`FLAC encoder init failed with status ${initStatus}`);
    }

    const interleaved = interleaveAsInt32(channelData);
    const ok = Flac.FLAC__stream_encoder_process_interleaved(encoder, interleaved, frameCount);
    if (!ok) {
      throw new Error('FLAC encode failed');
    }

    const finished = Flac.FLAC__stream_encoder_finish(encoder);
    if (!finished) {
      throw new Error('FLAC finalize failed');
    }

    return concatUint8Arrays(chunks);
  } finally {
    Flac.FLAC__stream_encoder_delete(encoder);
  }
}

async function loadFlac() {
  if (!flacModulePromise) {
    flacModulePromise = import('libflacjs/dist/libflac.js').then((module) => {
      const Flac = module.default || module;
      return waitForFlacReady(Flac);
    });
  }

  return flacModulePromise;
}

function waitForFlacReady(Flac) {
  if (typeof Flac.isReady !== 'function' || Flac.isReady()) {
    return Promise.resolve(Flac);
  }

  return new Promise((resolve) => {
    Flac.on('ready', () => resolve(Flac));
  });
}

function interleaveAsInt32(channelData) {
  const channelCount = channelData.length;
  const frameCount = channelData[0].length;
  const output = new Int32Array(frameCount * channelCount);
  let offset = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = clampSample(channelData[channelIndex][frameIndex]);
      output[offset] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
      offset += 1;
    }
  }

  return output;
}

function clampSample(sample) {
  if (sample > 1) {
    return 1;
  }
  if (sample < -1) {
    return -1;
  }
  return sample;
}

function concatUint8Arrays(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
