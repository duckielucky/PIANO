// The one way this game turns decoded audio into analyser input: stereo samples
// at the source rate, averaged down to 11025 Hz per channel. Shared by
// bundle-songs.mjs (the built-in songs) and analyze-pcm.mjs (VIPERMIX's server),
// so a song gets the same notes whichever way it was analysed.
export const ANALYSIS_RATE = 11025;

// pcm: interleaved stereo Float32Array at `source` Hz.
export function downsample(pcm, source, rate = ANALYSIS_RATE) {
  const frames = pcm.length / 2, ratio = source / rate, length = Math.ceil(frames / source * rate);
  return [0, 1].map(c => {
    const output = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const begin = Math.floor(i * ratio), end = Math.min(frames, Math.max(begin + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let k = begin; k < end; k++) sum += pcm[2 * k + c];
      output[i] = sum / Math.max(1, end - begin);
    }
    return output;
  });
}
