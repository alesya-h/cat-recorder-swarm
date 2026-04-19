let decibriPromise = null;

async function loadDecibri() {
  if (!decibriPromise) {
    decibriPromise = import('decibri')
      .then((module) => module.Decibri || module.default || module)
      .catch((error) => {
        throw new Error(
          `Could not load decibri audio bindings. On Linux, install the ALSA runtime package (usually libasound2). Original error: ${String(error?.message || error)}`,
        );
      });
  }

  return decibriPromise;
}

export async function listNodeInputs() {
  const Decibri = await loadDecibri();
  const devices = Decibri.devices();
  return devices
    .filter((device) => (device.maxInputChannels || 0) > 0)
    .map((device) => ({
      id: String(device.index),
      label: device.name,
      inputName: '',
      device,
    }));
}

export async function startNodeInput({ input, onChunk, onError }) {
  const Decibri = await loadDecibri();
  const sampleRate = Number(input.device.defaultSampleRate || 48000);
  const channels = Math.max(1, Math.min(Number(input.device.maxInputChannels || 1), 2));

  const mic = new Decibri({
    device: input.device.index,
    sampleRate,
    channels,
    format: 'float32',
    framesPerBuffer: 4096,
  });

  const onData = (chunk) => {
    try {
      const float32 = new Float32Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
      const channelData = deinterleave(float32, channels);
      onChunk({
        sampleRate,
        channelData,
        captureEndEpochMs: Date.now(),
      });
    } catch (error) {
      onError?.(error);
    }
  };

  mic.on('data', onData);
  mic.on('error', (error) => onError?.(error));

  return {
    stop: async () => {
      mic.off('data', onData);
      mic.stop();
    },
  };
}

function deinterleave(interleaved, channelCount) {
  const frameCount = Math.floor(interleaved.length / channelCount);
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      channels[channelIndex][frameIndex] = interleaved[frameIndex * channelCount + channelIndex];
    }
  }

  return channels;
}
