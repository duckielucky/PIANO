import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundtrack} from '../dist/audio.js';

test('recorded audio and notes use one clock, pause/resume and restart stop old sources',async()=>{
  const sources=[],audio=new Soundtrack();
  audio.master={};audio.tone=()=>{};
  audio.ctx={currentTime:40,state:'running',
    createBufferSource(){const source={connect(node){return node;},start(time){this.started=time;},stop(time){this.stopped=true;this.stoppedAt=time;}};sources.push(source);return source;},
    createGain(){const ramps=[];return {ramps,gain:{setValueAtTime(v,t){ramps.push([v,t]);},linearRampToValueAtTime(v,t){ramps.push([v,t]);}},connect(node){return node;}};},
    async suspend(){this.state='suspended';},async resume(){this.state='running';}};
  const track={bpm:120,buffer:{duration:20}};
  audio.start(track,3.6);
  assert.equal(sources[0].buffer,track.buffer);
  assert.equal(sources[0].started,audio.startTime);
  assert.ok(audio.time<-3.6);assert.equal(audio.timer,null);
  audio.ctx.currentTime=audio.startTime+2;assert.ok(Math.abs(audio.time-2)<1e-6);
  await audio.pause();assert.equal(audio.ctx.state,'suspended');
  await audio.resume();assert.equal(audio.ctx.state,'running');assert.ok(Math.abs(audio.time-2)<1e-6);
  audio.start(track,3.6);assert.equal(sources[0].stopped,true);assert.equal(sources.length,2);
  audio.stop();assert.equal(sources[1].stopped,true);assert.equal(audio.nodes.size,0);
  // A song longer than the round fades over its last seconds and stops at the limit; a shorter one plays out.
  audio.start(track,3.6,12,3);assert.equal(sources[2].stoppedAt,audio.startTime+12);
  audio.start(track,3.6,120,3);assert.equal(sources[3].stoppedAt,undefined);
});

test('a clock that moves in steps still gives smooth song time, and a tap counts from when it landed',()=>{
  const audio=new Soundtrack();audio.startTime=0;
  // The audio clock only moves every 20 ms, a little late, as on a phone.
  let page=1000;const step=.02;
  audio.ctx={state:'running',get currentTime(){return Math.floor((page/1000-1)/step)*step;}};
  const times=[];
  for(let i=0;i<60;i++){page=1000+i*7;times.push(audio.timeAt(page,page));}
  const gaps=times.slice(20).map((t,i)=>times[20+i+1]-t).filter(Number.isFinite);
  for(const gap of gaps)assert.ok(Math.abs(gap-.007)<.0015,'smooth: '+gap);
  // A tap that landed 12 ms before the page handled it counts 12 ms earlier.
  const now=page,handled=audio.timeAt(now,now),landed=audio.timeAt(now-12,now);
  assert.ok(Math.abs(handled-landed-.012)<1e-9);
  // Paused, the clock stands still and nothing runs on.
  audio.ctx.state='suspended';const frozen=audio.timeAt(page+500,page+500);assert.equal(frozen,audio.ctx.currentTime);
});
