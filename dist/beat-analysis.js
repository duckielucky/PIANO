// Audio-derived onsets, not a fixed/random chart. Runs in a worker in the browser.
export function analyzePcm(channels, sampleRate, onProgress = () => {}) {
  const length=channels[0]?.length||0, hop=Math.max(1,Math.round(sampleRate*.01));
  const frameCount=Math.ceil(length/hop), dt=hop/sampleRate;
  const bands=[new Float32Array(frameCount),new Float32Array(frameCount),new Float32Array(frameCount)];
  const energy=new Float32Array(frameCount), lowState=channels.map(()=>0), midState=channels.map(()=>0);
  const lowAlpha=1-Math.exp(-2*Math.PI*180/sampleRate), midAlpha=1-Math.exp(-2*Math.PI*1800/sampleRate);
  // Sum channel powers separately so opposite-phase stereo never cancels a beat.
  for(let frame=0;frame<frameCount;frame++){
    const end=Math.min(length,(frame+1)*hop), begin=frame*hop;
    for(let ch=0;ch<channels.length;ch++){
      const pcm=channels[ch];let low=lowState[ch],mid=midState[ch];
      for(let i=begin;i<end;i++){
        const x=pcm[i];low+=lowAlpha*(x-low);mid+=midAlpha*(x-mid);
        bands[0][frame]+=low*low;bands[1][frame]+=(mid-low)**2;bands[2][frame]+=(x-mid)**2;energy[frame]+=x*x;
      }
      lowState[ch]=low;midState[ch]=mid;
    }
    const count=Math.max(1,(end-begin)*channels.length);
    energy[frame]=Math.sqrt(energy[frame]/count);
    for(const band of bands)band[frame]=Math.sqrt(band[frame]/count);
    if(frame%1000===0)onProgress(.65*frame/frameCount);
  }
  let maxEnergy=0;for(const value of energy)maxEnergy=Math.max(maxEnergy,value);
  if(maxEnergy<.0001)throw new Error('silentSong');
  const flux=new Float32Array(frameCount), bandFlux=bands.map(()=>new Float32Array(frameCount));
  for(let i=1;i<frameCount;i++)for(let band=0;band<3;band++){
    const baseline=(bands[band][Math.max(0,i-1)]+bands[band][Math.max(0,i-2)]+bands[band][Math.max(0,i-3)])/3;
    const rise=Math.max(0,bands[band][i]-baseline);
    bandFlux[band][i]=rise;
    flux[i]+=rise*[1.45,1,.8][band];
  }
  const prefix=new Float64Array(frameCount+1);let maxFlux=0;
  for(let i=0;i<frameCount;i++){prefix[i+1]=prefix[i]+flux[i];maxFlux=Math.max(maxFlux,flux[i]);}
  const onsets=[];
  for(let i=1;i<frameCount-1;i++){
    const left=Math.max(0,i-45),right=Math.min(frameCount,i+46),local=(prefix[right]-prefix[left])/(right-left);
    if(flux[i]<Math.max(local*1.65,maxFlux*.025,.00002)||energy[i]<maxEnergy*.008||flux[i]<flux[i-1]||flux[i]<=flux[i+1])continue;
    let band=0;for(let b=1;b<3;b++)if(bandFlux[b][i]>bandFlux[band][i])band=b;
    // Timestamp the beginning of the attack, rather than its louder peak.
    let attack=i;while(attack>Math.max(0,i-4)&&energy[attack-1]<energy[attack]&&energy[attack-1]>energy[i]*.12)attack--;
    let tail=i;while(tail<Math.min(frameCount-1,i+120)&&energy[tail+1]>Math.max(energy[i]*.28,maxEnergy*.012))tail++;
    const onset={time:attack*dt,strength:flux[i]/Math.max(maxFlux,.00001),band,sustain:(tail-i)*dt};
    const previous=onsets.at(-1);
    if(previous&&onset.time-previous.time<.12){if(onset.strength>previous.strength)onsets[onsets.length-1]=onset;}
    else onsets.push(onset);
  }
  onProgress(.75);
  // Inter-onset tempo votes. Actual note timestamps stay on detected attacks,
  // allowing tempo changes without drifting onto a synthetic BPM grid.
  const votes=new Float64Array(181);
  for(let i=0;i<onsets.length;i++)for(let j=i+1;j<Math.min(onsets.length,i+9);j++){
    const gap=onsets[j].time-onsets[i].time;if(gap>3)break;
    let bpm=60/gap;while(bpm<70)bpm*=2;while(bpm>180)bpm/=2;
    const center=Math.round(bpm),weight=Math.sqrt(onsets[i].strength*onsets[j].strength)/(j-i);
    for(let d=-2;d<=2;d++)if(center+d>=70&&center+d<=180)votes[center+d]+=weight*(3-Math.abs(d));
  }
  let bpm=120;for(let b=70;b<=180;b++)if(votes[b]>votes[bpm])bpm=b;
  const total=votes.reduce((a,b)=>a+b,0),confidence=total?Math.min(1,votes[bpm]*8/total):0;
  const duration=length/sampleRate, weakBeat=onsets.length<Math.max(5,duration/5)||confidence<.12;
  let events=onsets;
  // Beatless/ambient music still gets a playable chart, explicitly labelled as
  // a gentle fallback; skip silence rather than inventing beats in silent gaps.
  if(onsets.length<Math.max(3,duration/12)){
    events=[];
    for(let time=.4;time<duration-.3;time+=.5){
      if(energy[Math.min(frameCount-1,Math.floor(time/dt))]>maxEnergy*.025)events.push({time,strength:.4,band:1,sustain:.35});
    }
    bpm=120;
  }
  // The tempo shown for the song is the one its notes follow.
  if(events!==onsets||!weakBeat)bpm=Math.round(trackBeats({events,duration}).bpm);
  const waveform=Array.from({length:96},(_,i)=>{
    let value=0;for(let j=Math.floor(i*frameCount/96);j<Math.floor((i+1)*frameCount/96);j++)value=Math.max(value,energy[j]);
    return value/maxEnergy;
  });
  onProgress(1);
  return {bpm,confidence,weakBeat,events,waveform,duration};
}

