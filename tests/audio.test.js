import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundtrack} from '../dist/audio.js';

test('uploaded audio and notes use one clock, pause/resume and restart stop old sources',async()=>{
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
  audio.ctx.currentTime=audio.startTime+2;assert.equal(audio.time,2);
  await audio.pause();assert.equal(audio.ctx.state,'suspended');
  await audio.resume();assert.equal(audio.ctx.state,'running');assert.equal(audio.time,2);
  audio.start(track,3.6);assert.equal(sources[0].stopped,true);assert.equal(sources.length,2);
  audio.stop();assert.equal(sources[1].stopped,true);assert.equal(audio.nodes.size,0);
  // A song longer than the round fades over its last seconds and stops at the limit; a shorter one plays out.
  audio.start(track,3.6,12,3);assert.equal(sources[2].stoppedAt,audio.startTime+12);
  audio.start(track,3.6,120,3);assert.equal(sources[3].stoppedAt,undefined);
});
