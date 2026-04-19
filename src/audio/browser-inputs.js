const WORKLET_SOURCE = `
class CatRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input.map((channel) => new Float32Array(channel));
    let sum = 0;
    let count = 0;

    for (const channel of channelData) {
      for (let index = 0; index < channel.length; index += 1) {
        const sample = channel[index];
        sum += sample * sample;
        count += 1;
      }
    }

    this.port.postMessage({
      channelData,
      level: count === 0 ? 0 : Math.sqrt(sum / count),
    });

    return true;
  }
}

registerProcessor('cat-recorder-processor', CatRecorderProcessor);
`;

export async function loadBrowserAudioInputs() {
  assertBrowserAudioSupport();

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
  assertBrowserAudioSupport();

  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  };

  if (input.rawDeviceId) {
    constraints.audio.deviceId = { exact: input.rawDeviceId };
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextCtor) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('This browser does not provide the Web Audio API needed for recording');
  }

  const audioContext = new AudioContextCtor({ latencyHint: 'interactive' });
  const source = audioContext.createMediaStreamSource(stream);
  const sink = audioContext.createGain();

  sink.gain.value = 0;
  sink.connect(audioContext.destination);
  await audioContext.resume();

  let disconnectNode = null;

  try {
    if (audioContext.audioWorklet?.addModule && typeof AudioWorkletNode !== 'undefined') {
      disconnectNode = await startWithAudioWorklet({ audioContext, source, sink, onChunk, onError });
    } else {
      disconnectNode = startWithScriptProcessor({ audioContext, source, sink, onChunk, onError });
    }
  } catch (error) {
    await audioContext.close().catch(() => {});
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }

  return {
    stop: async () => {
      disconnectNode?.();
      sink.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  };
}

async function startWithAudioWorklet({ audioContext, source, sink, onChunk, onError }) {
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));

  try {
    await audioContext.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }

  const workletNode = new AudioWorkletNode(audioContext, 'cat-recorder-processor');

  workletNode.port.onmessage = (event) => {
    try {
      const channelData = event.data.channelData.map((channel) => new Float32Array(channel));
      onChunk({
        sampleRate: audioContext.sampleRate,
        channelData,
        captureEndEpochMs: Date.now(),
        level: event.data.level || 0,
      });
    } catch (error) {
      onError?.(error);
    }
  };

  source.connect(workletNode);
  workletNode.connect(sink);

  return () => {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
  };
}

function startWithScriptProcessor({ audioContext, source, sink, onChunk, onError }) {
  const channelCount = Math.max(1, Math.min(source.channelCount || 1, 2));
  const processor = audioContext.createScriptProcessor(4096, channelCount, channelCount);

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
        level: computeLevel(copiedChannelData),
      });
    } catch (error) {
      onError?.(error);
    }
  };

  source.connect(processor);
  processor.connect(sink);

  return () => {
    processor.onaudioprocess = null;
    processor.disconnect();
  };
}

function assertBrowserAudioSupport() {
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    throw new Error('Microphone capture requires HTTPS or localhost. This page is not running in a secure context.');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose getUserMedia for microphone capture.');
  }
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

function computeLevel(channelData) {
  let sum = 0;
  let count = 0;

  for (const channel of channelData) {
    for (let index = 0; index < channel.length; index += 1) {
      const sample = channel[index];
      sum += sample * sample;
      count += 1;
    }
  }

  return count === 0 ? 0 : Math.sqrt(sum / count);
}
