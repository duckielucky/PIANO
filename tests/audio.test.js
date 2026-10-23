import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundtrack} from '../dist/audio.js';

test('uploaded audio and notes use one clock, pause/resume and restart stop old sources',async()=>{
  const sources=[],audio=new Soundtrack();
  audio.master={};audio.tone=()=>{};
  audio.ctx={currentTime:40,state:'running',
    createBufferSource(){const source={connect(){},start(time){this.started=time;},stop(){this.stopped=true;}};sources.push(source);return source;},
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
});
