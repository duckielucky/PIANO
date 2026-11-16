import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzePcm } from '../dist/beat-analysis.js';
import { downsample } from '../scripts/pcm.mjs';

const script = fileURLToPath(new URL('../scripts/analyze-pcm.mjs', import.meta.url));
const run = (input, args = []) => spawnSync(process.execPath, [script, ...args], { input, maxBuffer: 1 << 26 });

// A kick on every beat at `bpm`, stereo f32le at `rate` Hz.
function kicks(bpm, seconds, rate = 44100) {
  const frames = seconds * rate, pcm = new Float32Array(frames * 2);
  for (let beat = .5; beat < seconds; beat += 60 / bpm) {
    const start = Math.round(beat * rate);
    for (let i = 0; i < rate * .15 && start + i < frames; i++) {
      const v = .8 * Math.sin(i / rate * 2 * Math.PI * 60) * Math.exp(-i / rate * 30);
      pcm[2 * (start + i)] += v; pcm[2 * (start + i) + 1] += v;
    }
  }
  return pcm;
}

test('stdin PCM in, the same analysis as analysing it in place out', () => {
  const pcm = kicks(120, 20);
  const r = run(Buffer.from(pcm.buffer), ['--rate', '44100']);
  assert.equal(r.status, 0, r.stderr.toString());
  const out = JSON.parse(r.stdout.toString());
  assert.deepEqual(out, JSON.parse(JSON.stringify(analyzePcm(downsample(pcm, 44100), 11025))));
  assert.ok(Math.abs(out.bpm - 120) <= 1, 'bpm ' + out.bpm);
});

test('refuses too little audio and a bad rate', () => {
  assert.equal(run(Buffer.alloc(800)).status, 3);
  assert.equal(run(Buffer.alloc(800), ['--rate', 'abc']).status, 2);
});

test('runs with no file or network permissions (how the server runs it)', () => {
  const pcm = kicks(100, 12);
  const dir = fileURLToPath(new URL('..', import.meta.url));
  const r = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${dir}`, script, '--rate', '44100'],
                      { input: Buffer.from(pcm.buffer), maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr.toString());
  assert.ok(Math.abs(JSON.parse(r.stdout.toString()).bpm - 100) <= 1);
});
