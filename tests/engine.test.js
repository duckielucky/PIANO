import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, makeChart, gradeTiming, Run } from '../dist/engine.js';
test('timing windows are symmetric and reject off-beat taps',()=>{
  assert.equal(gradeTiming(.025),'perfect');assert.equal(gradeTiming(-.09),'great');assert.equal(gradeTiming(.14),'good');assert.equal(gradeTiming(.2),null);assert.equal(gradeTiming(-.2),null);
});
test('every track and difficulty has playable lane timing with no overlapping holds',()=>{
  for(const t of TRACKS)for(const difficulty of ['easy','normal','hard']){
    const chart=makeChart(t,difficulty);assert.ok(chart.length>50);
    for(let i=0;i<chart.length;i++){
      const n=chart[i];assert.ok(n.lane>=0&&n.lane<4);assert.ok(n.time<t.bars*4*60/t.bpm);
      if(difficulty==='easy')assert.notEqual(n.type,'swipe');
      const next=chart.slice(i+1).find(b=>b.lane===n.lane);
      if(next)assert.ok(next.time-n.time>=(n.duration||.1),`${t.id}/${difficulty}: overlap at ${n.time}`);
    }
  }
});
test('judgment scores once, resets combo on a miss, and computes accuracy',()=>{
  const r=new Run(makeChart(TRACKS[0]));assert.equal(r.judge(r.notes[0],'perfect'),true);assert.equal(r.judge(r.notes[0],'perfect'),false);
  r.judge(r.notes[1],'great');assert.equal(r.score,1700);assert.equal(r.combo,2);assert.equal(r.accuracy,85);
  r.judge(r.notes[2],'miss');assert.equal(r.combo,0);assert.equal(r.maxCombo,2);assert.equal(r.energy,95);
});
test('hold results are counted once on completion or early release',()=>{
  const notes=makeChart(TRACKS[0]);const r=new Run(notes);const hold=notes.find(n=>n.type==='hold');hold.status='holding';
  r.judge(hold,'miss');r.judge(hold,'perfect');assert.equal(r.score,0);assert.equal(r.counts.miss,1);assert.equal(r.counts.perfect,0);
});
