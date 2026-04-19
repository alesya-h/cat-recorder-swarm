export function analyzeChannelData(channelData) {
  let sum = 0;
  let count = 0;
  let peak = 0;

  for (const channel of channelData) {
    for (let index = 0; index < channel.length; index += 1) {
      const sample = channel[index];
      const absolute = Math.abs(sample);
      if (absolute > peak) {
        peak = absolute;
      }
      sum += sample * sample;
      count += 1;
    }
  }

  const rms = count === 0 ? 0 : Math.sqrt(sum / count);

  return {
    peak,
    rms,
    sampleCount: count,
    effectivelySilent: peak < 1e-4 && rms < 1e-5,
  };
}
