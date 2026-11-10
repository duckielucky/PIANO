import { TRACKS, makeChart, trackMap, gradeTiming, gradeAccuracy, Run, syncStep, SYNC_RANGE, SONG_LIMIT, SONG_FADE, limitChart } from './engine.js?v=c9f6aa1533';
import { Soundtrack } from './audio.js?v=90cd7f608e';
import { makeAudioChart, beatMap } from './beat-analysis.js?v=278b77f1d1';
import { chooseLanguage, translate } from './i18n.js?v=d60e454469';
import { SONGS } from './songs.js?v=9aab7fab42';

const $ = s => document.querySelector(s);
const canvas=$('#canvas'), stage=$('#stage'), modal=$('#modal');
let ctx=canvas.getContext('2d');
const audio = new Soundtrack();
let savedLanguage;
try { savedLanguage=localStorage.getItem('vipermix-language'); } catch {}
let language=chooseLanguage(savedLanguage,navigator.language), lastResult=null;
const t=(key,values)=>translate(language,key,values);
const trackTitle=track=>track.recorded?track.title:t('track_'+track.id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
// Recorded songs ship with the game: real audio and a beat analysis, made ahead of time.
const recordedTracks=SONGS.map(song=>({...song,url:new URL(song.file,import.meta.url).href,buffer:null,recorded:true}));
const builtInTracks=[...recordedTracks,...TRACKS];
// Only the chosen song keeps decoded audio in memory; the others load from the site again when picked.
function keepBuffer(item){recordedTracks.forEach(other=>{if(other!==item)other.buffer=null;});}
function prepare(item){
  if(!item.recorded||item.buffer)return Promise.resolve();
  item.loading??=fetch(item.url).then(response=>{if(!response.ok)throw new Error('decodeError');return response.arrayBuffer();}).then(bytes=>audio.decode(bytes)).then(buffer=>{keepBuffer(item);item.buffer=buffer;}).finally(()=>{item.loading=null;});
  return item.loading;
}
// The song's key: found in a recorded song's sound; the original tracks are written in a minor key on their root note.
const keyText=item=>{const key=item.recorded?item.analysis?.key:{name:['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][item.root%12],mode:'minor'};return key?t(key.mode==='major'?'keyMajor':'keyMinor',{note:key.name.replace('#','♯').replace(/(?<=.)b/,'♭')}):'';};
const songFacts=(item,seconds)=>[item.recorded?t('estimatedBpm',{bpm:item.bpm}):item.bpm+' BPM',keyText(item),clockText(seconds)].filter(Boolean).join(' · ');
const clockText=seconds=>{const total=Math.round(seconds);return `${Math.floor(total/60).toString().padStart(2,'0')}:${(total%60).toString().padStart(2,'0')}`;};
function songCard(item){
  const card=`<button class="track-choice song-card ${item===track?'selected':''}" data-track="${item.id}" aria-pressed="${item===track}"><span class="song-symbol" aria-hidden="true">♫</span><span class="song-copy"><strong>${escapeHtml(trackTitle(item))}</strong><small>${songFacts(item,Math.min(SONG_LIMIT,item.duration??item.bars*4*60/item.bpm))}</small></span><span class="song-chevron" aria-hidden="true">→</span></button>`;
  return card;
}
function songMenuContent(){
  return `<h2>${t('chooseTrack')}</h2><p class="setup-intro">${t('chooseTrackHint')}</p><div class="song-grid">${builtInTracks.map(songCard).join('')}</div>`;
}
// Paused, a different difficulty starts the song again with that difficulty's notes.
const pauseDifficulty=()=>`<p class="pause-label">${t('changeDifficulty')}</p><div class="difficulty-selector" role="group" aria-label="${t('difficulty')}">`+['easy','normal','hard'].map(value=>`<button class="${value===difficulty?'selected':''}" data-difficulty="${value}" aria-pressed="${value===difficulty}">${t(value)}</button>`).join('')+`</div>`;
function difficultyContent(){
  const notes=track.recorded?makeAudioChart(track.analysis,difficulty):makeChart(track,difficulty);
  return `<h2>${t('chooseDifficulty')}</h2><div class="selected-track"><span class="song-symbol" aria-hidden="true">♫</span><div><small>${t('selectedSong')}</small><strong>${escapeHtml(trackTitle(track))}</strong><span>${songFacts(track,duration())}</span></div></div><div class="difficulty-cards" role="group" aria-label="${t('difficulty')}">`+['easy','normal','hard'].map((value,i)=>`<button class="difficulty-card ${value===difficulty?'selected':''}" data-difficulty="${value}" aria-pressed="${value===difficulty}"><span class="difficulty-bars" aria-hidden="true">${[0,1,2].map(n=>`<i class="${n<=i?'lit':''}"></i>`).join('')}</span><strong>${t(value)}</strong><small>${t(value+'Hint')}</small></button>`).join('')+`</div><div class="setup-summary" role="status"><span>${t('noteCount',{count:notes.length})}</span><span>${t(difficulty==='easy'?'noFail':'tapHold')}</span></div><div class="setup-extras"><p class="setup-tune">${t('followsTune')}</p>${syncRow(true)}</div>${track.recorded&&track.analysis.weakBeat?`<p class="setup-warning">${t('weakBeat')}</p>`:''}<button class="primary-button setup-start" data-action="start-game"><span aria-hidden="true">▶</span>${t('startGame')}</button>`;
}

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
let track = builtInTracks[0], difficulty='easy', mode='menu', run=null;
let width=390,height=550,dpr=1, lastFrame=0, flashes=[0,0,0,0], flashColor=['121,184,255','121,184,255','121,184,255','121,184,255'], missFlashes=[0,0,0,0], particles=[], ripples=[], pointers=new Map(), keys=new Set();
let dialogType='', session=0, allowPortrait=false, flares=[];
const portraitScreen=matchMedia('(max-width: 600px) and (orientation: portrait)');
// Upright tablets and windows use the upright layout too; only phones are asked to turn sideways.
const uprightScreen=matchMedia('(orientation: portrait)');
function syncOrientation(){
  const prompt=portraitScreen.matches&&!allowPortrait&&mode==='menu';
  $('#orientationHint').hidden=!prompt;$('#game').inert=prompt;
  document.body.classList.toggle('portrait-fallback',uprightScreen.matches&&!prompt);
}
portraitScreen.addEventListener('change',syncOrientation);uprightScreen.addEventListener('change',syncOrientation);
$('#portraitButton').addEventListener('click',()=>{allowPortrait=true;syncOrientation();});
let lastScore=-1,lastCombo=-1,lastEnergy=-1, visualTime=0, lastCountdown=null;
function setMode(next){mode=next;document.body.dataset.state=next;syncOrientation();}
function pop(element){if(!reducedMotion)element.animate([{transform:'scale(1.13)'},{transform:'scale(1)'}],{duration:200,easing:'ease-out'});}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const travel=()=>difficulty==='hard'?1.7:difficulty==='easy'?3.25:2.75;
// The song's beats and how hard each bar hits, worked out once per song.
const beatGrid=item=>item.beatGrid??=(item.recorded?beatMap(item.analysis):trackMap(item));
function beatAt(grid,t){
  let lo=0,hi=grid.beats.length-1;if(hi<0||t<grid.beats[0])return {k:-1,since:9,level:1,bar:false};
  while(lo<hi){const mid=(lo+hi+1)>>1;if(grid.beats[mid]<=t)lo=mid;else hi=mid-1;}
  return {k:lo,since:t-grid.beats[lo],level:grid.levels[lo],bar:((lo-grid.downbeat)%4+4)%4===0};
}
const duration=()=>Math.min(SONG_LIMIT,track.duration??track.bars*4*60/track.bpm);
const bestKey=()=>`neon-rush-tap-hold-best-${track.id}-${difficulty}`;
// Two delays, both kept on this device. The sound delay (set with − and +)
// moves the notes and the beat to where the sound is heard, for Bluetooth and
// phones that don't report their delay. The tap delay is learned from taps
// and only moves scoring, so a finger that lands a little late still scores
// while the notes and the beat flashes stay locked to the music.
const clampSync=v=>Math.round(Math.max(SYNC_RANGE[0],Math.min(SYNC_RANGE[1],v))*1000)/1000;
let tapDelay=0;
try{
  localStorage.removeItem('vipermix-sound-delay');
  audio.offset=clampSync(Number(localStorage.getItem('vipermix-audio-delay'))||0);
  tapDelay=clampSync(Number(localStorage.getItem('vipermix-tap-delay'))||0);
}catch{}
function setSync(value){audio.offset=clampSync(value);try{localStorage.setItem('vipermix-audio-delay',String(audio.offset));}catch{}}
function setTapDelay(value){tapDelay=clampSync(value);try{localStorage.setItem('vipermix-tap-delay',String(tapDelay));}catch{}}
const tapTime=()=>audio.time-tapDelay;
const syncText=()=>t('soundDelayValue',{ms:Math.round(audio.offset*1000)});
const syncRow=(test=false)=>`<div class="sync-row"><div><strong>${t('soundDelay')}</strong><small>${t('soundDelayHint')}</small></div><div class="sync-controls"><button class="sync-button" data-sync="-1" aria-label="${t('soundDelayLess')}">−</button><output role="status">${syncText()}</output><button class="sync-button" data-sync="1" aria-label="${t('soundDelayMore')}">+</button>${test?`<button class="sync-test" data-action="sync-test">${t('syncTest')}</button>`:''}</div></div>`;
let syncSamples=[],sinceSync=0;
// A tap near a note, scored or not, tells how late this player's taps land.
function learnSync(lane,t){
  let near=null;for(const n of run.notes)if(n.lane===lane&&(n.status==='pending'||n.status==='miss')&&Math.abs(t-n.time)<.4&&(!near||Math.abs(t-n.time)<Math.abs(t-near.time)))near=n;
  if(!near)return;
  syncSamples.push(t-near.time);if(syncSamples.length>16)syncSamples.shift();
  if(++sinceSync<4)return;
  const step=syncStep(syncSamples);if(!step)return;
  const before=tapDelay;setTapDelay(before+step);const moved=tapDelay-before;
  syncSamples=syncSamples.map(e=>e-moved);sinceSync=0;
}
// The sync test: clicks play on a steady beat while notes fall to a line. The
// player taps along, which sets the tap delay, and moves the sound delay
// until the notes land on the line as each click is heard.
const SYNC_BEAT=.6;let syncTaps=[],syncFlash=0;
function syncTapText(){
  if(syncTaps.length<6)return syncTaps.length?t('syncTapsMore',{count:6-syncTaps.length}):t('syncTapPrompt');
  const ms=Math.round(tapDelay*1000);
  return Math.abs(ms)<10?t('syncTapsOn'):t(ms>0?'syncTapsLate':'syncTapsEarly',{ms:Math.abs(ms)});
}
async function openSyncTest(){
  syncTaps=[];showDialog('sync');
  try{await audio.unlock();}catch{return;}
  if(dialogType==='sync'&&modal.open)audio.startClicks(SYNC_BEAT);
}
function syncTap(){
  if(!audio.clicking)return;
  const heard=audio.time,error=heard-Math.round(heard/SYNC_BEAT)*SYNC_BEAT;syncFlash=1;
  if(heard<-.2||Math.abs(error)>.25)return;
  syncTaps.push(error);if(syncTaps.length>12)syncTaps.shift();
  if(syncTaps.length>=6){const sorted=[...syncTaps].sort((a,b)=>a-b);setTapDelay((sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2);}
  const out=$('#modalContent .sync-taps');if(out)out.textContent=syncTapText();
}
function drawSyncTest(){
  const c=$('#modalContent .sync-canvas');if(!c)return;
  const w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const line=h*.78,fall=1.2,now=audio.clicking?audio.time:-9,nw=Math.min(90,w*.3);
  const near=audio.clicking?Math.abs(now-Math.round(now/SYNC_BEAT)*SYNC_BEAT):1,beam=Math.max(syncFlash,near<.05&&now>-.05?1-near/.05:0);
  g.fillStyle=`rgba(200,152,255,${.08+beam*.25})`;g.fillRect(w/2-nw/2-8,0,nw+16,h);
  g.fillStyle=`rgba(172,154,255,${.55+beam*.45})`;g.fillRect(12,line-1,w-24,2+beam*2);
  for(let k=Math.max(0,Math.ceil((now-.25)/SYNC_BEAT));k*SYNC_BEAT<now+fall;k++){
    const y=line-(k*SYNC_BEAT-now)/fall*line;g.globalAlpha=y>line?Math.max(0,1-(y-line)/(h-line)):1;
    g.fillStyle=k%4?'#79b8ff':'#c898ff';g.beginPath();g.roundRect(w/2-nw/2,y-6,nw,12,4);g.fill();
  }
  g.globalAlpha=1;syncFlash=Math.max(0,syncFlash-.08);
}
$('#modalContent').addEventListener('pointerdown',e=>{if(e.target.classList.contains('sync-canvas')){e.preventDefault();syncTap();}});
function readBest(){try{return Number(localStorage.getItem(bestKey()))||0;}catch{return 0;}}
function saveBest(score){try{localStorage.setItem(bestKey(),String(score));}catch{}}
const format=n=>Math.round(n).toString().padStart(7,'0');
function setTrack(next){
  track=next;$('#trackName').textContent=trackTitle(track);$('#trackName').title=trackTitle(track);$('#bpmLabel').textContent=track.recorded?t('estimatedBpm',{bpm:track.bpm}):track.bpm+' BPM';
  $('#trackDetail').textContent=songFacts(track,Math.round(duration()));
  $('#best').textContent=format(readBest());
}
function setDifficulty(value){difficulty=value;$('#energyLabel').textContent=t(value==='easy'?'noFail':'energy');$('#difficultyLabel').textContent=t(value);$('.energy').hidden=value==='easy';document.querySelectorAll('[data-difficulty]').forEach(b=>{const active=b.dataset.difficulty===value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('#best').textContent=format(readBest());}
function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);scenery=null;}
new ResizeObserver(resize).observe(stage);

// Perspective projection adapts to the available landscape or fallback stage.
// Notes keep a nearly even pace down the road: one that speeds up near the line
// arrives sooner than the eye expects and feels off the beat.
function project(f,lane=.5){const p=Math.pow(Math.max(0,f),1.15), span=width*(.28+.66*p);return {x:width/2+(lane-.5)*span,y:height*(.025+.79*p),span,p};}
function polygon(points,fill,stroke,line=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
function line(a,b,color,size=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=size;ctx.stroke();}
// Glows are blurred once into small sprites and stretched onto each note and
// the hit line: a live canvas blur on every note each frame is slow on phones.
// A sprite holds the halo of a 100-wide bar (20 tall for notes, 2 for lines)
// blurred by 16 px; its 32 px margin stands for twice the blur radius.
const glowSprites=new Map();
function glowSprite(color,tall){
  const key=color+tall;let c=glowSprites.get(key);
  if(!c){
    c=document.createElement('canvas');c.width=164;c.height=tall+64;const g=c.getContext('2d');
    // Only the halo is wanted: the bar sits off the sprite and its shadow is cast onto it.
    g.shadowColor=color;g.shadowBlur=16;g.shadowOffsetX=c.width;g.fillStyle=color;g.fillRect(32-c.width,32,100,tall);
    glowSprites.set(key,c);
  }
  return c;
}
function glow(color,tall,x,y,w,h,blur){if(blur>.5)ctx.drawImage(glowSprite(color,tall),x-2*blur,y-2*blur,w+4*blur,h+4*blur);}
const flareSprites=new Map();
function flareSprite(color){
  let c=flareSprites.get(color);
  if(!c){c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'#ffffff');r.addColorStop(.18,color);r.addColorStop(.5,color+'44');r.addColorStop(1,color+'00');g.fillStyle=r;g.fillRect(0,0,128,128);flareSprites.set(color,c);}
  return c;
}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
// The parts of the stage that never move are painted once per screen size:
// the backdrop, the road and its stripes, and the fog the notes appear from.
let scenery=null;
function paintLayer(draw){
  const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;
  const screen=ctx;ctx=layer.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);draw();ctx=screen;
  return layer;
}
function paintScenery(){
  return {
    back:paintLayer(()=>{
      const ambience=ctx.createRadialGradient(width/2,height*.12,0,width/2,height*.3,width*.8);ambience.addColorStop(0,'#5d318666');ambience.addColorStop(.55,'#21113955');ambience.addColorStop(1,'#120a24');ctx.fillStyle=ambience;ctx.fillRect(0,0,width,height);
    }),
    road:paintLayer(()=>{
      // Thin outer architecture adds depth without competing with the notes.
      for(let i=0;i<5;i++){const a=project(0,-.2-i*.22),b=project(1.4,-.2-i*.22);line(a,b,'#7048a126');line({x:width-a.x,y:a.y},{x:width-b.x,y:b.y},'#7048a126');}
      const surface=ctx.createLinearGradient(0,0,0,height);surface.addColorStop(0,'#180d2c');surface.addColorStop(.65,'#1b0f32');surface.addColorStop(1,'#231540');polygon([project(0,0),project(0,1),project(1.14,1),project(1.14,0)],surface);
      for(let lane=0;lane<4;lane+=2)polygon([project(0,lane/4),project(0,(lane+1)/4),project(1.14,(lane+1)/4),project(1.14,lane/4)],'#ffffff02');
    }),
    fog:paintLayer(()=>{
      const fog=ctx.createLinearGradient(0,0,0,height*.22);fog.addColorStop(0,'#120a24');fog.addColorStop(1,'#120a2400');ctx.fillStyle=fog;ctx.fillRect(0,0,width,height*.22);
    }),
  };
}
function highway(t){
  scenery??=paintScenery();
  ctx.clearRect(0,0,width,height);ctx.drawImage(scenery.back,0,0,width,height);
  if(!reducedMotion){
    for(let i=0;i<18;i++){
      const x=((i*71+Math.sin(visualTime*.25+i)*12)%width+width)%width;
      const y=((i*41-visualTime*(5+i%3))%height+height)%height;
      ctx.globalAlpha=.12+.1*Math.sin(visualTime+i);ctx.fillStyle=i%3?'#79b8ff':'#c898ff';ctx.fillRect(x,y,i%4===0?2:1,2);
    }
    ctx.globalAlpha=1;
  }
  ctx.drawImage(scenery.road,0,0,width,height);
  for(let lane=0;lane<4;lane++){
    for(const [amount,rgb,strength] of [[flashes[lane],flashColor[lane],.42],[missFlashes[lane],'255,90,130',.32]]){
      if(amount<=0)continue;const top=project(.3,lane/4).y,g=ctx.createLinearGradient(0,top,0,project(1,0).y);g.addColorStop(0,`rgba(${rgb},0)`);g.addColorStop(1,`rgba(${rgb},${amount*strength})`);
      polygon([project(.3,lane/4),project(.3,(lane+1)/4),project(1.08,(lane+1)/4),project(1.08,lane/4)],g);
    }
  }
  const grid=run&&['playing','countdown','paused'].includes(mode)?beatGrid(track):null, now=grid?beatAt(grid,t):null;
  if(grid){
    // Beat lines travel down with the notes, so the pulse is visible before it is heard; bar lines are brighter.
    const ahead=travel()*1.14;
    for(let k=Math.max(0,now.k);k<grid.beats.length&&grid.beats[k]<=t+ahead;k++){
      const f=1-(grid.beats[k]-t)/travel(),bar=((k-grid.downbeat)%4+4)%4===0;if(f<0||f>1.14)continue;
      line(project(f,0),project(f,1),bar?`rgba(200,152,255,${.1+f*.32})`:`rgba(160,125,207,${.04+f*.1})`,bar?1.6:1);
    }
  }else{
    const bt=60/track.bpm;
    for(let i=0;i<12;i++){
      const f=((i/12+(t/bt*.045))%1+1)%1;
      line(project(f,0),project(f,1),`rgba(160,125,207,${.035+f*.065})`);
    }
  }
  // Every beat lands as a flash on the hit line and the highway edges: harder on
  // the first beat of a bar, and harder again when the song is at its peak.
  // The first bar of the song's peak gets its own cheer.
  if(now&&mode==='playing'&&now.k>=0){if(now.level===2&&lastLevel<2&&now.bar&&t>4)cheer('cheerDrop','',true);lastLevel=now.level;}
  const pulse=now&&!reducedMotion&&t>=0?Math.exp(-now.since*7)*(now.bar?1:.55)*[.55,.85,1.2][now.level]:0;
  for(let lane=0;lane<=4;lane++)line(project(0,lane/4),project(1.12,lane/4),lane===0||lane===4?`rgba(170,127,233,${.35+pulse*.5})`:'#8261ac30',lane===0||lane===4?1.4+pulse*1.2:1);
  const tier=run&&mode!=='menu'?(run.combo>=100?2:run.combo>=50?1:0):0;
  {const a=project(1,0),b=project(1,1),w=1.5+pulse*1.5+tier*.5;glow(['#91baff','#c898ff','#ffc27a'][tier],2,a.x,a.y-w/2,b.x-a.x,w,10+pulse*20+tier*4);line(a,b,`rgba(${['172,154,255','214,170,255','255,214,160'][tier]},${.6+pulse*.4})`,w);}
  if(pulse>.02&&now.level===2){
    // At the peak, stage lights at both sides answer each beat.
    for(const side of [0,1]){const x=side?width:0,glow=ctx.createRadialGradient(x,height*.55,0,x,height*.55,width*.42);glow.addColorStop(0,(now.k%2===side?'rgba(200,152,255,':'rgba(121,184,255,')+(pulse*.22)+')');glow.addColorStop(1,'rgba(18,10,36,0)');ctx.fillStyle=glow;ctx.fillRect(side?width*.5:0,0,width*.5,height);}
  }
  const near=[0,0,0,0];
  if(run&&mode!=='menu')for(const n of run.notes){if(n.time>t+.45)break;if(n.status==='pending'&&n.time>t-.1)near[n.lane]=Math.max(near[n.lane],1-Math.abs(n.time-t)/.45);}
  for(let lane=0;lane<4;lane++){
    const active=mode==='playing'&&isLaneDown(lane),drop=active?2:0;
    const a=project(1.025,(lane+.06)/4),b=project(1.025,(lane+.94)/4),bw=b.x-a.x,y=a.y+drop,lit=Math.max(flashes[lane],near[lane]*.45);
    const g=ctx.createLinearGradient(0,y,0,y+height*.07);g.addColorStop(0,active?'#79b8ff70':`rgba(${flashColor[lane]},${.08+lit*.45})`);g.addColorStop(1,'#160d2d');
    roundRect(a.x,y,bw,height*.075-drop,7,g,active||lit>.1?`rgba(214,204,255,${.55+lit*.45})`:'#79629a80');
    roundRect(a.x+10,y+3,bw-20,2,1,`rgba(121,184,255,${.27+pulse*.55+lit*.4})`);
  }
  ctx.drawImage(scenery.fog,0,0,width,height);
}
function noteBlock(note,f,holding=false,missed=false){
  if(f<0||f>1.16)return;
  const p=project(f,(note.lane+.5)/4), nw=p.span/4*.79, nh=Math.max(4,Math.min(20,Math.max(13,width*.04))*(.3+.7*p.p));
  if(missed){polygon([{x:p.x-nw*.45,y:p.y-nh/2},{x:p.x+nw*.45,y:p.y-nh/2},{x:p.x+nw/2,y:p.y+nh/2},{x:p.x-nw/2,y:p.y+nh/2}],'#5a2340','#ff7b9f');return;}
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
          const y=tail.y+(p.y-tail.y)*phase;glow(color,20,p.x-2,y,4,4,4);
          ctx.fillStyle='#f5eaff';ctx.fillRect(p.x-2,y,4,4);
        }
      }
      ctx.lineWidth=2.5;ctx.strokeStyle='#c898ff33';
      ctx.beginPath();ctx.ellipse(p.x,p.y,nw*.64,nh*1.8,0,0,Math.PI*2);ctx.stroke();
      // The progress ring: a soft wide stroke under a crisp one stands in for a glow.
      const ring=()=>{ctx.beginPath();ctx.ellipse(p.x,p.y,nw*.64,nh*1.8,0,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.01,note.progress||0));ctx.stroke();};
      if(!reducedMotion){ctx.strokeStyle='#c898ff40';ctx.lineWidth=8;ring();}
      ctx.strokeStyle='#e4c7ff';ctx.lineWidth=2.5;ring();
    }
  }
  glow(color,20,p.x-nw/2,p.y-nh/2,nw,nh,(mode==='menu'?10:16)*p.p);
  const face=ctx.createLinearGradient(0,p.y-nh,0,p.y+nh);face.addColorStop(0,isHold?'#eddaff':'#daedff');face.addColorStop(.25,color);face.addColorStop(.6,isHold?'#874ce1':'#3c6fcb');face.addColorStop(1,isHold?'#c898ff':'#94c7ff');
  polygon([{x:p.x-nw*.45,y:p.y-nh/2},{x:p.x+nw*.45,y:p.y-nh/2},{x:p.x+nw/2,y:p.y+nh/2},{x:p.x-nw/2,y:p.y+nh/2}],face,color);
  line({x:p.x-nw*.38,y:p.y-nh*.18},{x:p.x+nw*.38,y:p.y-nh*.18},'#ffffffa0',1);

}
const RGB={'#79b8ff':'121,184,255','#c898ff':'200,152,255'};
function burst(lane,color='#79b8ff',perfect=false){
  flashes[lane]=1;flashColor[lane]=RGB[color];const p=project(1,(lane+.5)/4),scale=Math.min(1.6,Math.max(.8,p.span/4/110));
  if(reducedMotion)return;
  ripples.push({lane,life:.45,color});flares.push({lane,life:.3,color,perfect});
  for(let i=0;i<(perfect?22:14);i++){const white=perfect&&i%3===0;particles.push({x:p.x+(Math.random()-.5)*p.span/8,y:p.y,vx:(Math.random()-.5)*260*scale,vy:(-Math.random()*300-60)*scale,life:.3+Math.random()*.25,color:white?'#ffffff':color,spark:true});}
}
// A missed note flashes its lane red.
function missed(lane){missFlashes[lane]=1;}
function announce(result,lane,error=0){
  const el=$('#judgment');el.dataset.result=result;el.textContent=t(result);
  // Off the beat, a small word says which way, so the player knows how to fix it.
  if((result==='great'||result==='good')&&Math.abs(error)>.03){const side=document.createElement('small');side.textContent=t(error<0?'early':'late');el.append(side);}
  el.style.color=({perfect:'#c898ff',great:'#79b8ff',good:'#b6a1ff',miss:'#ff7b9f'})[result];
  el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  if(result!=='miss')burst(lane,result==='perfect'?'#c898ff':'#79b8ff',result==='perfect');else missed(lane);
}
function judge(note,result,error){if(run.judge(note,result,error)){announce(result,note.lane,error);encourage(result);}updateHUD();}
// Cheers: a word of encouragement in the middle of the stage at combo
// milestones, long Perfect streaks, the song's drop, a comeback from low
// energy, and after a rough patch. One at a time: a milestone cuts in over a
// smaller cheer, and the drop and a comeback cut in over anything.
const MILESTONES={10:'cheerNice',25:'cheerGreat',50:'cheerAwesome',100:'cheerAmazing',150:'cheerFire',200:'cheerUnstoppable'};
let cheerUntil=0,cheerRank=0,perfectRun=0,missRun=0,lowEnergy=false,lastLevel=0;
function cheer(key,detail='',big=false,rank=big?3:1){
  const now=performance.now();if(now<cheerUntil&&rank<=cheerRank)return;cheerUntil=now+900;cheerRank=rank;
  const el=$('#cheer');el.querySelector('strong').textContent=t(key);el.querySelector('span').textContent=detail;
  el.classList.toggle('big',big);el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  if(big)navigator.vibrate?.(25);
  if(reducedMotion)return;
  const colors=['#c898ff','#79b8ff','#ffffff','#ffae9d'];
  for(let i=0;i<(big?56:28);i++){const a=Math.random()*Math.PI*2,v=90+Math.random()*(big?260:170);particles.push({x:width/2,y:height*.36,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.7-60,life:.6+Math.random()*.5,color:colors[i%4],size:2+Math.random()*2.5});}
}
function encourage(result){
  if(result==='miss'){perfectRun=0;if(++missRun===4)cheer('cheerKeepGoing');lowEnergy||=run.energy<25;return;}
  missRun=0;perfectRun=result==='perfect'?perfectRun+1:0;
  const combo=run.combo,milestone=MILESTONES[combo]??(combo>200&&combo%100===0?'cheerUnstoppable':null);
  if(milestone)return cheer(milestone,t('comboCount',{count:combo}),combo>=50,combo>=50?3:2);
  if(lowEnergy&&run.energy>=50){lowEnergy=false;return cheer('cheerComeback','',true);}
  if(perfectRun%20===0&&perfectRun)cheer('cheerSmooth',t('perfectStreak',{count:perfectRun}));
}
function updateHUD(){
  if(!run)return;
  if(lastScore!==run.score){$('#score').textContent=format(run.score);if(run.score>lastScore&&lastScore>=0)pop($('#score'));lastScore=run.score;}
  if(lastCombo!==run.combo){$('#combo').textContent=run.combo;$('#comboBox').classList.toggle('visible',run.combo>=3);if(run.combo>=3)pop($('#combo'));lastCombo=run.combo;}
  const e=Math.round(run.energy);if(e!==lastEnergy){$('#energyFill').style.width=e+'%';$('#energyFill').style.background=e<25?'#ff7b9f':'var(--brand-gradient)';$('#energyText').textContent=e+'%';lastEnergy=e;}
}
async function start(){
  if(mode==='playing'||mode==='countdown')return;
  const token=++session; closeModal();
  try{await audio.unlock();await prepare(track);}catch(e){showError();return;}
  if(token!==session)return;
  run=new Run(limitChart(track.recorded?makeAudioChart(track.analysis,difficulty):makeChart(track,difficulty),duration()),difficulty);syncSamples=[];sinceSync=0;cheerUntil=cheerRank=0;perfectRun=missRun=lastLevel=0;lowEnergy=false;$('#cheer').classList.remove('show');lastScore=lastCombo=lastEnergy=-1;keys.clear();pointers.clear();particles=[];ripples=[];flares=[];missFlashes=[0,0,0,0];lastCountdown=null;
  audio.start(track,track.recorded?travel()+.35:0,duration(),SONG_FADE);setMode('countdown');$('#pauseButton').disabled=false;$('#nextTrack').hidden=true;$('#trackButton').disabled=true;$('#playingBars').hidden=false;$('#countdown').hidden=false;$('#songProgress').style.width='0%';updateHUD();
}
function showError(){showDialog('error');}
function isLaneDown(lane){return keys.has(lane)||[...pointers.values()].some(p=>p.lane===lane);}
function press(lane){
  if(mode!=='playing')return;
  flashes[lane]=Math.max(flashes[lane],.7);flashColor[lane]=RGB['#79b8ff'];const t=tapTime();learnSync(lane,t);const n=run.candidate(lane,t);if(!n)return;
  const rating=gradeTiming(t-n.time,run.windows);
  if(n.type==='hold'){n.status='holding';n.holdGrade=rating;n.error=t-n.time;burst(lane,'#c898ff');}
  else judge(n,rating,t-n.time);
}
function release(lane){
  if(mode!=='playing'||isLaneDown(lane))return;
  const n=run.notes.find(n=>n.lane===lane&&n.status==='holding');
  if(n)judge(n,tapTime()>=n.time+n.duration-.22?n.holdGrade:'miss',n.error);
}
// Lanes lean inward toward the top, so a touch picks the lane under the finger
// on the drawn road rather than the straight column it falls in.
function laneAt(clientX,clientY){
  const r=stage.getBoundingClientRect(),p=Math.min(1.2,Math.max(0,((clientY-r.top)/height-.025)/.79)),span=width*(.28+.66*p);
  return Math.min(3,Math.max(0,Math.floor(((clientX-r.left-width/2)/span+.5)*4)));
}
$('#laneInputs').addEventListener('pointerdown',e=>{
  const button=e.target.closest('[data-lane]');if(!button||mode!=='playing')return;e.preventDefault();
  const lane=laneAt(e.clientX,e.clientY);button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{lane});press(lane);
});
function pointerEnd(e){const p=pointers.get(e.pointerId);if(p){pointers.delete(e.pointerId);release(p.lane);}}
$('#laneInputs').addEventListener('pointerup',pointerEnd);$('#laneInputs').addEventListener('pointercancel',pointerEnd);$('#laneInputs').addEventListener('lostpointercapture',pointerEnd);
const keyLanes={KeyD:0,KeyF:1,KeyJ:2,KeyK:3};
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();if(mode==='playing'||mode==='countdown')pause();else if(mode==='paused')resume();else if(modal.open)backDialog();return;}
  if(e.code==='Space'&&!modal.open&&!e.target.closest('button,a,input,select')){e.preventDefault();if(mode==='menu')trackMenu();return;}
  if(dialogType==='sync'&&modal.open&&(e.code in keyLanes||e.code==='Space')){e.preventDefault();if(!e.repeat)syncTap();return;}
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
  session++;audio.stop();closeModal();setMode('menu');run=null;keys.clear();pointers.clear();$('#countdown').hidden=true;$('#comboBox').classList.remove('visible');$('#judgment').classList.remove('show');$('#pauseButton').disabled=true;$('#nextTrack').hidden=false;$('#trackButton').disabled=false;$('#playingBars').hidden=true;$('#playingBars').classList.remove('paused-bars');$('#score').textContent='0000000';$('#energyFill').style.width='100%';$('#energyFill').style.background='var(--brand-gradient)';$('#judgment').textContent='';delete $('#judgment').dataset.result;$('#energyText').textContent='100%';$('#songProgress').style.width='0%';$('#best').textContent=format(readBest());
  trackMenu();
}
const RESULT_TIME=3;
function finish(reason='complete'){
  if(mode==='results')return;setMode('results');audio.stop();$('#pauseButton').disabled=true;$('#playingBars').hidden=true;$('#comboBox').classList.remove('visible');
  const prev=readBest(),newBest=run.score>prev;if(newBest)saveBest(run.score);$('#best').textContent=format(readBest());
  const accuracy=run.accuracy,grade=gradeAccuracy(accuracy);
  lastResult={reason,newBest,accuracy,grade};showDialog('results');
  // The result stays up for three seconds, then the song list comes back; Play again still works meanwhile.
  const shown=session;setTimeout(()=>{if(mode==='results'&&session===shown)goHome();},RESULT_TIME*1000);
}
function closeModal(){
  audio.stopClicks();
  if(modal.open)modal.close();dialogType='';
}
function showDialog(type){if(type!=='sync')audio.stopClicks();dialogType=type;renderDialog();if(!modal.open)modal.showModal();}
function help(){showDialog('help');}
function trackMenu(){if(mode==='menu')showDialog('tracks');}
// The song list is home: leaving a game lands there, and leaving the song
// list goes back to the start screen, so the stage is never left empty.
function backToSongs(){
  if(mode!=='menu')goHome();else trackMenu();
}
function dismiss(){
  if(!$('#startScreen').hidden||mode!=='menu')closeModal();
  else if(dialogType==='tracks')showStart();
  else trackMenu();
}
function backDialog(){
  if(dialogType==='sync')showDialog('difficulty');
  else if(dialogType==='difficulty')backToSongs();
  else if(dialogType==='results')goHome();
  else dismiss();
}
function renderDialog(){
  modal.dataset.dialog=dialogType;
  let content='';
  if(dialogType==='error')content=`<div class="eyebrow">${t('retry')}</div><h2>${t('oneMoreBeat')}</h2><p>${t('audioError')}</p><button class="primary-button" data-action="close">${t('gotIt')}</button>`;
  if(dialogType==='pause')content=`<h2><em>${t('paused')}</em></h2>${pauseDifficulty()}${syncRow()}<button class="primary-button" data-action="resume">${t('resume')} <span>▶</span></button><button class="secondary-button" data-action="restart">${t('restart')}</button><button class="secondary-button" data-action="home">${t('changeSong')}</button>`;
  if(dialogType==='help')content=`<h2>${t('tap')} <em>+ ${t('hold')}</em></h2><div class="tutorial-row"><div class="note-demo"><span class="note-icon tap"></span></div><div><strong>${t('tap')}</strong><p>${t('tapHelp')}</p></div></div><div class="tutorial-row"><div class="note-demo"><span class="note-icon hold"></span></div><div><strong>${t('hold')}</strong><p>${t('holdHelp')}</p></div></div><p class="key-hint">${t('keyboardHelp')}</p><button class="primary-button" data-action="close">${t('gotIt')}</button>`;
  if(dialogType==='tracks')content=songMenuContent();
  if(dialogType==='difficulty')content=difficultyContent();
  if(dialogType==='sync')content=`<h2>${t('syncTitle')}</h2><p class="sync-intro">${t('syncIntro')}</p><canvas class="sync-canvas" role="button" aria-label="${t('syncCanvas')}"></canvas><output class="sync-taps" role="status">${syncTapText()}</output>${syncRow()}<button class="primary-button" data-action="sync-done">${t('done')}</button>`;
  if(dialogType==='results'&&lastResult){
    const {reason,newBest,accuracy,grade}=lastResult;
    content=`<div class="eyebrow">${t(reason==='complete'?'complete':'outOfEnergy')}</div><h2>${t(reason==='complete'?'niceFlow':'tryAgain')}</h2><div class="result-grade">${grade}</div><div class="result-score">${format(run.score)}</div><div class="result-best">${newBest?'↗ '+t('newBest'):escapeHtml(trackTitle(track))}</div><div class="result-stats"><div><strong>${accuracy.toFixed(1)}%</strong><span>${t('accuracy')}</span></div><div><strong>${run.maxCombo}</strong><span>${t('maxCombo')}</span></div></div><div class="result-breakdown"><span>${run.counts.perfect} ${t('perfect')}</span><span>${run.counts.great+run.counts.good} ${t('goodGreat')}</span><span>${run.counts.miss} ${t('miss')}</span></div><button class="primary-button" data-action="restart">${t('playAgain')} <span>↗</span></button><button class="secondary-button" data-action="back-songs">${t('changeTrackAction')}</button><div class="result-timer" style="animation-duration:${RESULT_TIME}s" aria-hidden="true"></div>`;
  }
  const setup=dialogType==='tracks'||dialogType==='difficulty';
  const toolbar=setup?`<div class="setup-toolbar"><button class="setup-back" data-action="${dialogType==='tracks'?'close':'back-songs'}">← ${t('back')}</button><nav class="setup-steps" aria-label="${t('setupProgress')}"><span ${dialogType==='tracks'?'aria-current="step"':''}>${t('songStep')}</span><i aria-hidden="true">/</i><span ${dialogType==='difficulty'?'aria-current="step"':''}>${t('difficultyStep')}</span></nav><button class="language-button" data-language-toggle></button></div>`:`<div class="dialog-language"><button class="language-button" data-language-toggle></button></div>`;
  $('#modalContent').innerHTML=toolbar+content;
  updateLanguageButtons();
}
$('#modalContent').addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='start-game'&&dialogType==='difficulty')start();
  if(action==='back-songs')backToSongs();
  if(action==='sync-test')openSyncTest();if(action==='sync-done')showDialog('difficulty');
  if(action==='close')dismiss();if(action==='resume')resume();if(action==='restart')start();if(action==='home')goHome();
  const id=e.target.closest('[data-track]')?.dataset.track;
  if(id){
    const item=builtInTracks.find(entry=>entry.id===id);
    setTrack(item);prepare(item).catch(()=>{});showDialog('difficulty');
  }
  const sync=e.target.closest('[data-sync]')?.dataset.sync;
  if(sync){setSync(audio.offset+Number(sync)*.01);$('#modalContent .sync-row output').textContent=syncText();return;}
  const choice=e.target.closest('[data-difficulty]')?.dataset.difficulty;
  if(choice&&dialogType==='pause'){if(choice!==difficulty){setDifficulty(choice);start();}return;}
  if(choice){setDifficulty(choice);renderDialog();$(`[data-difficulty="${choice}"]`).focus();}
});
modal.addEventListener('cancel',e=>{e.preventDefault();if(dialogType==='pause')resume();else backDialog();});
// The game opens on a start screen; PLAY there goes full screen and leads straight to choosing a song.
// The song list opens once full screen is on, so it stays above the page. iPhone Safari has no full
// screen for pages; there the game already fills the screen.
let startTimer=0;
async function enterFullscreen(){
  if(document.fullscreenElement||!document.documentElement.requestFullscreen)return;
  try{await document.documentElement.requestFullscreen();await screen.orientation?.lock?.('landscape');}catch{}
}
function leaveStart(){const screen=$('#startScreen');if(!screen||screen.hidden)return;screen.classList.add('leaving');document.body.classList.remove('at-start');startTimer=setTimeout(()=>{screen.hidden=true;},350);enterFullscreen().then(trackMenu);}
function showStart(){clearTimeout(startTimer);closeModal();const screen=$('#startScreen');screen.hidden=false;screen.classList.remove('leaving');document.body.classList.add('at-start');$('#startButton').focus({preventScroll:true});}
document.body.classList.add('at-start');$('#startButton').addEventListener('click',leaveStart);$('#startButton').focus({preventScroll:true});
$('#pauseButton').addEventListener('click',pause);$('#helpButton').addEventListener('click',help);$('#trackButton').addEventListener('click',trackMenu);
$('#soundButton').addEventListener('click',()=>{audio.setMuted(!audio.muted);syncSoundLabel();$('#soundButton').style.color=audio.muted?'#ff7b9f':'';$('#soundButton').innerHTML=audio.muted?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6M22 9l-6 6"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';});
$('#fullscreenButton').addEventListener('click',async()=>{if(!document.fullscreenElement)return enterFullscreen();try{await document.exitFullscreen();screen.orientation?.unlock?.();}catch{}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>{if(mode==='playing'||mode==='countdown')pause();});

function frame(now){
  const dt=mode==='paused'?0:Math.min(.05,(now-lastFrame)/1000||.016);lastFrame=now;visualTime+=dt;
  const playing=mode==='playing'||mode==='countdown',t=playing||mode==='paused'?audio.time:now/1000;
  highway(t);
  if(run){
    if(playing){
      if(t<0){const count=Math.min(3,Math.ceil(-t/(60/track.bpm)));$('#countdown').hidden=false;if(count!==lastCountdown){lastCountdown=count;$('#countdown').textContent=count;pop($('#countdown'));}}
      else if(mode==='countdown'){setMode('playing');$('#countdown').hidden=true;}
      for(const n of run.notes){
        if(n.status==='pending'&&t-tapDelay>n.time+run.windows.miss)judge(n,'miss');
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
    for(let i=run.notes.length-1;i>=0;i--){const n=run.notes[i];if(n.status==='hit')continue;if(n.status==='miss'){const f=1-(n.time-t)/travel();if(n.type==='tap'&&f>.85&&f<1.16){ctx.globalAlpha=.6*Math.min(1,(1.16-f)/.12);noteBlock(n,f,false,true);ctx.globalAlpha=1;}continue;}const f=1-(n.time-t)/travel();if(n.status==='holding'){const remaining=n.time+n.duration-t;noteBlock({...n,duration:Math.max(0,remaining),progress:1-remaining/n.duration},1,true);}else noteBlock(n,f);}
  }
  for(let i=0;i<4;i++){flashes[i]=Math.max(0,flashes[i]-dt*3.2);missFlashes[i]=Math.max(0,missFlashes[i]-dt*3);}
  ripples=ripples.filter(r=>r.life>0);
  for(const r of ripples){
    r.life-=dt;const p=project(1,(r.lane+.5)/4),progress=1-r.life/.45;
    ctx.globalAlpha=Math.max(0,r.life/.45);ctx.strokeStyle=r.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(p.x,p.y,9+progress*p.span*.18,3+progress*16,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.globalAlpha=1;ctx.globalCompositeOperation='lighter';
  flares=flares.filter(r=>r.life>0);
  for(const r of flares){
    r.life-=dt;const p=project(1,(r.lane+.5)/4),k=1-Math.max(0,r.life)/.3,w=p.span/4*(.7+k*(r.perfect?.9:.6));
    ctx.globalAlpha=(1-k)*(r.perfect?1:.8);ctx.drawImage(flareSprite(r.color),p.x-w,p.y-w*.45,w*2,w*.9);
  }
  ctx.globalAlpha=1;
  particles=particles.filter(p=>p.life>0);
  for(const p of particles){
    p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.spark?620:170)*dt;ctx.globalAlpha=Math.min(1,p.life*3);
    if(p.spark){ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();}
    else{ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size||2,p.size||2);}
  }
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if(dialogType==='sync'&&modal.open)drawSyncTest();
  requestAnimationFrame(frame);
}
applyLanguage();syncOrientation();resize();requestAnimationFrame(frame);
