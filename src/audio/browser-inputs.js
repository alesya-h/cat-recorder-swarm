export async function loadBrowserAudioInputs() {
  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
    throw new Error('This browser does not support microphone capture');
  }

  const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        id: device.deviceId || `default-${index}`,
        label: device.label || `Input ${index + 1}`,
        rawDeviceId: device.deviceId || '',
      }));

    if (audioInputs.length === 0) {
      return [{ id: 'default', label: 'Default microphone', rawDeviceId: '' }];
    }

    return audioInputs;
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
