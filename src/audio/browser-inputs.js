export async function loadBrowserAudioInputs() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support microphone capture');
  }

  const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  try {
    const devices = await tryEnumerateDevices();
    const audioInputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        id: device.deviceId || `default-${index}`,
        label: device.label || `Input ${index + 1}`,
        rawDeviceId: device.deviceId || '',
      }));

    if (audioInputs.length > 0) {
      return audioInputs;
    }

    return fallbackInputsFromStream(permissionStream);
  } finally {
    permissionStream.getTracks().forEach((track) => track.stop());
  }
}

export async function startBrowserInput({ input, onChunk, onError }) {
  const constraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    },
  };

  if (input.rawDeviceId) {
    constraints.audio.deviceId = { exact: input.rawDeviceId };
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor({ latencyHint: 'interactive' });
  const source = audioContext.createMediaStreamSource(stream);
  const channelCount = Math.max(1, Math.min(source.channelCount || 1, 2));
  const processor = audioContext.createScriptProcessor(4096, channelCount, channelCount);
  const sink = audioContext.createGain();

  sink.gain.value = 0;

  processor.onaudioprocess = (event) => {
    try {
      const inputBuffer = event.inputBuffer;
      const copiedChannelData = Array.from({ length: inputBuffer.numberOfChannels }, (_, channelIndex) => {
        const sourceChannel = inputBuffer.getChannelData(channelIndex);
        return new Float32Array(sourceChannel);
      });

      onChunk({
        sampleRate: inputBuffer.sampleRate,
        channelData: copiedChannelData,
        captureEndEpochMs: Date.now(),
      });
    } catch (error) {
      onError?.(error);
    }
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);
  await audioContext.resume();

  return {
    stop: async () => {
      processor.disconnect();
      sink.disconnect();
      source.disconnect();
      processor.onaudioprocess = null;
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  };
}

async function tryEnumerateDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  try {
    return await withTimeout(navigator.mediaDevices.enumerateDevices(), 2500);
  } catch {
    return [];
  }
}

function fallbackInputsFromStream(stream) {
  const audioTracks = stream.getAudioTracks();

  if (audioTracks.length === 0) {
    return [{ id: 'default', label: 'Default microphone', rawDeviceId: '' }];
  }

  return audioTracks.map((track, index) => {
    const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    const rawDeviceId = settings.deviceId || '';
    return {
      id: rawDeviceId || track.id || `default-${index}`,
      label: track.label || `Microphone ${index + 1}`,
      rawDeviceId,
    };
  });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timed out')), timeoutMs);
    }),
  ]);
}