// The beat itself: a steady pulse fitted through the detected attacks. The
// tempo comes from how the attacks repeat (autocorrelation, leaning toward
// everyday tempos so a song is not read at half or double speed), and the
// beats are then threaded through the attacks by dynamic programming, so the
// grid keeps to the tempo but bends with a live drummer.
const FRAME=.01;
export function trackBeats(analysis){
  const events=analysis.events||[], duration=analysis.duration||((events.at(-1)?.time||0)+1);
  const n=Math.max(2,Math.ceil(duration/FRAME)+2), env=new Float32Array(n);
  const spread=[.25,.6,1,.6,.25];
  for(const event of events){
    const at=Math.round(event.time/FRAME);
    spread.forEach((w,i)=>{const k=at+i-2;if(k>=0&&k<n)env[k]+=w*Math.max(.05,event.strength??1);});
  }
  // Tempo: the lag at which the pulse best repeats, 70–180 BPM.
  const minLag=Math.round(60/180/FRAME),maxLag=Math.round(60/70/FRAME);
  let bestLag=Math.round(60/120/FRAME),bestScore=-1;const score=new Float64Array(maxLag+2);
  for(let lag=minLag;lag<=maxLag+1;lag++){
    let sum=0;for(let i=0;i+lag<n;i++)sum+=env[i]*env[i+lag];
    const bpm=60/(lag*FRAME),prior=Math.exp(-.5*(Math.log2(bpm/115)/.9)**2);
    score[lag]=sum*prior;
  }
  for(let lag=minLag;lag<=maxLag;lag++)if(score[lag]>bestScore){bestScore=score[lag];bestLag=lag;}
  let period=bestLag;
  if(bestLag>minLag&&bestLag<maxLag){const a=score[bestLag-1],b=score[bestLag],c=score[bestLag+1],d=a-2*b+c;if(d<0)period=bestLag+.5*(a-c)/d;}
  // Beats: each frame's best score is its own pulse plus the best earlier beat
  // one period back, penalised for stretching or squeezing the period.
  const tight=100, best=new Float64Array(n), back=new Int32Array(n).fill(-1);
  let mean=0,count=0;for(const v of env)if(v>0){mean+=v;count++;}mean=count?mean/count:1;
  for(let i=0;i<n;i++){
    const local=env[i]/mean;let top=0,from=-1;
    const lo=Math.max(0,Math.round(i-2*period)),hi=Math.round(i-period/2);
    for(let j=lo;j<=hi;j++){const v=best[j]-tight*Math.log((i-j)/period)**2;if(v>top){top=v;from=j;}}
    best[i]=local+top;back[i]=from;
  }
  let end=n-1;for(let i=Math.max(0,Math.round(n-period));i<n;i++)if(best[i]>best[end])end=i;
  const frames=[];for(let i=end;i>=0;i=back[i])frames.push(i);
  frames.reverse();
  return {bpm:60/(period*FRAME),beats:frames.map(f=>f*FRAME)};
}

