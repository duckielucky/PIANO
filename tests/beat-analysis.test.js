import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePcm,makeAudioChart,beatMap,spectralFlux,ANALYSIS_VERSION} from '../dist/beat-analysis.js';
// Playable on a phone: lanes in range, nothing past the end, no lane reused within
// .18 s of its last note ending, at most two lanes at once (never on Chill), and
// notes cleared before the next one starts.
function assertPlayable(chart,analysis,difficulty){
  const times=[...new Set(chart.map(n=>n.time))];
  for(const n of chart){
    assert.ok(n.lane>=0&&n.lane<=3);assert.ok(n.time+n.duration<analysis.duration);
    const next=chart.find(b=>b!==n&&b.lane===n.lane&&b.time>=n.time);
    if(next)assert.ok(next.time-n.time-n.duration>=.18,'lane reused too soon at '+n.time);
  }
  for(const time of times){
    const together=chart.filter(n=>n.time===time);
    assert.ok(together.length<=(difficulty==='easy'?1:2),'too many lanes at '+time);
    const after=times.find(t=>t>time),end=Math.max(...together.map(n=>n.time+n.duration));
    if(after!==undefined)assert.ok(after-end>=.1,'no gap after '+time);
  }
}
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
    assertPlayable(chart,analysis,difficulty);
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

test('the chart rises and falls with the song: calm verse, busy chorus',()=>{
  // Verse: a soft kick on each beat over a held pad. Chorus: hard kick, snare on
  // 2 and 4, hi-hats on every eighth. Then the verse returns.
  const bpm=100,beat=60/bpm,duration=48,samples=new Float32Array(rate*duration);
  const hit=(time,freq,amp,decay)=>{for(let i=0;i<rate*.12;i++){const k=Math.round(time*rate)+i;if(k<samples.length)samples[k]+=amp*Math.sin(i/rate*2*Math.PI*freq)*Math.exp(-i/rate*decay);}};
  const chorus=t=>t>=16&&t<32;
  for(let i=0;i<samples.length;i++){const t=i/rate;if(!chorus(t))samples[i]+=.15*Math.sin(2*Math.PI*220*t);}
  for(let n=0,t=.5;t<duration-.5;n++,t=.5+n*beat){
    if(chorus(t)){hit(t,70,.9,30);if(n%2)hit(t,1800,.5,45);hit(t+beat/2,6000,.35,90);}
    else hit(t,70,.35,30);
  }
  const analysis=analyzePcm([samples],rate),map=beatMap(analysis);
  assert.ok(Math.abs(analysis.bpm-bpm)<=2,'tempo '+analysis.bpm);
  const levelAt=time=>map.levels[map.beats.reduce((best,b,k)=>Math.abs(b-time)<Math.abs(map.beats[best]-time)?k:best,0)];
  assert.ok(map.beats.filter(b=>b>18&&b<30).every(b=>levelAt(b)===2),'chorus reads as the peak');
  assert.ok(map.beats.filter(b=>b>3&&b<14).every(b=>levelAt(b)===0),'verse reads as calm');
  for(const difficulty of ['easy','normal','hard']){
    const chart=makeAudioChart(analysis,difficulty);assertPlayable(chart,analysis,difficulty);
    const rate=(from,to)=>new Set(chart.filter(n=>n.time>=from&&n.time<to).map(n=>n.time)).size/(to-from);
    assert.ok(rate(17,31)>=rate(2,15)*1.6,difficulty+' chorus busier than verse: '+rate(17,31).toFixed(2)+' vs '+rate(2,15).toFixed(2));
    const verseHolds=chart.filter(n=>n.type==='hold'&&!chorus(n.time)).length,chords=chart.length-new Set(chart.map(n=>n.time)).size;
    assert.ok(verseHolds>0,difficulty+' holds over the sustained verse');
    if(difficulty==='easy')assert.equal(chords,0);
    else{
      assert.ok(chords>0,difficulty+' has chords');
      assert.ok(chart.every(n=>chart.filter(m=>m.time===n.time).length<2||chorus(n.time)),'chords only in the chorus');
    }
    // Every note is on the beat, or on the half-beat hi-hat in the chorus.
    for(const n of chart){const off=((n.time-.5)/beat%.5+.5)%.5;assert.ok(Math.min(off,.5-off)*beat<.04,difficulty+' note off the grid at '+n.time.toFixed(2));}
  }
  // The verse holds one pitch, so lanes gather where the tune is, but every lane still gets used.
  const lanes=[0,1,2,3].map(l=>makeAudioChart(analysis,'hard').filter(n=>n.lane===l).length);
  assert.ok(Math.min(...lanes)>0,'all four lanes used: '+lanes);
});

