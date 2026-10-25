import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePcm,makeAudioChart} from '../dist/beat-analysis.js';
const rate=11025;
function drumTrack(times,duration=24){
  const samples=new Float32Array(rate*duration);
  for(const time of times)for(let i=0;i<rate*.12;i++){
    const index=Math.round(time*rate)+i;
    if(index<samples.length)samples[index]+=.8*Math.sin(i/rate*2*Math.PI*120)*Math.exp(-i/rate*40);
  }
  return samples;
}
const regular=(bpm,end=23.5)=>Array.from({length:Math.floor((end-.3)/(60/bpm))+1},(_,i)=>.3+i*60/bpm);
test('detected beats match known audio attacks and estimate regular tempos',()=>{
  for(const bpm of [80,100,120,150]){
    const times=regular(bpm),analysis=analyzePcm([drumTrack(times)],rate);
    assert.ok(Math.abs(analysis.bpm-bpm)<=2);
    assert.equal(analysis.events.length,times.length);
    analysis.events.forEach((event,i)=>assert.ok(Math.abs(event.time-times[i])<.025));
    assert.equal(analysis.weakBeat,false);
  }
});
test('tempo changes and silent breaks retain actual attack timing',()=>{
  const times=[...regular(100,7),...regular(150,8).map(t=>t+13)];
  const analysis=analyzePcm([drumTrack(times)],rate);
  assert.equal(analysis.events.length,times.length);
  for(const event of analysis.events)assert.ok(times.some(time=>Math.abs(time-event.time)<.025));
  for(const difficulty of ['easy','normal','hard']){
    for(const note of makeAudioChart(analysis,difficulty))assert.ok(times.some(time=>Math.abs(time-note.time)<.025));
  }
});
test('opposite-phase stereo does not cancel detected beats',()=>{
  const mono=drumTrack(regular(120)),inverted=mono.map(x=>-x);
  const a=analyzePcm([mono],rate),b=analyzePcm([mono,inverted],rate);
  assert.equal(a.bpm,b.bpm);assert.equal(a.events.length,b.events.length);
  a.events.forEach((event,i)=>assert.equal(event.time,b.events[i].time));
});
test('silence rejects and sustained beatless audio uses an audible-only fallback',()=>{
  assert.throws(()=>analyzePcm([new Float32Array(rate*10)],rate),/silentSong/);
  const samples=new Float32Array(rate*12);
  for(let i=0;i<rate*5;i++)samples[i]=.3*Math.sin(2*Math.PI*220*i/rate);
  for(let i=rate*8;i<samples.length;i++)samples[i]=.3*Math.sin(2*Math.PI*220*i/rate);
  const a=analyzePcm([samples],rate);
  assert.equal(a.weakBeat,true);assert.ok(a.events.length>10);
  assert.ok(a.events.every(event=>event.time<5||event.time>=8));
  assert.ok(makeAudioChart(a).length>0);
});
test('chart difficulty stays playable and restart returns fresh notes',()=>{
  const analysis={bpm:120,duration:20,events:Array.from({length:79},(_,i)=>({time:.2+i*.25,band:i%3,strength:1,sustain:.7}))};
  let previous=0;
  for(const difficulty of ['easy','normal','hard']){
    const chart=makeAudioChart(analysis,difficulty);
    assert.ok(chart.length>=previous);previous=chart.length;
    for(let i=0;i<chart.length;i++){
      const n=chart[i];assert.ok(n.lane>=0&&n.lane<=3);
      assert.ok(n.time+n.duration<analysis.duration);
      if(i+1<chart.length)assert.ok(chart[i+1].time-n.time-n.duration>=.18);
    }
    const again=makeAudioChart(analysis,difficulty);assert.deepEqual(chart,again);
    chart[0].status='hit';assert.equal(again[0].status,'pending');
  }
  assert.ok(makeAudioChart(analysis,'easy').some(n=>n.type==='hold'));
});

test('notes follow the beat, not every sound in the song',()=>{
  // A 100 BPM groove: a kick on every beat, a hi-hat between beats, and a
  // singer whose syllables land anywhere. Notes belong on the kicks.
  const bpm=100,beat=60/bpm,duration=30,samples=new Float32Array(rate*duration);
  const hit=(time,freq,amp,decay)=>{for(let i=0;i<rate*.12;i++){const k=Math.round(time*rate)+i;if(k<samples.length)samples[k]+=amp*Math.sin(i/rate*2*Math.PI*freq)*Math.exp(-i/rate*decay);}};
  const kicks=[];for(let t=.5;t<duration-.5;t+=beat){kicks.push(t);hit(t,90,.8,30);hit(t+beat/2,5200,.18,90);}
  let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let t=.7;t<duration-.5;t+=.23+rand()*.4)hit(t,700+rand()*500,.25,25);
  const analysis=analyzePcm([samples],rate);
  assert.ok(Math.abs(analysis.bpm-bpm)<=2,'tempo '+analysis.bpm);
  for(const difficulty of ['easy','normal']){
    const chart=makeAudioChart(analysis,difficulty);
    assert.ok(chart.length>(difficulty==='easy'?60:120)*.8*(duration-1)/60/ (difficulty==='easy'?1.2:1.2),difficulty+' has notes: '+chart.length);
    const onBeat=chart.filter(n=>kicks.some(k=>Math.abs(k-n.time)<.035)).length/chart.length;
    assert.ok(onBeat>=.95,difficulty+' notes on the beat: '+onBeat.toFixed(2));
  }
});
