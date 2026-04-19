const WORKLET_SOURCE = `
class CatRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input.map((channel) => new Float32Array(channel));
    let peak = 0;

    for (const channel of channelData) {
      for (let index = 0; index < channel.length; index += 1) {
        const absolute = Math.abs(channel[index]);
        if (absolute > peak) {
          peak = absolute;
        }
      }
    }

    this.port.postMessage({
      channelData,
      peak,
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
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
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
  const gainNode = audioContext.createGain();
  const sink = audioContext.createGain();

  gainNode.gain.value = normalizeGain(input.gain);
  sink.gain.value = 0;
  sink.connect(audioContext.destination);
  await audioContext.resume();

  let disconnectNode = null;

  try {
    if (audioContext.audioWorklet?.addModule && typeof AudioWorkletNode !== 'undefined') {
      disconnectNode = await startWithAudioWorklet({ audioContext, source, gainNode, sink, onChunk, onError });
    } else {
      disconnectNode = startWithScriptProcessor({ audioContext, source, gainNode, sink, onChunk, onError });
    }
  } catch (error) {
    await audioContext.close().catch(() => {});
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }

  return {
    setGain(nextGain) {
      const normalized = normalizeGain(nextGain);
      gainNode.gain.cancelScheduledValues(audioContext.currentTime);
      gainNode.gain.setTargetAtTime(normalized, audioContext.currentTime, 0.02);
    },
    stop: async () => {
      disconnectNode?.();
      sink.disconnect();
      gainNode.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  };
}

async function startWithAudioWorklet({ audioContext, source, gainNode, sink, onChunk, onError }) {
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
  const rollingMeter = createRollingPeakMeter();

  try {
    await audioContext.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }

  const workletNode = new AudioWorkletNode(audioContext, 'cat-recorder-processor');

  workletNode.port.onmessage = (event) => {
    try {
      const channelData = event.data.channelData.map((channel) => new Float32Array(channel));
      const peak = computePeak(channelData);
      onChunk({
        sampleRate: audioContext.sampleRate,
        channelData,
        captureEndEpochMs: Date.now(),
        level: rollingMeter.update(peak),
      });
    } catch (error) {
      onError?.(error);
    }
  };

  source.connect(gainNode);
  gainNode.connect(workletNode);
  workletNode.connect(sink);

  return () => {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
  };
}

function startWithScriptProcessor({ audioContext, source, gainNode, sink, onChunk, onError }) {
  const channelCount = Math.max(1, Math.min(source.channelCount || 1, 2));
  const processor = audioContext.createScriptProcessor(4096, channelCount, channelCount);
  const rollingMeter = createRollingPeakMeter();

  processor.onaudioprocess = (event) => {
    try {
      const inputBuffer = event.inputBuffer;
      const copiedChannelData = Array.from({ length: inputBuffer.numberOfChannels }, (_, channelIndex) => {
        const sourceChannel = inputBuffer.getChannelData(channelIndex);
        return new Float32Array(sourceChannel);
      });

      const peak = computePeak(copiedChannelData);

      onChunk({
        sampleRate: inputBuffer.sampleRate,
        channelData: copiedChannelData,
        captureEndEpochMs: Date.now(),
        level: rollingMeter.update(peak),
      });
    } catch (error) {
      onError?.(error);
    }
  };

  source.connect(gainNode);
  gainNode.connect(processor);
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

function createRollingPeakMeter(windowMs = 500) {
  const entries = [];

  return {
    update(peak, now = Date.now()) {
      entries.push({ peak, now });

      while (entries.length > 0 && now - entries[0].now > windowMs) {
        entries.shift();
      }

      let maxPeak = 0;
      for (const entry of entries) {
        if (entry.peak > maxPeak) {
          maxPeak = entry.peak;
        }
      }

      return maxPeak;
    },
  };
}

function computePeak(channelData) {
  let peak = 0;

  for (const channel of channelData) {
    for (let index = 0; index < channel.length; index += 1) {
      const absolute = Math.abs(channel[index]);
      if (absolute > peak) {
        peak = absolute;
      }
    }
  }

  return peak;
}

function normalizeGain(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.max(0.01, Math.min(256, numeric));
}