test('a syncopated groove keeps its real tempo and the beat lands on the snare and kick',()=>{
  // 136 BPM trap-style bar: kick on 1, the "and" of 2 and 3, snare on 2 and 4,
  // hi-hats on every eighth with a quick triplet roll. Easy to misread at 2/3 speed.
  const bpm=136,beat=60/bpm,duration=40,samples=new Float32Array(rate*duration);
  const hit=(time,freq,amp,decay)=>{for(let i=0;i<rate*.12;i++){const k=Math.round(time*rate)+i;if(k<samples.length)samples[k]+=amp*Math.sin(i/rate*2*Math.PI*freq)*Math.exp(-i/rate*decay);}};
  const onBeat=[];
  for(let bar=0,t=.5;t<duration-2;bar++,t=.5+bar*4*beat){
    for(let b=0;b<4;b++)onBeat.push(t+b*beat);
    for(const k of [0,1.5,2])hit(t+k*beat,60,.9,25);
    for(const s of [1,3])hit(t+s*beat,1900,.6,40);
    for(let e=0;e<8;e++)hit(t+e*beat/2,7000,.18,110);
    if(bar%2)for(let r=0;r<3;r++)hit(t+3.5*beat+r*beat/6,7000,.15,110);
  }
  const analysis=analyzePcm([samples],rate);
  assert.ok(Math.abs(analysis.bpm-bpm)<=2,'tempo '+analysis.bpm);
  assert.equal(analysis.version,ANALYSIS_VERSION);
  const beats=analysis.beats.filter(b=>b>2&&b<duration-3);
  const onGrid=beats.filter(b=>onBeat.some(t=>Math.abs(t-b)<.04)).length/beats.length;
  assert.ok(onGrid>=.95,'beats on the groove: '+onGrid.toFixed(2));
});

test('lanes follow the tune: higher notes to the right, lower to the left, repeats stay',()=>{
  // A piano-like tune in C major over a kick, one note per beat.
  const bpm=100,beat=60/bpm,tune=[60,64,67,72,67,64,62,62,65,69,72,69,67,64,60,60,64,67,71,74,72,67,64,60];
  const duration=4*tune.length*beat/2+2,samples=new Float32Array(rate*duration),played=[];
  for(let n=0;n*beat<duration-1.5;n++){
    const t=.5+n*beat,note=tune[n%tune.length],f=440*Math.pow(2,(note-69)/12);played.push({time:t,note});
    for(let i=0;i<rate*beat*.9;i++){const k=Math.round(t*rate)+i,x=i/rate;if(k>=samples.length)break;
      let tone=0;for(let h=1;h<=5;h++)tone+=Math.sin(2*Math.PI*f*h*x)/h;
      samples[k]+=.25*tone*Math.exp(-x*3)+(x<.12?.6*Math.sin(2*Math.PI*60*x)*Math.exp(-x*30):0);}
  }
  const analysis=analyzePcm([samples],rate);
  assert.equal(analysis.key.name+' '+analysis.key.mode,'C major');
  const sung=analysis.events.filter(e=>e.pitch!==null);
  assert.ok(sung.length>=played.length*.9,'notes with a pitch: '+sung.length+' of '+played.length);
  const right=sung.filter(e=>{const p=played.find(p=>Math.abs(p.time-e.time)<.05);return p&&Math.abs(p.note-e.pitch)<=.5;}).length;
  assert.ok(right>=sung.length*.9,'pitches heard right: '+right+' of '+sung.length);
  for(const difficulty of ['easy','normal','hard']){
    const chart=makeAudioChart(analysis,difficulty);assertPlayable(chart,analysis,difficulty);
    const single=chart.filter(n=>chart.filter(m=>m.time===n.time).length===1);
    let agree=0,pairs=0;
    for(let i=1;i<single.length;i++){
      const a=played.find(p=>Math.abs(p.time-single[i-1].time)<.05),b=played.find(p=>Math.abs(p.time-single[i].time)<.05);
      if(!a||!b||single[i].time-single[i-1].time>2*beat)continue;
      // At the edge of the keys a further step up (or down) has nowhere to go, so staying there counts.
      const move=Math.sign(single[i].lane-single[i-1].lane),edge=b.note>a.note?single[i-1].lane===3:b.note<a.note&&single[i-1].lane===0;
      pairs++;if(Math.sign(b.note-a.note)===move||edge&&move===0)agree++;
    }
    assert.ok(pairs>8&&agree>=pairs*.85,difficulty+' lanes move with the tune: '+agree+' of '+pairs);
    assert.ok(new Set(chart.map(n=>n.lane)).size===4,difficulty+' uses every lane');
  }
});
test('stereo shares one FFT but each channel is still heard on its own',()=>{
  const rate=11025,x=new Float32Array(rate*4);
  for(let i=0;i<x.length;i++){const t=i/rate,beat=t%.5;x[i]=Math.sin(2*Math.PI*220*t)*.2+(beat<.05?Math.sin(2*Math.PI*90*t)*(1-beat/.05):0)*.8+Math.sin(i*12.9898)*.01;}
  const mono=spectralFlux([x],rate),same=spectralFlux([x,x],rate),opposite=spectralFlux([x,x.map(v=>-v)],rate);
  const right=x.map((v,i)=>i%rate<rate/2?v:0),mixed=spectralFlux([x,right],rate);
  for(let i=0;i<mono.length;i++){assert.ok(Math.abs(mono[i]-same[i])<1e-6);assert.ok(Math.abs(mono[i]-opposite[i])<1e-6);}
  assert.ok(mixed.some((v,i)=>Math.abs(v-mono[i])>1e-3),'a different right channel changes the pulse');
});
