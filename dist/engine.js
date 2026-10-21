export const TRACKS = [
  { id: 'midnight', title: 'Midnight Circuit', bpm: 128, root: 45, bars: 32, mood: 'A neon-lit ride through the afterhours.', color: '#aa8cff' },
  { id: 'afterglow', title: 'Afterglow', bpm: 110, root: 48, bars: 24, mood: 'Warm chords. A little room to breathe.', color: '#ffae9d' },
  { id: 'velocity', title: 'Terminal Velocity', bpm: 150, root: 42, bars: 40, mood: 'Fast lanes and late-night energy.', color: '#65edfa' },
];
export const WINDOWS = { perfect: .055, great: .105, good: .165, miss: .19 };
export const POINTS = { perfect: 1000, great: 700, good: 400, miss: 0 };
export function gradeTiming(delta) {
  const d = Math.abs(delta);
  return d <= WINDOWS.perfect ? 'perfect' : d <= WINDOWS.great ? 'great' : d <= WINDOWS.good ? 'good' : null;
}
export function gradeAccuracy(accuracy) {
  return accuracy >= 98 ? 'S' : accuracy >= 92 ? 'A' : accuracy >= 80 ? 'B' : accuracy >= 65 ? 'C' : 'D';
}
export function makeChart(track, difficulty = 'normal') {
  const beat = 60 / track.bpm, notes = [];
  const phrases = [[0,2,1,3,2,1,0,3],[1,0,3,2,0,2,3,1],[3,1,2,0,1,3,2,0],[2,3,0,1,3,0,1,2]];
  for (let bar = 1; bar < track.bars - 1; bar++) {
    const phrase = phrases[bar % 4];
    const steps = difficulty === 'easy' ? [0,2,4,6] : difficulty === 'hard' ? [0,1,2,3,4,5,6,7] : [0,2,3,4,6,7];
    steps.forEach((step, i) => {
      let lane = phrase[i % 8];
      let type = 'tap', duration = 0, direction = 0;
      if (step === 6 && bar % 4 === 2) { type = 'hold'; duration = beat * 1.5; }
      if (step === 4 && bar % 4 === 3 && difficulty !== 'easy') { type = 'swipe'; direction = lane >= 2 ? -1 : 1; }
      const time = (bar * 4 + step / 2) * beat;
      // Holds never compete with a second note in their own lane.
      if (notes.some(n => n.lane === lane && n.type === 'hold' && time <= n.time + n.duration + .2)) lane = (lane + 1) % 4;
      notes.push({ id: notes.length, lane, time, type, duration, direction, status: 'pending' });
      if (difficulty === 'hard' && step === 0 && bar % 2 === 0) {
        const other = (lane + 2) % 4;
        if (!notes.some(n => n.lane === other && n.type === 'hold' && time <= n.time + n.duration + .2))
          notes.push({ id: notes.length, lane: other, time, type: 'tap', duration: 0, direction: 0, status: 'pending' });
      }
    });
  }
  return notes.sort((a,b) => a.time - b.time || a.lane - b.lane);
}
export class Run {
  constructor(notes) {
    this.notes = notes; this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.energy = 100; this.counts = { perfect: 0, great: 0, good: 0, miss: 0 }; this.errors = [];
  }
  candidate(lane, time, swipe = false) {
    return this.notes.find(n => n.lane === lane && n.status === 'pending' && (swipe ? n.type === 'swipe' : n.type !== 'swipe') && gradeTiming(n.time - time));
  }
  judge(note, result, error = null) {
    if (note.status === 'hit' || note.status === 'miss') return false;
    note.status = result === 'miss' ? 'miss' : 'hit';
    this.counts[result]++;
    if (result === 'miss') { this.combo = 0; this.energy = Math.max(0, this.energy - 5); }
    else { this.combo++; this.score += POINTS[result]; this.maxCombo = Math.max(this.maxCombo, this.combo); this.energy = Math.min(100, this.energy + 1.6); }
    if (error !== null) this.errors.push(error);
    return true;
  }
  get accuracy() {
    const count = Object.values(this.counts).reduce((a,b) => a+b,0);
    return count ? (this.counts.perfect + this.counts.great*.7 + this.counts.good*.4) / count * 100 : 0;
  }
}
