// Analyses one song for VIPERMIX's server: raw PCM in on stdin, the same
// analyzePcm JSON the built-in songs carry out on stdout.
//
//   ffmpeg -v error -t 180 -i song.mp3 -ac 2 -ar 44100 -f f32le - | node scripts/analyze-pcm.mjs --rate 44100
//
// The server runs it sandboxed (node --permission, no network, no files), so it
// only reads stdin and writes stdout: no file paths, no imports beyond node
// built-ins and the game's own beat-analysis.js. Input = interleaved stereo
// 32-bit float samples (f32le) at --rate Hz (default 44100).
import { analyzePcm } from '../dist/beat-analysis.js';
import { downsample, ANALYSIS_RATE } from './pcm.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const source = Number(arg('--rate') || 44100);
if (!(source >= 8000 && source <= 192000)) { console.error('--rate must be 8000-192000'); process.exit(2); }

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks);
const usable = raw.length - raw.length % 8;            // whole stereo float frames
if (usable < source * 8) { console.error('need at least one second of audio'); process.exit(3); }
const pcm = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + usable));
const analysis = analyzePcm(downsample(pcm, source), ANALYSIS_RATE);
process.stdout.write(JSON.stringify(analysis) + '\n');
