import { TRACKS, WINDOWS, makeChart, gradeTiming, gradeAccuracy, Run } from './engine.js';
import { Soundtrack } from './audio.js';

const $ = s => document.querySelector(s);
const canvas=$('#canvas'), ctx=canvas.getContext('2d'), stage=$('#stage'), modal=$('#modal');
const audio = new Soundtrack();
let track = TRACKS[1], difficulty='easy', mode='menu', run=null;
let width=390,height=550,dpr=1, lastFrame=0, flashes=[0,0,0,0], particles=[], ripples=[], pointers=new Map(), keys=new Set();
let dialogType='', session=0;
let lastScore=-1,lastCombo=-1,lastEnergy=-1, visualTime=0, lastCountdown=null;
function setMode(next){mode=next;document.body.dataset.state=next;}
function pop(element){if(!reducedMotion)element.animate([{transform:'scale(1.13)'},{transform:'scale(1)'}],{duration:200,easing:'ease-out'});}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const travel=()=>difficulty==='hard'?2.2:difficulty==='easy'?3.25:2.75;
const duration=()=>track.bars*4*60/track.bpm;
const bestKey=()=>`neon-rush-tap-hold-best-${track.id}-${difficulty}`;
function readBest(){try{return Number(localStorage.getItem(bestKey()))||0;}catch{return 0;}}
function saveBest(score){try{localStorage.setItem(bestKey(),String(score));}catch{}}
const format=n=>Math.round(n).toString().padStart(7,'0');
function setTrack(next){
  track=next;$('#trackName').textContent=track.title;$('#bpmLabel').textContent=track.bpm+' BPM';
  const sec=Math.round(duration());$('#trackDetail').textContent=`${track.bpm} BPM · ${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  $('#best').textContent=format(readBest());
}
function setDifficulty(value){difficulty=value;$('#energyLabel').textContent=value==='easy'?'NO FAIL':'ENERGY';$('#modeHint').textContent=value==='easy'?'NO FAIL':'TAP + HOLD';$('#difficultyLabel').textContent=({easy:'CHILL',normal:'NORMAL',hard:'EXPERT'})[value];document.querySelectorAll('[data-difficulty]').forEach(b=>{const active=b.dataset.difficulty===value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('#best').textContent=format(readBest());}
function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(stage);

// Perspective projection. All geometry is normalized to the portrait stage.
function project(f,lane=.5){const p=Math.pow(Math.max(0,f),1.65), span=width*(.28+.66*p);return {x:width/2+(lane-.5)*span,y:height*(.025+.79*p),span,p};}
function polygon(points,fill,stroke,line=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
function line(a,b,color,size=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=size;ctx.stroke();}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function highway(t){
  ctx.clearRect(0,0,width,height);
  const ambience=ctx.createRadialGradient(width/2,height*.12,0,width/2,height*.3,width*.8);ambience.addColorStop(0,'#30204466');ambience.addColorStop(.55,'#12142455');ambience.addColorStop(1,'#0b0d18');ctx.fillStyle=ambience;ctx.fillRect(0,0,width,height);
  if(!reducedMotion){
    for(let i=0;i<18;i++){
      const x=((i*71+Math.sin(visualTime*.25+i)*12)%width+width)%width;
      const y=((i*41-visualTime*(5+i%3))%height+height)%height;
      ctx.globalAlpha=.12+.1*Math.sin(visualTime+i);ctx.fillStyle=i%3?'#65edfa':'#c5ff69';ctx.fillRect(x,y,i%4===0?2:1,2);
    }
    ctx.globalAlpha=1;
  }
  // Thin outer architecture adds depth without competing with the notes.
  for(let i=0;i<5;i++){const a=project(0,-.2-i*.22),b=project(1.4,-.2-i*.22);line(a,b,'#48335926');line({x:width-a.x,y:a.y},{x:width-b.x,y:b.y},'#48335926');}
  const surface=ctx.createLinearGradient(0,0,0,height);surface.addColorStop(0,'#111322');surface.addColorStop(.65,'#111520');surface.addColorStop(1,'#121b29');polygon([project(0,0),project(0,1),project(1.14,1),project(1.14,0)],surface);
  for(let lane=0;lane<4;lane++){
    if(lane%2===0)polygon([project(0,lane/4),project(0,(lane+1)/4),project(1.14,(lane+1)/4),project(1.14,lane/4)],'#ffffff02');
    if(flashes[lane]>0){const g=ctx.createLinearGradient(0,height*.35,0,height*.87);g.addColorStop(0,'#65edfa00');g.addColorStop(1,`rgba(101,237,250,${flashes[lane]*.22})`);polygon([project(.1,lane/4),project(.1,(lane+1)/4),project(1.08,(lane+1)/4),project(1.08,lane/4)],g);}
  }
  const bt=60/track.bpm;
  for(let i=0;i<12;i++){
    const f=((i/12+(t/bt*.045))%1+1)%1;
    line(project(f,0),project(f,1),`rgba(96,108,149,${.035+f*.065})`);
  }
  for(let lane=0;lane<=4;lane++)line(project(0,lane/4),project(1.12,lane/4),lane===0||lane===4?'#9577d95a':'#6e7eab30',lane===0||lane===4?1.4:1);
  const beatPulse=reducedMotion?0:(1+Math.cos(t/bt*Math.PI*2))*.5;
  ctx.shadowColor='#6eefff';ctx.shadowBlur=10+beatPulse*7;line(project(1,0),project(1,1),'#76e9f299',1.5);ctx.shadowBlur=0;
  for(let lane=0;lane<4;lane++){
    const a=project(1.025,(lane+.06)/4),b=project(1.025,(lane+.94)/4),bw=b.x-a.x;
    const active=mode==='playing'&&isLaneDown(lane);
    const g=ctx.createLinearGradient(0,a.y,0,a.y+height*.07);g.addColorStop(0,active?'#65edfa66':flashes[lane]>.1?'#54b9cc55':'#1a304144');g.addColorStop(1,'#101724');
    roundRect(a.x,a.y,bw,height*.075,7,g,active||flashes[lane]>.1?'#88f4ff':'#42527480');
    roundRect(a.x+10,a.y+3,bw-20,2,1,'#65edfa44');
  }
  const fog=ctx.createLinearGradient(0,0,0,height*.22);fog.addColorStop(0,'#0b0d18');fog.addColorStop(1,'#0b0d1800');ctx.fillStyle=fog;ctx.fillRect(0,0,width,height*.22);
}
function noteBlock(note,f,holding=false){
  if(f<0||f>1.16)return;
  const p=project(f,(note.lane+.5)/4), nw=p.span/4*.79, nh=Math.max(4,13*(.3+.7*p.p));
  const green=note.type!=='tap', color=green?'#c5ff69':'#65edfa';
  if(note.type==='hold'){
    const tailF=Math.max(0,f-note.duration/travel());const tail=project(tailF,(note.lane+.5)/4),tw=tail.span/4*.37;
    const g=ctx.createLinearGradient(0,tail.y,0,p.y);g.addColorStop(0,'#c5ff6925');g.addColorStop(1,holding?'#c5ff69bb':'#c5ff6955');
    polygon([{x:tail.x-tw/2,y:tail.y},{x:tail.x+tw/2,y:tail.y},{x:p.x+nw*.25,y:p.y},{x:p.x-nw*.25,y:p.y}],g,'#c5ff6955');
    line({x:tail.x,y:tail.y},{x:p.x,y:p.y},'#d8ff9aaa',1.5);roundRect(tail.x-tw/2,tail.y-2,tw,3,1,color);
    if(holding){
      if(!reducedMotion){
        for(let i=0;i<3;i++){
          const phase=(visualTime*2+i/3)%1;
          ctx.shadowColor=color;ctx.shadowBlur=8;
          ctx.fillStyle='#efffd1';ctx.fillRect(p.x-2,tail.y+(p.y-tail.y)*phase,4,4);
        }
      }
      ctx.shadowBlur=0;ctx.lineWidth=2.5;ctx.strokeStyle='#c5ff6933';
      ctx.beginPath();ctx.ellipse(p.x,p.y,nw*.64,nh*1.8,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#d8ff99';ctx.shadowColor=color;ctx.shadowBlur=reducedMotion?0:10;
      ctx.beginPath();ctx.ellipse(p.x,p.y,nw*.64,nh*1.8,0,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.01,note.progress||0));ctx.stroke();ctx.shadowBlur=0;
    }
  }
  ctx.shadowBlur=(mode==='menu'?10:16)*p.p;ctx.shadowColor=color;
  const face=ctx.createLinearGradient(0,p.y-nh,0,p.y+nh);face.addColorStop(0,green?'#e3ffad':'#b7ffff');face.addColorStop(.25,color);face.addColorStop(.6,green?'#8dcc36':'#259cb8');face.addColorStop(1,green?'#c5ff69':'#71edfa');
  polygon([{x:p.x-nw*.45,y:p.y-nh/2},{x:p.x+nw*.45,y:p.y-nh/2},{x:p.x+nw/2,y:p.y+nh/2},{x:p.x-nw/2,y:p.y+nh/2}],face,color);
  ctx.shadowBlur=0;line({x:p.x-nw*.38,y:p.y-nh*.18},{x:p.x+nw*.38,y:p.y-nh*.18},'#ffffffa0',1);

}
function burst(lane,color='#65edfa'){
  flashes[lane]=1;const p=project(1,(lane+.5)/4);
  if(reducedMotion)return;
  ripples.push({lane,life:.45,color});
  for(let i=0;i<20;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*140,vy:-Math.random()*160-30,life:.45+Math.random()*.2,color});
}
function announce(result,lane){
  const el=$('#judgment');el.textContent=result==='perfect'?'PERFECT':result==='great'?'GREAT':result==='good'?'GOOD':'MISS';
  el.style.color=({perfect:'#c5ff69',great:'#65edfa',good:'#b6a1ff',miss:'#ff7b9f'})[result];
  el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  if(result!=='miss')burst(lane,result==='perfect'?'#c5ff69':'#65edfa');
}
function judge(note,result,error){if(run.judge(note,result,error))announce(result,note.lane);updateHUD();}
function updateHUD(){
  if(!run)return;
  if(lastScore!==run.score){$('#score').textContent=format(run.score);if(run.score>lastScore&&lastScore>=0)pop($('#score'));lastScore=run.score;}
  if(lastCombo!==run.combo){$('#combo').textContent=run.combo;$('#comboBox').classList.toggle('visible',run.combo>=3);if(run.combo>=3)pop($('#combo'));lastCombo=run.combo;}
  const e=Math.round(run.energy);if(e!==lastEnergy){$('#energyFill').style.width=e+'%';$('#energyFill').style.background=e<25?'#ff7b9f':'#c5ff69';$('#energyText').textContent=e+'%';lastEnergy=e;}
}
async function start(){
  const token=++session; closeModal();$('#playButton').disabled=true;
  try{await audio.unlock();}catch(e){$('#playButton').disabled=false;showError('Audio could not start. Tap play again to enable your browser’s audio.');return;}
  if(token!==session)return;
  run=new Run(makeChart(track,difficulty),difficulty);lastScore=lastCombo=lastEnergy=-1;keys.clear();pointers.clear();particles=[];ripples=[];lastCountdown=null;
  audio.start(track);setMode('countdown');$('#menu').hidden=true;$('#pauseButton').disabled=false;$('#nextTrack').hidden=true;$('#trackButton').disabled=true;$('#playingBars').hidden=false;$('#countdown').hidden=false;$('#playButton').disabled=false;$('#songProgress').style.width='0%';updateHUD();
}
function showError(message){dialogType='error';$('#modalContent').innerHTML=`<div class="eyebrow">LET’S TRY THAT AGAIN</div><h2>ONE MORE BEAT.</h2><p>${message}</p><button class="primary-button" data-action="close">GOT IT</button>`;modal.showModal();}
function isLaneDown(lane){return keys.has(lane)||[...pointers.values()].some(p=>p.lane===lane);}
function press(lane){
  if(mode!=='playing')return;
  flashes[lane]=.7;const t=audio.time,n=run.candidate(lane,t);if(!n)return;
  const rating=gradeTiming(t-n.time);
  if(n.type==='hold'){n.status='holding';n.holdGrade=rating;n.error=t-n.time;burst(lane,'#c5ff69');}
  else judge(n,rating,t-n.time);
}
function release(lane){
  if(mode!=='playing'||isLaneDown(lane))return;
  const n=run.notes.find(n=>n.lane===lane&&n.status==='holding');
  if(n)judge(n,audio.time>=n.time+n.duration-.22?n.holdGrade:'miss',n.error);
}
$('#laneInputs').addEventListener('pointerdown',e=>{
  const button=e.target.closest('[data-lane]');if(!button||mode!=='playing')return;e.preventDefault();
  const lane=Number(button.dataset.lane);button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{lane});press(lane);
});
function pointerEnd(e){const p=pointers.get(e.pointerId);if(p){pointers.delete(e.pointerId);release(p.lane);}}
$('#laneInputs').addEventListener('pointerup',pointerEnd);$('#laneInputs').addEventListener('pointercancel',pointerEnd);$('#laneInputs').addEventListener('lostpointercapture',pointerEnd);
const keyLanes={KeyD:0,KeyF:1,KeyJ:2,KeyK:3};
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();if(mode==='playing'||mode==='countdown')pause();else if(mode==='paused')resume();return;}
  if(e.code==='Space'&&!modal.open){e.preventDefault();if(mode==='menu'||mode==='results')start();return;}
  if(e.code in keyLanes){e.preventDefault();if(e.repeat)return;const l=keyLanes[e.code];keys.add(l);press(l);}

});
window.addEventListener('keyup',e=>{if(e.code in keyLanes){const l=keyLanes[e.code];keys.delete(l);release(l);}});
async function pause(){
  if(mode!=='playing'&&mode!=='countdown')return;
  setMode('paused');keys.clear();pointers.clear();$('#countdown').hidden=true;$('#playingBars').classList.add('paused-bars');await audio.pause();
  dialogType='pause';$('#modalContent').innerHTML='<h2><em>PAUSED.</em></h2><button class="primary-button" data-action="resume">RESUME <span>▶</span></button><button class="secondary-button" data-action="restart">RESTART</button><button class="secondary-button" data-action="home">MENU</button>';if(!modal.open)modal.showModal();
}
async function resume(){
  if(mode!=='paused')return;
  // A short grace period lets touch players reacquire any in-progress holds.
  run.notes.filter(n=>n.status==='holding').forEach(n=>n.resumeGrace=audio.time+.5);
  try{await audio.resume();}catch{return;}
  closeModal();setMode(audio.time<0?'countdown':'playing');$('#playingBars').classList.remove('paused-bars');
}
function goHome(){
  session++;audio.stop();closeModal();setMode('menu');run=null;keys.clear();pointers.clear();$('#menu').hidden=false;$('#countdown').hidden=true;$('#comboBox').classList.remove('visible');$('#judgment').classList.remove('show');$('#pauseButton').disabled=true;$('#nextTrack').hidden=false;$('#trackButton').disabled=false;$('#playingBars').hidden=true;$('#playingBars').classList.remove('paused-bars');$('#score').textContent='0000000';$('#energyFill').style.width='100%';$('#energyFill').style.background='#c5ff69';$('#judgment').textContent='';$('#energyText').textContent='100%';$('#songProgress').style.width='0%';$('#best').textContent=format(readBest());
}
function finish(reason='complete'){
  if(mode==='results')return;setMode('results');audio.stop();$('#pauseButton').disabled=true;$('#playingBars').hidden=true;$('#comboBox').classList.remove('visible');
  const prev=readBest(),newBest=run.score>prev;if(newBest)saveBest(run.score);$('#best').textContent=format(readBest());
  const accuracy=run.accuracy,grade=gradeAccuracy(accuracy);dialogType='results';
  $('#modalContent').innerHTML=`<div class="eyebrow">${reason==='complete'?'TRACK COMPLETE':'OUT OF ENERGY'}</div><h2>${reason==='complete'?'NICE FLOW.':'ONE MORE TRY?'}</h2><div class="result-grade">${grade}</div><div class="result-score">${format(run.score)}</div><div class="result-best">${newBest?'↗ NEW PERSONAL BEST':track.title.toUpperCase()}</div><div class="result-stats"><div><strong>${accuracy.toFixed(1)}%</strong><span>ACCURACY</span></div><div><strong>${run.maxCombo}</strong><span>MAX COMBO</span></div></div><div class="result-breakdown"><span>${run.counts.perfect} PERFECT</span><span>${run.counts.great+run.counts.good} GOOD / GREAT</span><span>${run.counts.miss} MISS</span></div><button class="primary-button" data-action="restart">PLAY AGAIN <span>↗</span></button><button class="secondary-button" data-action="home">TRACKS</button>`;
  if(!modal.open)modal.showModal();
}
function closeModal(){if(modal.open)modal.close();dialogType='';}
function help(){
  dialogType='help';$('#modalContent').innerHTML='<h2>TAP <em>+ HOLD</em></h2><div class="tutorial-row"><div class="note-demo"><span class="note-icon tap"></span></div><div><strong>TAP</strong><p>Hit blue notes at the line.</p></div></div><div class="tutorial-row"><div class="note-demo"><span class="note-icon hold"></span></div><div><strong>HOLD</strong><p>Hold green notes until the tail arrives.</p></div></div><p class="key-hint"><b>D F J K</b> · <b>Esc</b> to pause</p><button class="primary-button" data-action="close">GOT IT</button>';modal.showModal();
}
function trackMenu(){
  if(mode!=='menu')return;dialogType='tracks';$('#modalContent').innerHTML='<h2><em>TRACKS.</em></h2>'+TRACKS.map(t=>`<button class="track-choice ${t===track?'selected':''}" data-track="${t.id}"><strong>${t.title} ${t===track?'↗':''}</strong><span>${t.bpm} BPM</span></button>`).join('')+'<button class="primary-button" data-action="close">DONE <span>↗</span></button>';modal.showModal();
}
$('#modalContent').addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='close')closeModal();if(action==='resume')resume();if(action==='restart')start();if(action==='home')goHome();
  const id=e.target.closest('[data-track]')?.dataset.track;if(id){setTrack(TRACKS.find(t=>t.id===id));closeModal();}
});
modal.addEventListener('cancel',e=>{e.preventDefault();if(dialogType==='pause')resume();else if(dialogType==='results')goHome();else closeModal();});
$('#playButton').addEventListener('click',start);$('#pauseButton').addEventListener('click',pause);$('#helpButton').addEventListener('click',help);$('#trackButton').addEventListener('click',trackMenu);$('#nextTrack').addEventListener('click',()=>setTrack(TRACKS[(TRACKS.indexOf(track)+1)%TRACKS.length]));
document.querySelectorAll('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>setDifficulty(b.dataset.difficulty)));
$('#soundButton').addEventListener('click',()=>{audio.setMuted(!audio.muted);$('#soundButton').setAttribute('aria-label',audio.muted?'Unmute sound':'Mute sound');$('#soundButton').title=audio.muted?'Unmute sound':'Mute sound';$('#soundButton').style.color=audio.muted?'#ff7b9f':'';$('#soundButton').innerHTML=audio.muted?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6M22 9l-6 6"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';});
$('#fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>{if(mode==='playing'||mode==='countdown')pause();});

function frame(now){
  const dt=mode==='paused'?0:Math.min(.05,(now-lastFrame)/1000||.016);lastFrame=now;visualTime+=dt;
  const playing=mode==='playing'||mode==='countdown',t=playing||mode==='paused'?audio.time:now/1000;
  highway(t);
  if(mode==='menu'){
    // A slow-moving preview gives the menu the same spatial feel as gameplay.
    for(let i=0;i<7;i++){
      const f=((i*.153+(reducedMotion?0:visualTime*.09))%.96);
      const n={lane:[0,3,1,2,0,2,3,1,2][i],type:i===2||i===7?'hold':'tap',duration:.5};noteBlock(n,f);
    }
  }else if(run){
    if(playing){
      if(t<0){const count=Math.min(3,Math.ceil(-t/(60/track.bpm)));$('#countdown').hidden=false;if(count!==lastCountdown){lastCountdown=count;$('#countdown').textContent=count;pop($('#countdown'));}}
      else if(mode==='countdown'){setMode('playing');$('#countdown').hidden=true;}
      for(const n of run.notes){
        if(n.status==='pending'&&t>n.time+WINDOWS.miss)judge(n,'miss');
        if(n.status==='holding'){
          flashes[n.lane]=reducedMotion?.6:.65+Math.sin(visualTime*8)*.12;
          if(t>=n.time+n.duration-.035)judge(n,n.holdGrade,n.error);
          else if(!isLaneDown(n.lane)&&t>(n.resumeGrace||0))judge(n,'miss');
        }
      }
      $('#songProgress').style.width=Math.max(0,Math.min(100,t/duration()*100))+'%';
      if(run.failed)finish('energy');else if(t>=duration()+.3)finish();
    }
    // Draw distant notes first, near notes last, including hold tails.
    for(let i=run.notes.length-1;i>=0;i--){const n=run.notes[i];if(n.status==='hit'||n.status==='miss')continue;const f=1-(n.time-t)/travel();if(n.status==='holding'){const remaining=n.time+n.duration-t;noteBlock({...n,duration:Math.max(0,remaining),progress:1-remaining/n.duration},1,true);}else noteBlock(n,f);}
  }
  for(let i=0;i<4;i++)flashes[i]=Math.max(0,flashes[i]-dt*3.2);
  ripples=ripples.filter(r=>r.life>0);
  for(const r of ripples){
    r.life-=dt;const p=project(1,(r.lane+.5)/4),progress=1-r.life/.45;
    ctx.globalAlpha=Math.max(0,r.life/.45);ctx.strokeStyle=r.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(p.x,p.y,9+progress*p.span*.18,3+progress*16,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.globalAlpha=1;
  particles=particles.filter(p=>p.life>0);for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;ctx.globalAlpha=Math.min(1,p.life*3);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2,2);}ctx.globalAlpha=1;
  requestAnimationFrame(frame);
}
setTrack(track);setDifficulty(difficulty);resize();requestAnimationFrame(frame);
