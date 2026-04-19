import { LOOP_DURATION_SECONDS } from '../constants.js';

export class LoopedAudioBuffer {
  constructor({ sampleRate, channelCount, seconds = LOOP_DURATION_SECONDS, startEpochMs = Date.now(), initialFramesWritten = 0 }) {
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
    this.capacityFrames = Math.max(1, Math.ceil(sampleRate * seconds));
    this.channels = Array.from({ length: channelCount }, () => new Float32Array(this.capacityFrames));
    this.framesWritten = Math.max(0, initialFramesWritten);
    this.streamStartEpochMs = startEpochMs;
  }

  append(channelData, captureEndEpochMs = Date.now()) {
    if (!Array.isArray(channelData) || channelData.length !== this.channelCount) {
      throw new Error('Channel layout changed while recording');
    }

    const frameCount = channelData[0]?.length || 0;
    if (frameCount === 0) {
      return;
    }

    const offset = this.framesWritten;

    for (let channelIndex = 0; channelIndex < this.channelCount; channelIndex += 1) {
      const source = channelData[channelIndex];
      const target = this.channels[channelIndex];

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        target[(offset + frameIndex) % this.capacityFrames] = source[frameIndex];
      }
    }

    this.framesWritten += frameCount;
  }

  extractLast(seconds) {
    if (this.streamStartEpochMs === null) {
      return null;
    }

    const availableFrames = Math.min(this.framesWritten, this.capacityFrames);
    const requestedFrames = Math.min(Math.max(1, Math.round(seconds * this.sampleRate)), this.capacityFrames);
    const copiedFrames = Math.min(requestedFrames, availableFrames);
    const endFrame = this.framesWritten;
    const startFrame = endFrame - copiedFrames;
    const targetOffset = requestedFrames - copiedFrames;
    const output = Array.from({ length: this.channelCount }, () => new Float32Array(requestedFrames));

    for (let channelIndex = 0; channelIndex < this.channelCount; channelIndex += 1) {
      const source = this.channels[channelIndex];
      const target = output[channelIndex];

      for (let frameIndex = 0; frameIndex < copiedFrames; frameIndex += 1) {
        target[targetOffset + frameIndex] = source[(startFrame + frameIndex) % this.capacityFrames];
      }
    }

    return {
      sampleRate: this.sampleRate,
      channelData: output,
      fromEpochMs: Math.round(this.streamStartEpochMs + ((endFrame - requestedFrames) / this.sampleRate) * 1000),
      toEpochMs: Math.round(this.streamStartEpochMs + (endFrame / this.sampleRate) * 1000),
    };
  }
}