// Events are in time order, so a binary search finds the first one at or after a time.
function firstFrom(events,time){let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].time<time)lo=mid+1;else hi=mid;}return lo;}
// The real sound that marks a moment: the strongest attack within a short window of it.
function nearFinder(events){
  return (time,window)=>{
    let pick=null;
    for(let i=firstFrom(events,time-window);i<events.length&&events[i].time<=time+window;i++){
      const event=events[i];
      if(!pick||event.strength>pick.strength*1.25||(event.strength>=pick.strength*.8&&Math.abs(event.time-time)<Math.abs(pick.time-time)))pick=event;
    }
    return pick;
  };
}

// The song's map, beat by beat: where each beat falls, which beat starts the
// bar, and how hard each bar hits (0 calm, 1 groove, 2 peak) compared with the
// rest of the same song. Charts and the highway's pulse both follow it.
export function beatMap(analysis){
  const {bpm,beats}=trackBeats(analysis), beat=60/bpm, events=analysis.events||[], near=nearFinder(events);
  // The downbeat is the beat of the bar the bass lands on most.
  const bassOn=[0,0,0,0];
  beats.forEach((time,k)=>{const e=near(time,.07);if(e&&e.band===0)bassOn[k%4]+=e.strength;});
  const downbeat=bassOn.indexOf(Math.max(...bassOn)), barOf=k=>Math.floor((k-downbeat)/4);
  // How hard a bar hits: the attack strength heard around each of its beats.
  const totals=new Map();
  beats.forEach((time,k)=>{
    let sum=0;for(let i=firstFrom(events,time-2*beat);i<events.length&&events[i].time<=time+2*beat;i++)sum+=events[i].strength;
    const bar=totals.get(barOf(k))||{sum:0,count:0};bar.sum+=sum;bar.count++;totals.set(barOf(k),bar);
  });
  const sorted=[...totals.values()].map(bar=>bar.sum/bar.count).sort((a,b)=>a-b), q=p=>sorted[Math.floor(p*(sorted.length-1))]??0;
  // Compared with the song's own quiet and loud ends, so a long verse stays calm and a long chorus stays a peak.
  const floor=q(.1), roof=q(.9), calm=floor+(roof-floor)*.35, peak=floor+(roof-floor)*.68, even=roof-floor<q(.5)*.25;
  const levels=beats.map((_,k)=>{const bar=totals.get(barOf(k)),v=bar.sum/bar.count;return even?1:v<=calm?0:v>=peak?2:1;});
  return {bpm,beat,beats,levels,downbeat};
}

// How each difficulty fills a beat at each level: [play every n-th beat, notes per beat].
const PLAN={easy:[[4,1],[2,1],[1,1]],normal:[[2,1],[1,1],[1,2]],hard:[[1,1],[1,2],[1,4]]};
const GAP={easy:.45,normal:.2,hard:.11};

