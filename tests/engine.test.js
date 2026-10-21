import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, makeChart, gradeTiming, Run } from '../dist/engine.js';
test('timing windows are symmetric and reject off-beat taps',()=>{
  assert.equal(gradeTiming(.07),'perfect');assert.equal(gradeTiming(-.13),'great');assert.equal(gradeTiming(.22),'good');assert.equal(gradeTiming(.28),null);assert.equal(gradeTiming(-.28),null);
});
test('every track and difficulty has playable lane timing with no overlapping holds',()=>{
  for(const t of TRACKS)for(const difficulty of ['easy','normal','hard']){
    const chart=makeChart(t,difficulty);assert.ok(chart.length>30);
    for(let i=0;i<chart.length;i++){
      const n=chart[i];assert.ok(n.lane>=0&&n.lane<4);assert.ok(n.time<t.bars*4*60/t.bpm);
      assert.ok(['tap','hold'].includes(n.type));
      const next=chart.slice(i+1).find(b=>b.lane===n.lane);
      if(next)assert.ok(next.time-n.time>=(n.duration||.1),`${t.id}/${difficulty}: overlap at ${n.time}`);
    }
  }
});
test('judgment scores once, resets combo on a miss, and computes accuracy',()=>{
  const r=new Run(makeChart(TRACKS[0]));assert.equal(r.judge(r.notes[0],'perfect'),true);assert.equal(r.judge(r.notes[0],'perfect'),false);
  r.judge(r.notes[1],'great');assert.equal(r.score,1700);assert.equal(r.combo,2);assert.equal(r.accuracy,85);
  r.judge(r.notes[2],'miss');assert.equal(r.combo,0);assert.equal(r.maxCombo,2);assert.equal(r.energy,98);
});
test('hold results are counted once on completion or early release',()=>{
  const notes=makeChart(TRACKS[0]);const r=new Run(notes);const hold=notes.find(n=>n.type==='hold');hold.status='holding';
  r.judge(hold,'miss');r.judge(hold,'perfect');assert.equal(r.score,0);assert.equal(r.counts.miss,1);assert.equal(r.counts.perfect,0);
});

test('Chill leaves space between notes and never asks for another tap during a hold',()=>{
  for(const track of TRACKS){
    const notes=makeChart(track,'easy');
    assert.ok(notes.some(n=>n.type==='hold'));
    for(let i=0;i<notes.length-1;i++){
      const n=notes[i],next=notes[i+1];
      assert.ok(next.time-n.time>=.79,'At least two beats between new notes');
      assert.ok(next.time-(n.time+n.duration)>=.39,'A free hand before the next note');
    }
  }
});
test('Chill continues at zero energy while other difficulties can still fail',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const run=new Run(makeChart(TRACKS[0],difficulty),difficulty);
    for(const note of run.notes)run.judge(note,'miss');
    assert.equal(run.energy,0);assert.equal(run.failed,difficulty!=='easy');
  }
});
