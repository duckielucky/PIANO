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

export function makeAudioChart(analysis,difficulty='easy'){
  const {bpm,beats}=trackBeats(analysis), beat=60/bpm, events=analysis.events||[];
  // A note sits on a beat, and on the real sound that marks it: the strongest
  // attack within a short window of the beat. A beat with no sound gets no note.
  const near=(time,window)=>{
    let pick=null;
    for(const event of events){
      if(event.time<time-window)continue;if(event.time>time+window)break;
      if(!pick||event.strength>pick.strength*1.25||(event.strength>=pick.strength*.8&&Math.abs(event.time-time)<Math.abs(pick.time-time)))pick=event;
    }
    return pick;
  };
  // Which beat of the bar is the downbeat: the one the bass lands on most.
  const bassOn=[0,0,0,0];
  beats.forEach((time,k)=>{const e=near(time,.07);if(e&&e.band===0)bassOn[k%4]+=e.strength;});
  const downbeat=bassOn.indexOf(Math.max(...bassOn)), half=Math.max(.04,Math.min(.07,beat*.12));
  const slots=[];
  beats.forEach((time,k)=>{
    const bar=((k-downbeat)%4+4)%4;
    if(difficulty==='easy'&&bar%2)return;
    slots.push(time);
    if(difficulty==='hard'&&beats[k+1])slots.push((time+beats[k+1])/2);
  });
  const gap=difficulty==='easy'?.58:difficulty==='hard'?.18:.3;
  const selected=[];
  for(const slot of slots){
    const isHalf=difficulty==='hard'&&!beats.some(b=>Math.abs(b-slot)<1e-6);
    const event=near(slot,isHalf?.05:half);
    if(!event||event.time<.04||event.time>analysis.duration-.25)continue;
    if(selected.length&&(event===selected.at(-1)||event.time-selected.at(-1).time<gap))continue;
    selected.push(event);
  }
  const phrase=[0,2,1,3,2,0,3,1];
  return selected.map((event,i)=>{
    const next=selected[i+1]?.time??analysis.duration,space=next-event.time;
    const holdLength=Math.min(beat,event.sustain??0,space-.24,analysis.duration-event.time-.1);
    const hold=i%7===4&&holdLength>=.3;
    return {id:i,lane:(phrase[i%phrase.length]+(event.band??1))%4,time:event.time,type:hold?'hold':'tap',duration:hold?holdLength:0,status:'pending'};
  });
}