export function makeAudioChart(analysis,difficulty='easy'){
  const map=beatMap(analysis), {beat,beats,levels,downbeat}=map, events=analysis.events||[], near=nearFinder(events);
  const plan=PLAN[difficulty]||PLAN.easy, gap=GAP[difficulty]||GAP.easy, easy=difficulty==='easy';
  const strengths=events.map(e=>e.strength).sort((a,b)=>a-b), strong=p=>strengths[Math.floor(p*(strengths.length-1))]??0;
  const accent=strong(.5), sharp=strong(.6), end=analysis.duration-.25;
  const window=Math.max(.04,Math.min(.07,beat*.12)), heard=beats.map(time=>!!near(time,window));
  // Steady: at least three of the four beats around this one have their own attack.
  const steady=k=>[k-2,k-1,k+1,k+2].filter(j=>heard[j]).length>=3;
  // Every note sits on a beat, or a step of one, and on the real sound there;
  // calm bars thin out, peak bars add off-beats, so the chart rises and falls with the song.
  const picked=[];
  beats.forEach((time,k)=>{
    const level=levels[k], [every,steps]=plan[level], bar=((k-downbeat)%4+4)%4;
    if(bar%every)return;
    const span=(beats[k+1]??time+beat)-time;
    for(let step=0;step<steps;step++){
      const slot=time+span*step/steps, onBeat=step===0;
      let event=near(slot,onBeat?Math.max(.04,Math.min(.07,beat*.12)):Math.min(.05,span/steps*.3));
      // A soft beat inside a steady groove still gets its note, right on the beat.
      if(!event&&onBeat&&level>0&&steady(k))event={time:slot,strength:0,band:1,sustain:0};
      if(!event||event.time<.04||event.time>end)continue;
      if(steps===4&&step%2&&event.strength<sharp)continue;
      const last=picked.at(-1);
      if(last&&(event===last.event||event.time-last.event.time<gap))continue;
      picked.push({event,k,bar,level,onBeat});
    }
  });
  // Big hits get a second lane: the first downbeat of a peak, then downbeats
  // (and on Expert, strong bass on beat 3) while the peak lasts.
  picked.forEach(note=>{
    const {event,k,bar,level,onBeat}=note;
    if(easy||level<2||!onBeat||event.strength<accent)return;
    const drop=levels[Math.max(0,k-4)]<2, barIndex=Math.floor((k-downbeat)/4);
    note.chord=bar===0&&(drop||difficulty==='hard'||barIndex%2===0)||difficulty==='hard'&&bar===2&&event.band===0;
  });
  // In a calm bar, a sustained first beat becomes a long note that takes over the beat after it.
  if(!easy)for(let i=0;i<picked.length-1;i++){
    const note=picked[i];
    if(note.level===0&&note.bar===0&&note.onBeat&&!note.chord&&(note.event.sustain??0)>=.75*beat&&picked[i+1].event.time-note.event.time<1.1*beat)picked.splice(i+1,1);
  }
  // Long notes ride sustained sounds when there is room before the next note.
  let sinceHold=9;
  picked.forEach((note,i)=>{
    const room=(picked[i+1]?.event.time??analysis.duration)-note.event.time;
    const length=Math.min(2*beat,room-(easy?.4:.25),analysis.duration-note.event.time-.1);
    note.hold=!note.chord&&room>=1.5*beat&&(note.event.sustain??0)>=.75*beat&&(note.level===0?note.bar===0||sinceHold>=2:sinceHold>=4)&&length>=Math.max(.3,.6*beat);
    note.length=note.hold?length:0;sinceHold=note.hold?0:sinceHold+1;
  });
  // Lanes follow the melody's direction: a higher sound steps right, a lower
  // one steps left, bouncing off the edges so every lane gets used. Quick runs
  // climb one lane at a time like stairs, and no lane is hit twice in a row.
  const free=[-9,-9,-9,-9], notes=[];let lane=1,last=[],before=-1,dir=1,band=1,previous=-9;
  picked.forEach(({event,chord,hold,length},i)=>{
    const time=event.time, fast=time-previous<beat*.6, open=l=>l>=0&&l<4&&!last.includes(l)&&time-free[l]>=.18;
    const pitch=event.strength?event.band??1:band;
    if(pitch!==band)dir=pitch>band?1:-1;
    const step=fast||i%3!==2?1:2;
    let pick=lane+dir*step;
    if(pick<0||pick>3)pick=lane+dir;
    if(pick<0||pick>3){dir=-dir;pick=lane+dir*step;}
    // Back-and-forth between the same two lanes moves on to a third.
    if(pick===before&&[0,1,2,3].some(l=>open(l)&&l!==before))pick=[0,1,2,3].filter(l=>open(l)&&l!==before).sort((a,b)=>Math.abs(a-pick)-Math.abs(b-pick))[0];
    if(!open(pick))pick=[0,1,2,3].filter(open).sort((a,b)=>Math.abs(a-pick)-Math.abs(b-pick))[0]??pick;
    const add=l=>{notes.push({lane:l,time,type:hold?'hold':'tap',duration:hold?length:0,status:'pending'});free[l]=time+(hold?length:0);};
    add(pick);
    if(chord){const second=[0,1,2,3].filter(l=>l!==pick&&!last.includes(l)&&time-free[l]>=.18).sort((a,b)=>Math.abs(b-pick)-Math.abs(a-pick))[0];last=[pick];if(second!==undefined){add(second);last.push(second);}}else last=[pick];
    if(pick!==lane)dir=pick>lane?1:-1;
    before=lane;lane=pick;band=pitch;previous=time;
  });
  return notes.sort((a,b)=>a.time-b.time||a.lane-b.lane).map((note,id)=>({id,...note}));
}
