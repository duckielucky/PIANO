export const TRACKS = [
  { id: 'midnight', title: 'Midnight Circuit', bpm: 128, root: 45, bars: 32, mood: 'A neon-lit ride through the afterhours.', color: '#aa8cff' },
  { id: 'afterglow', title: 'Afterglow', bpm: 110, root: 48, bars: 24, mood: 'Warm chords. A little room to breathe.', color: '#ffae9d' },
  { id: 'velocity', title: 'Terminal Velocity', bpm: 150, root: 42, bars: 40, mood: 'Fast lanes and late-night energy.', color: '#65edfa' },
];
export const WINDOWS = { perfect: .09, great: .16, good: .24, miss: .27 };
export const POINTS = { perfect: 1000, great: 700, good: 400, miss: 0 };
export function gradeTiming(delta) {
  const d = Math.abs(delta);
  return d <= WINDOWS.perfect ? 'perfect' : d <= WINDOWS.great ? 'great' : d <= WINDOWS.good ? 'good' : null;
}
export function gradeAccuracy(accuracy) {
  return accuracy >= 98 ? 'S' : accuracy >= 92 ? 'A' : accuracy >= 80 ? 'B' : accuracy >= 65 ? 'C' : 'D';
}
export function makeChart(track, difficulty = 'easy') {
  const beat = 60 / track.bpm, notes = [];
  const phrases = [[0,2,1,3,2,1,0,3],[1,0,3,2,0,2,3,1],[3,1,2,0,1,3,2,0],[2,3,0,1,3,0,1,2]];
  for (let bar = 1; bar < track.bars - 1; bar++) {
    const phrase = phrases[bar % 4];
    const steps = difficulty === 'easy' ? [0,4] : difficulty === 'hard' ? [0,2,3,4,6,7] : [0,2,4,6];
    steps.forEach((step, i) => {
      let lane = phrase[i % 8];
      let type = 'tap', duration = 0;
      if (step === (difficulty === 'easy' ? 4 : 6) && bar % 4 === 2) { type = 'hold'; duration = beat; }
      const time = (bar * 4 + step / 2) * beat;
      // Holds never compete with a second note in their own lane.
      if (notes.some(n => n.lane === lane && n.type === 'hold' && time <= n.time + n.duration + .2)) lane = (lane + 1) % 4;
      notes.push({ id: notes.length, lane, time, type, duration, status: 'pending' });

    });
  }
  return notes.sort((a,b) => a.time - b.time || a.lane - b.lane);
}
export class Run {
  constructor(notes, difficulty = 'easy') {
    this.difficulty = difficulty;
    this.notes = notes; this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.energy = 100; this.counts = { perfect: 0, great: 0, good: 0, miss: 0 }; this.errors = [];
  }
  candidate(lane, time) {
    return this.notes.find(n => n.lane === lane && n.status === 'pending' && gradeTiming(n.time - time));
  }
  judge(note, result, error = null) {
    if (note.status === 'hit' || note.status === 'miss') return false;
    note.status = result === 'miss' ? 'miss' : 'hit';
    this.counts[result]++;
    if (result === 'miss') { this.combo = 0; this.energy = Math.max(0, this.energy - 2); }
    else { this.combo++; this.score += POINTS[result]; this.maxCombo = Math.max(this.maxCombo, this.combo); this.energy = Math.min(100, this.energy + 1.6); }
    if (error !== null) this.errors.push(error);
    return true;
  }
  get failed() { return this.difficulty !== 'easy' && this.energy <= 0; }
  get accuracy() {
    const count = Object.values(this.counts).reduce((a,b) => a+b,0);
    return count ? (this.counts.perfect + this.counts.great*.7 + this.counts.good*.4) / count * 100 : 0;
  }
}
