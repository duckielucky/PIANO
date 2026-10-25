import { TRACKS, WINDOWS, makeChart, gradeTiming, gradeAccuracy, Run } from './engine.js?v=e79a57a318';
import { Soundtrack } from './audio.js?v=71ed956385';
import { makeAudioChart } from './beat-analysis.js?v=3ab60c8f1e';
import { importSong } from './song-import.js?v=bf9abbbf96';
import { chooseLanguage, translate } from './i18n.js?v=1de5887422';

const $ = s => document.querySelector(s);
const canvas=$('#canvas'), ctx=canvas.getContext('2d'), stage=$('#stage'), modal=$('#modal');
const audio = new Soundtrack();
let savedLanguage;
try { savedLanguage=localStorage.getItem('vipermix-language'); } catch {}
let language=chooseLanguage(savedLanguage,navigator.language), lastResult=null;
const t=(key,values)=>translate(language,key,values);
const trackTitle=track=>track.uploaded?track.title:t('track_'+track.id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let uploadedTrack=null, importController=null;
let uploadState={status:'idle',fileName:'',progress:null};
const availableTracks=()=>uploadedTrack?[uploadedTrack,...TRACKS]:TRACKS;
const clockText=seconds=>{const total=Math.round(seconds);return `${Math.floor(total/60).toString().padStart(2,'0')}:${(total%60).toString().padStart(2,'0')}`;};
function chooseFile(){
  if(mode!=='menu')return;
  $('#songFile').value='';$('#songFile').click();
}
async function loadSong(file){
  if(!file||mode!=='menu')return;
  importController?.abort();const controller=new AbortController();importController=controller;
  uploadState={status:'decoding',fileName:file.name,progress:null};showDialog('import');
  try{
    const imported=await importSong(file,audio,controller.signal,(status,progress)=>{
      if(importController!==controller||controller.signal.aborted)return;
      uploadState={...uploadState,status,progress};if(dialogType==='import'&&modal.open)renderDialog();
    });
    if(controller.signal.aborted||importController!==controller)return;
    if(!makeAudioChart(imported.analysis,'easy').length)throw new Error('analysisError');
    uploadedTrack=imported;setTrack(imported);
    uploadState={status:'ready',fileName:imported.title,progress:100};
    importController=null;showDialog('difficulty');
  }catch(error){
    if(controller.signal.aborted||importController!==controller)return;
    const known=['decodeError','fileTooLarge','songTooLong','songTooShort','silentSong','analysisError'];
    uploadState={status:'error',fileName:file.name,error:known.includes(error.message)?error.message:'analysisError'};
    renderDialog();
  }finally{if(importController===controller)importController=null;}
}
function importContent(){
  const {status,fileName,progress}=uploadState;
  const name=`<p class="import-filename">${escapeHtml(fileName)}</p>`;
  if(status==='error')return `<h2>${t('importFailed')}</h2>${name}<p class="import-error" role="alert">${t(uploadState.error)}</p><button class="primary-button" data-action="choose-file">${t('changeSong')}</button><button class="secondary-button" data-action="back-songs">${t('back')}</button>`;
  return `<div class="analysis-orbit" aria-hidden="true">♫</div><h2>${t(status)}</h2>${name}<progress class="analysis-progress" ${progress===null?'':`value="${progress}"`} max="100" aria-label="${t(status)}"></progress><p class="import-hint" role="status">${progress===null?t('decoding'):t('analyzing')+' '+progress+'%'}</p><button class="secondary-button" data-action="back-songs">${t('cancel')}</button>`;
}
function songMenuContent(){
  return `<h2>${t('chooseTrack')}</h2><p class="setup-intro">${t('chooseTrackHint')}</p><div class="song-grid"><button class="song-upload" data-action="choose-file"><span class="song-symbol" aria-hidden="true">＋</span><span class="song-copy"><strong>${t('yourSong')}</strong><small>${t('uploadHint')}</small></span></button>`+availableTracks().map(item=>`<button class="track-choice song-card ${item===track?'selected':''}" data-track="${item.id}" aria-pressed="${item===track}"><span class="song-symbol" aria-hidden="true">♫</span><span class="song-copy"><strong>${escapeHtml(trackTitle(item))}</strong><small>${item.bpm} BPM · ${clockText(item.duration??item.bars*4*60/item.bpm)}${item.uploaded?' · '+t('uploaded'):''}</small></span><span class="song-chevron" aria-hidden="true">→</span></button>`).join('')+`</div>`;
}
function difficultyContent(){
  const notes=track.uploaded?makeAudioChart(track.analysis,difficulty):makeChart(track,difficulty);
  return `<h2>${t('chooseDifficulty')}</h2><div class="selected-track"><span class="song-symbol" aria-hidden="true">♫</span><div><small>${t('selectedSong')}</small><strong>${escapeHtml(trackTitle(track))}</strong><span>${track.bpm} BPM · ${clockText(duration())}</span></div></div><div class="difficulty-cards" role="group" aria-label="${t('difficulty')}">`+['easy','normal','hard'].map((value,i)=>`<button class="difficulty-card ${value===difficulty?'selected':''}" data-difficulty="${value}" aria-pressed="${value===difficulty}"><span class="difficulty-bars" aria-hidden="true">${[0,1,2].map(n=>`<i class="${n<=i?'lit':''}"></i>`).join('')}</span><strong>${t(value)}</strong><small>${t(value+'Hint')}</small></button>`).join('')+`</div><div class="setup-summary" role="status"><span>${t('noteCount',{count:notes.length})}</span><span>${t(difficulty==='easy'?'noFail':'tapHold')}</span></div>${track.uploaded&&track.analysis.weakBeat?`<p class="setup-warning">${t('weakBeat')}</p>`:''}<button class="primary-button setup-start" data-action="start-game"><span aria-hidden="true">▶</span>${t('startGame')}</button>`;
}
$('#songFile').addEventListener('change',event=>loadSong(event.target.files[0]));
modal.addEventListener('dragover',event=>{if(dialogType==='import'){event.preventDefault();modal.classList.add('file-dragover');}});
modal.addEventListener('dragleave',()=>modal.classList.remove('file-dragover'));
modal.addEventListener('drop',event=>{if(dialogType==='import'){event.preventDefault();modal.classList.remove('file-dragover');loadSong(event.dataTransfer.files[0]);}});

function updateLanguageButtons(){
  document.querySelectorAll('[data-language-toggle]').forEach(button=>{
    button.textContent=t('switchLabel');button.setAttribute('aria-label',t('switchLanguage'));
    button.title=t('switchLanguage');button.lang=language==='en'?'zh-CN':'en';
  });
}
function syncSoundLabel(){const label=t(audio.muted?'unmute':'mute');$('#soundButton').setAttribute('aria-label',label);$('#soundButton').title=label;}
function applyLanguage(){
  document.documentElement.lang=language==='zh'?'zh-CN':'en';
  document.title=t('title');document.querySelector('meta[name="description"]').content=t('description');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle);});
  document.querySelectorAll('[data-lane]').forEach(el=>el.setAttribute('aria-label',t('lane',{number:Number(el.dataset.lane)+1,key:['D','F','J','K'][Number(el.dataset.lane)]})));
  setTrack(track);setDifficulty(difficulty);syncSoundLabel();
  if($('#judgment').dataset.result)$('#judgment').textContent=t($('#judgment').dataset.result);
  if(modal.open)renderDialog();
  updateLanguageButtons();
}
function toggleLanguage(event){
  const button=event.target.closest('[data-language-toggle]');if(!button)return;
  const inDialog=modal.contains(button);language=language==='en'?'zh':'en';
  try{localStorage.setItem('vipermix-language',language);}catch{}
  applyLanguage();if(inDialog)modal.querySelector('[data-language-toggle]').focus();
}
document.addEventListener('click',toggleLanguage);
let track = TRACKS[1], difficulty='easy', mode='menu', run=null;
let width=390,height=550,dpr=1, lastFrame=0, flashes=[0,0,0,0], particles=[], ripples=[], pointers=new Map(), keys=new Set();
let dialogType='', session=0, allowPortrait=false;
const portraitScreen=matchMedia('(max-width: 600px) and (orientation: portrait)');
function syncOrientation(){
  const prompt=portraitScreen.matches&&!allowPortrait&&mode==='menu';
  $('#orientationHint').hidden=!prompt;$('#game').inert=prompt;
  document.body.classList.toggle('portrait-fallback',portraitScreen.matches&&!prompt);
}
portraitScreen.addEventListener('change',syncOrientation);
$('#portraitButton').addEventListener('click',()=>{allowPortrait=true;syncOrientation();});
let lastScore=-1,lastCombo=-1,lastEnergy=-1, visualTime=0, lastCountdown=null;
function setMode(next){mode=next;document.body.dataset.state=next;syncOrientation();}
function pop(element){if(!reducedMotion)element.animate([{transform:'scale(1.13)'},{transform:'scale(1)'}],{duration:200,easing:'ease-out'});}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const travel=()=>difficulty==='hard'?2.2:difficulty==='easy'?3.25:2.75;
const duration=()=>track.duration??track.bars*4*60/track.bpm;
const bestKey=()=>`neon-rush-tap-hold-best-${track.id}-${difficulty}`;
function readBest(){try{return Number(localStorage.getItem(bestKey()))||0;}catch{return 0;}}
function saveBest(score){try{localStorage.setItem(bestKey(),String(score));}catch{}}
const format=n=>Math.round(n).toString().padStart(7,'0');
function setTrack(next){
  track=next;$('#trackName').textContent=trackTitle(track);$('#trackName').title=trackTitle(track);$('#bpmLabel').textContent=track.uploaded?t('estimatedBpm',{bpm:track.bpm}):track.bpm+' BPM';
  const sec=Math.round(duration());$('#trackDetail').textContent=`${track.uploaded?t('estimatedBpm',{bpm:track.bpm}):track.bpm+' BPM'} · ${clockText(sec)}`;
  $('#best').textContent=format(readBest());
}
function setDifficulty(value){difficulty=value;$('#energyLabel').textContent=t(value==='easy'?'noFail':'energy');$('#difficultyLabel').textContent=t(value);document.querySelectorAll('[data-difficulty]').forEach(b=>{const active=b.dataset.difficulty===value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('#best').textContent=format(readBest());}
function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(stage);

// Perspective projection adapts to the available landscape or fallback stage.
function project(f,lane=.5){const p=Math.pow(Math.max(0,f),1.65), span=width*(.28+.66*p);return {x:width/2+(lane-.5)*span,y:height*(.025+.79*p),span,p};}
function polygon(points,fill,stroke,line=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
function line(a,b,color,size=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=size;ctx.stroke();}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function highway(t){
  ctx.clearRect(0,0,width,height);
  const ambience=ctx.createRadialGradient(width/2,height*.12,0,width/2,height*.3,width*.8);ambience.addColorStop(0,'#5d318666');ambience.addColorStop(.55,'#21113955');ambience.addColorStop(1,'#120a24');ctx.fillStyle=ambience;ctx.fillRect(0,0,width,height);
  if(!reducedMotion){
    for(let i=0;i<18;i++){
      const x=((i*71+Math.sin(visualTime*.25+i)*12)%width+width)%width;
      const y=((i*41-visualTime*(5+i%3))%height+height)%height;
      ctx.globalAlpha=.12+.1*Math.sin(visualTime+i);ctx.fillStyle=i%3?'#79b8ff':'#c898ff';ctx.fillRect(x,y,i%4===0?2:1,2);
    }
    ctx.globalAlpha=1;
  }
  // Thin outer architecture adds depth without competing with the notes.
  for(let i=0;i<5;i++){const a=project(0,-.2-i*.22),b=project(1.4,-.2-i*.22);line(a,b,'#7048a126');line({x:width-a.x,y:a.y},{x:width-b.x,y:b.y},'#7048a126');}
  const surface=ctx.createLinearGradient(0,0,0,height);surface.addColorStop(0,'#180d2c');surface.addColorStop(.65,'#1b0f32');surface.addColorStop(1,'#231540');polygon([project(0,0),project(0,1),project(1.14,1),project(1.14,0)],surface);
  for(let lane=0;lane<4;lane++){
    if(lane%2===0)polygon([project(0,lane/4),project(0,(lane+1)/4),project(1.14,(lane+1)/4),project(1.14,lane/4)],'#ffffff02');
    if(flashes[lane]>0){const g=ctx.createLinearGradient(0,height*.35,0,height*.87);g.addColorStop(0,'#79b8ff00');g.addColorStop(1,`rgba(121,184,255,${flashes[lane]*.22})`);polygon([project(.1,lane/4),project(.1,(lane+1)/4),project(1.08,(lane+1)/4),project(1.08,lane/4)],g);}
  }
  const bt=60/track.bpm;
  for(let i=0;i<12;i++){
    const f=((i/12+(t/bt*.045))%1+1)%1;
    line(project(f,0),project(f,1),`rgba(160,125,207,${.035+f*.065})`);
  }
  for(let lane=0;lane<=4;lane++)line(project(0,lane/4),project(1.12,lane/4),lane===0||lane===4?'#aa7fe95a':'#8261ac30',lane===0||lane===4?1.4:1);
  const beatPulse=reducedMotion?0:(1+Math.cos(t/bt*Math.PI*2))*.5;
  ctx.shadowColor='#91baff';ctx.shadowBlur=10+beatPulse*7;line(project(1,0),project(1,1),'#ac9aff99',1.5);ctx.shadowBlur=0;
  for(let lane=0;lane<4;lane++){
    const a=project(1.025,(lane+.06)/4),b=project(1.025,(lane+.94)/4),bw=b.x-a.x;
    const active=mode==='playing'&&isLaneDown(lane);
    const g=ctx.createLinearGradient(0,a.y,0,a.y+height*.07);g.addColorStop(0,active?'#79b8ff66':flashes[lane]>.1?'#697de455':'#3a235d44');g.addColorStop(1,'#160d2d');
    roundRect(a.x,a.y,bw,height*.075,7,g,active||flashes[lane]>.1?'#c4b7ff':'#79629a80');
    roundRect(a.x+10,a.y+3,bw-20,2,1,'#79b8ff44');
  }
  const fog=ctx.createLinearGradient(0,0,0,height*.22);fog.addColorStop(0,'#120a24');fog.addColorStop(1,'#120a2400');ctx.fillStyle=fog;ctx.fillRect(0,0,width,height*.22);
}
function noteBlock(note,f,holding=false){
  if(f<0||f>1.16)return;
  const p=project(f,(note.lane+.5)/4), nw=p.span/4*.79, nh=Math.max(4,13*(.3+.7*p.p));
  const isHold=note.type!=='tap', color=isHold?'#c898ff':'#79b8ff';
  if(note.type==='hold'){
    const tailF=Math.max(0,f-note.duration/travel());const tail=project(tailF,(note.lane+.5)/4),tw=tail.span/4*.37;
    const g=ctx.createLinearGradient(0,tail.y,0,p.y);g.addColorStop(0,'#c898ff25');g.addColorStop(1,holding?'#c898ffbb':'#c898ff55');
    polygon([{x:tail.x-tw/2,y:tail.y},{x:tail.x+tw/2,y:tail.y},{x:p.x+nw*.25,y:p.y},{x:p.x-nw*.25,y:p.y}],g,'#c898ff55');
    line({x:tail.x,y:tail.y},{x:p.x,y:p.y},'#e4c7ffaa',1.5);roundRect(tail.x-tw/2,tail.y-2,tw,3,1,color);
    if(holding){
      if(!reducedMotion){
        for(let i=0;i<3;i++){
          const phase=(visualTime*2+i/3)%1;
          ctx.shadowColor=color;ctx.shadowBlur=8;
          ctx.fillStyle='#f5eaff';ctx.fillRect(p.x-2,tail.y+(p.y-tail.y)*phase,4,4);
        }
      }
      ctx.shadowBlur=0;ctx.lineWidth=2.5;ctx.strokeStyle='#c898ff33';
      ctx.beginPath();ctx.ellipse(p.x,p.y,nw*.64,nh*1.8,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#e4c7ff';ctx.shadowColor=color;ctx.shadowBlur=reducedMotion?0:10;
      ctx.beginPath();ctx.ellipse(p.x,p.y,nw*.64,nh*1.8,0,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.01,note.progress||0));ctx.stroke();ctx.shadowBlur=0;
    }
  }
  ctx.shadowBlur=(mode==='menu'?10:16)*p.p;ctx.shadowColor=color;
  const face=ctx.createLinearGradient(0,p.y-nh,0,p.y+nh);face.addColorStop(0,isHold?'#eddaff':'#daedff');face.addColorStop(.25,color);face.addColorStop(.6,isHold?'#874ce1':'#3c6fcb');face.addColorStop(1,isHold?'#c898ff':'#94c7ff');
  polygon([{x:p.x-nw*.45,y:p.y-nh/2},{x:p.x+nw*.45,y:p.y-nh/2},{x:p.x+nw/2,y:p.y+nh/2},{x:p.x-nw/2,y:p.y+nh/2}],face,color);
  ctx.shadowBlur=0;line({x:p.x-nw*.38,y:p.y-nh*.18},{x:p.x+nw*.38,y:p.y-nh*.18},'#ffffffa0',1);

}
function burst(lane,color='#79b8ff'){
  flashes[lane]=1;const p=project(1,(lane+.5)/4);
  if(reducedMotion)return;
  ripples.push({lane,life:.45,color});
  for(let i=0;i<20;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*140,vy:-Math.random()*160-30,life:.45+Math.random()*.2,color});
}
function announce(result,lane){
  const el=$('#judgment');el.dataset.result=result;el.textContent=t(result);
  el.style.color=({perfect:'#c898ff',great:'#79b8ff',good:'#b6a1ff',miss:'#ff7b9f'})[result];
  el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  if(result!=='miss')burst(lane,result==='perfect'?'#c898ff':'#79b8ff');
}
function judge(note,result,error){if(run.judge(note,result,error))announce(result,note.lane);updateHUD();}
function updateHUD(){
  if(!run)return;
  if(lastScore!==run.score){$('#score').textContent=format(run.score);if(run.score>lastScore&&lastScore>=0)pop($('#score'));lastScore=run.score;}
  if(lastCombo!==run.combo){$('#combo').textContent=run.combo;$('#comboBox').classList.toggle('visible',run.combo>=3);if(run.combo>=3)pop($('#combo'));lastCombo=run.combo;}
  const e=Math.round(run.energy);if(e!==lastEnergy){$('#energyFill').style.width=e+'%';$('#energyFill').style.background=e<25?'#ff7b9f':'var(--brand-gradient)';$('#energyText').textContent=e+'%';lastEnergy=e;}
}
async function start(){
  if(mode==='playing'||mode==='countdown')return;
  const token=++session; closeModal();$('#playButton').disabled=true;
  try{await audio.unlock();}catch(e){$('#playButton').disabled=false;showError();return;}
  if(token!==session)return;
  run=new Run(track.uploaded?makeAudioChart(track.analysis,difficulty):makeChart(track,difficulty),difficulty);lastScore=lastCombo=lastEnergy=-1;keys.clear();pointers.clear();particles=[];ripples=[];lastCountdown=null;
  audio.start(track,track.uploaded?travel()+.35:0);setMode('countdown');$('#menu').hidden=true;$('#pauseButton').disabled=false;$('#nextTrack').hidden=true;$('#trackButton').disabled=true;$('#playingBars').hidden=false;$('#countdown').hidden=false;$('#playButton').disabled=false;$('#songProgress').style.width='0%';updateHUD();
}
function showError(){showDialog('error');}
function isLaneDown(lane){return keys.has(lane)||[...pointers.values()].some(p=>p.lane===lane);}
function press(lane){
  if(mode!=='playing')return;
  flashes[lane]=.7;const t=audio.time,n=run.candidate(lane,t);if(!n)return;
  const rating=gradeTiming(t-n.time);
  if(n.type==='hold'){n.status='holding';n.holdGrade=rating;n.error=t-n.time;burst(lane,'#c898ff');}
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
  if(e.code==='Escape'){e.preventDefault();if(mode==='playing'||mode==='countdown')pause();else if(mode==='paused')resume();else if(modal.open)backDialog();return;}
  if(e.code==='Space'&&!modal.open&&!e.target.closest('button,a,input,select')){e.preventDefault();if(mode==='menu')trackMenu();return;}
  if(e.code in keyLanes){e.preventDefault();if(e.repeat)return;const l=keyLanes[e.code];keys.add(l);press(l);}

});
window.addEventListener('keyup',e=>{if(e.code in keyLanes){const l=keyLanes[e.code];keys.delete(l);release(l);}});
async function pause(){
  if(mode!=='playing'&&mode!=='countdown')return;
  setMode('paused');keys.clear();pointers.clear();$('#countdown').hidden=true;$('#playingBars').classList.add('paused-bars');await audio.pause();
  showDialog('pause');
}
async function resume(){
  if(mode!=='paused')return;
  // A short grace period lets touch players reacquire any in-progress holds.
  run.notes.filter(n=>n.status==='holding').forEach(n=>n.resumeGrace=audio.time+.5);
  try{await audio.resume();}catch{return;}
  closeModal();setMode(audio.time<0?'countdown':'playing');$('#playingBars').classList.remove('paused-bars');
}
function goHome(){
  session++;audio.stop();closeModal();setMode('menu');run=null;keys.clear();pointers.clear();$('#menu').hidden=false;$('#countdown').hidden=true;$('#comboBox').classList.remove('visible');$('#judgment').classList.remove('show');$('#pauseButton').disabled=true;$('#nextTrack').hidden=false;$('#trackButton').disabled=false;$('#playingBars').hidden=true;$('#playingBars').classList.remove('paused-bars');$('#score').textContent='0000000';$('#energyFill').style.width='100%';$('#energyFill').style.background='var(--brand-gradient)';$('#judgment').textContent='';delete $('#judgment').dataset.result;$('#energyText').textContent='100%';$('#songProgress').style.width='0%';$('#best').textContent=format(readBest());
}
function finish(reason='complete'){
  if(mode==='results')return;setMode('results');audio.stop();$('#pauseButton').disabled=true;$('#playingBars').hidden=true;$('#comboBox').classList.remove('visible');
  const prev=readBest(),newBest=run.score>prev;if(newBest)saveBest(run.score);$('#best').textContent=format(readBest());
  const accuracy=run.accuracy,grade=gradeAccuracy(accuracy);
  lastResult={reason,newBest,accuracy,grade};showDialog('results');
}
function closeModal(){
  if(dialogType==='import'&&importController){importController.abort();importController=null;uploadState={status:'idle',fileName:'',progress:null};}
  if(modal.open)modal.close();dialogType='';modal.classList.remove('file-dragover');
}
function showDialog(type){dialogType=type;renderDialog();if(!modal.open)modal.showModal();}
function help(){showDialog('help');}
function trackMenu(){if(mode==='menu')showDialog('tracks');}
function backToSongs(){
  if(mode!=='menu')goHome();else closeModal();
  trackMenu();
}
function backDialog(){
  if(dialogType==='difficulty'||dialogType==='import')backToSongs();
  else if(dialogType==='results')goHome();
  else closeModal();
}
function renderDialog(){
  modal.dataset.dialog=dialogType;
  let content='';
  if(dialogType==='import')content=importContent();
  if(dialogType==='error')content=`<div class="eyebrow">${t('retry')}</div><h2>${t('oneMoreBeat')}</h2><p>${t('audioError')}</p><button class="primary-button" data-action="close">${t('gotIt')}</button>`;
  if(dialogType==='pause')content=`<h2><em>${t('paused')}</em></h2><button class="primary-button" data-action="resume">${t('resume')} <span>▶</span></button><button class="secondary-button" data-action="restart">${t('restart')}</button><button class="secondary-button" data-action="home">${t('menu')}</button>`;
  if(dialogType==='help')content=`<h2>${t('tap')} <em>+ ${t('hold')}</em></h2><div class="tutorial-row"><div class="note-demo"><span class="note-icon tap"></span></div><div><strong>${t('tap')}</strong><p>${t('tapHelp')}</p></div></div><div class="tutorial-row"><div class="note-demo"><span class="note-icon hold"></span></div><div><strong>${t('hold')}</strong><p>${t('holdHelp')}</p></div></div><p class="key-hint">${t('keyboardHelp')}</p><button class="primary-button" data-action="close">${t('gotIt')}</button>`;
  if(dialogType==='tracks')content=songMenuContent();
  if(dialogType==='difficulty')content=difficultyContent();
  if(dialogType==='results'&&lastResult){
    const {reason,newBest,accuracy,grade}=lastResult;
    content=`<div class="eyebrow">${t(reason==='complete'?'complete':'outOfEnergy')}</div><h2>${t(reason==='complete'?'niceFlow':'tryAgain')}</h2><div class="result-grade">${grade}</div><div class="result-score">${format(run.score)}</div><div class="result-best">${newBest?'↗ '+t('newBest'):escapeHtml(trackTitle(track))}</div><div class="result-stats"><div><strong>${accuracy.toFixed(1)}%</strong><span>${t('accuracy')}</span></div><div><strong>${run.maxCombo}</strong><span>${t('maxCombo')}</span></div></div><div class="result-breakdown"><span>${run.counts.perfect} ${t('perfect')}</span><span>${run.counts.great+run.counts.good} ${t('goodGreat')}</span><span>${run.counts.miss} ${t('miss')}</span></div><button class="primary-button" data-action="restart">${t('playAgain')} <span>↗</span></button><button class="secondary-button" data-action="back-songs">${t('changeTrackAction')}</button>`;
  }
  const setup=dialogType==='tracks'||dialogType==='difficulty';
  const toolbar=setup?`<div class="setup-toolbar"><button class="setup-back" data-action="${dialogType==='tracks'?'close':'back-songs'}">← ${t('back')}</button><nav class="setup-steps" aria-label="${t('setupProgress')}"><span ${dialogType==='tracks'?'aria-current="step"':''}>${t('songStep')}</span><i aria-hidden="true">/</i><span ${dialogType==='difficulty'?'aria-current="step"':''}>${t('difficultyStep')}</span></nav><button class="language-button" data-language-toggle></button></div>`:`<div class="dialog-language"><button class="language-button" data-language-toggle></button></div>`;
  $('#modalContent').innerHTML=toolbar+content;
  updateLanguageButtons();
}
$('#modalContent').addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='choose-file')chooseFile();
  if(action==='start-game'&&dialogType==='difficulty')start();
  if(action==='back-songs')backToSongs();
  if(action==='close')closeModal();if(action==='resume')resume();if(action==='restart')start();if(action==='home')goHome();
  const id=e.target.closest('[data-track]')?.dataset.track;
  if(id){setTrack(availableTracks().find(item=>item.id===id));showDialog('difficulty');}
  const choice=e.target.closest('[data-difficulty]')?.dataset.difficulty;
  if(choice){setDifficulty(choice);renderDialog();$(`[data-difficulty="${choice}"]`).focus();}
});
modal.addEventListener('cancel',e=>{e.preventDefault();if(dialogType==='pause')resume();else backDialog();});
// The game opens on a start screen; PLAY there leads straight to choosing a song.
function leaveStart(){const screen=$('#startScreen');if(!screen||screen.hidden)return;screen.classList.add('leaving');document.body.classList.remove('at-start');setTimeout(()=>{screen.hidden=true;},350);trackMenu();}
document.body.classList.add('at-start');$('#startButton').addEventListener('click',leaveStart);$('#startButton').focus({preventScroll:true});
$('#playButton').addEventListener('click',trackMenu);$('#pauseButton').addEventListener('click',pause);$('#helpButton').addEventListener('click',help);$('#trackButton').addEventListener('click',trackMenu);
$('#soundButton').addEventListener('click',()=>{audio.setMuted(!audio.muted);syncSoundLabel();$('#soundButton').style.color=audio.muted?'#ff7b9f':'';$('#soundButton').innerHTML=audio.muted?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6M22 9l-6 6"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';});
$('#fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();screen.orientation?.unlock?.();}else if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();try{await screen.orientation?.lock?.('landscape');}catch{}}}catch{}});
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
applyLanguage();syncOrientation();resize();requestAnimationFrame(frame);
