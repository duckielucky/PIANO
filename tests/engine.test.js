import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACKS, MELODY, melodyNote, makeChart, songSection, gradeTiming, Run, syncStep, SYNC_RANGE, HARD_WINDOWS } from '../dist/engine.js';
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

test('built-in charts follow the song: held breakdown, a two-lane drop, busier fills',()=>{
  for(const track of TRACKS){
    const beat=60/track.bpm,barOf=n=>Math.floor(n.time/beat/4);
    for(const difficulty of ['easy','normal','hard']){
      const chart=makeChart(track,difficulty),in_=section=>chart.filter(n=>songSection(track,barOf(n))===section);
      assert.ok(in_('breakdown').some(n=>n.type==='hold'),'breakdown has holds');
      const drop=in_('drop'),chords=drop.filter(n=>drop.filter(m=>m.time===n.time).length===2);
      assert.equal(chords.length>0,difficulty!=='easy',track.id+'/'+difficulty+' drop chord');
      const perBar=section=>{const notes=in_(section);return notes.length/new Set(notes.map(barOf)).size;};
      if(difficulty!=='easy')assert.ok(perBar('fill')>perBar('groove')&&perBar('breakdown')<perBar('groove'));
    }
  }
});
test('built-in lanes play the lead like piano keys: up moves right, down moves left',()=>{
  // The chart reads the same tune the soundtrack plays.
  assert.ok(readFileSync(new URL('../dist/audio.js',import.meta.url),'utf8').includes('const melody=['+MELODY.join(',')+']'));
  for(const track of TRACKS){
    const beat=60/track.bpm;
    for(const difficulty of ['easy','normal','hard']){
      const chart=makeChart(track,difficulty),single=chart.filter(n=>chart.filter(m=>m.time===n.time).length===1);
      const note=n=>{const eighth=Math.round(n.time/beat*2);return melodyNote(Math.floor(eighth/8),eighth%8);};
      let agree=0,pairs=0;
      for(let i=1;i<single.length;i++){
        const a=single[i-1],b=single[i],step=note(b)-note(a),move=Math.sign(b.lane-a.lane);
        if(b.time-a.time>2*beat||a.type==='hold')continue;
        const edge=step>0?a.lane===3:step<0&&a.lane===0;
        pairs++;if(move===Math.sign(step)||edge&&move===0)agree++;
      }
      assert.ok(agree>=pairs*.9,`${track.id}/${difficulty}: ${agree} of ${pairs} lane moves follow the tune`);
      assert.equal(new Set(chart.map(n=>n.lane)).size,4);
    }
  }
});
test('Expert judges tighter and misses cost more energy',()=>{
  assert.equal(gradeTiming(.07,HARD_WINDOWS),'great');assert.equal(gradeTiming(.2,HARD_WINDOWS),null);
  const notes=Array.from({length:30},(_,i)=>({id:i,lane:0,time:i,type:'tap',duration:0,status:'pending'}));
  const hard=new Run(notes.map(n=>({...n})),'hard'),normal=new Run(notes.map(n=>({...n})),'normal');
  for(let i=0;i<10;i++){hard.judge(hard.notes[i],'miss');normal.judge(normal.notes[i],'miss');}
  assert.ok(hard.energy<normal.energy);assert.equal(hard.candidate(0,10.19),undefined);assert.ok(normal.candidate(0,10.19));
});
test('tap delay is caught up from taps, and stray taps move nothing',()=>{
  assert.equal(syncStep([.2,.2,.2]),0);
  assert.equal(syncStep(Array(8).fill(.01)),0);
  assert.equal(syncStep(Array(8).fill(.3)),.03);assert.equal(syncStep(Array(8).fill(-.3)),-.03);
  assert.equal(syncStep([.5,-.4,0,0,0,0,0,0,.01,-.01]),0);
  // A player on Bluetooth hears everything 220 ms late and taps on what they hear (give or take 30 ms).
  const delay=.22;let offset=0,samples=[],since=0,taps=0;
  for(;taps<200&&Math.abs(offset-delay)>.02;taps++){
    samples.push(delay-offset+(taps%5-2)*.015);if(samples.length>16)samples.shift();
    if(++since<4)continue;
    const step=syncStep(samples);if(!step)continue;
    const next=Math.max(SYNC_RANGE[0],Math.min(SYNC_RANGE[1],offset+step));samples=samples.map(e=>e-(next-offset));offset=next;since=0;
  }
  assert.ok(Math.abs(offset-delay)<=.02,'caught up to '+offset);assert.ok(taps<=60,'took '+taps+' taps');
});
test('learned tap delay moves scoring only; the sound delay set by hand moves the notes',()=>{
  const game=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),audio=readFileSync(new URL('../dist/audio.js',import.meta.url),'utf8');
  assert.match(game,/const t=tapTime\(\);learnSync\(lane,t\);const n=run\.candidate/);assert.match(game,/setTapDelay\(before\+step\)/);assert.doesNotMatch(game,/setSync\(before/);assert.match(game,/data-sync="-1"/);assert.match(audio,/-this\.offset-this\.startTime/);
});
test('every cheer reads in English and Chinese, and the stage has a place for it',async()=>{
  const {messages}=await import('../dist/i18n.js');
  const game=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const keys=[...new Set([...game.matchAll(/'(cheer[A-Z]\w+)'/g)].map(m=>m[1]))];
  assert.ok(keys.length>=10,'cheers found: '+keys.join());
  for(const lang of ['en','zh'])for(const key of [...keys,'comboCount','perfectStreak'])assert.ok(messages[lang][key],lang+' '+key);
  assert.match(html,/id="cheer"/);
});
