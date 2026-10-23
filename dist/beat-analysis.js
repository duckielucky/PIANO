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
  const waveform=Array.from({length:96},(_,i)=>{
    let value=0;for(let j=Math.floor(i*frameCount/96);j<Math.floor((i+1)*frameCount/96);j++)value=Math.max(value,energy[j]);
    return value/maxEnergy;
  });
  onProgress(1);
  return {bpm,confidence,weakBeat,events,waveform,duration};
}

export function makeAudioChart(analysis,difficulty='easy'){
  const beat=60/analysis.bpm,gap=difficulty==='easy'?Math.max(.58,beat*1.65):difficulty==='hard'?Math.max(.18,beat*.45):Math.max(.3,beat*.85);
  const selected=[];
  for(const event of analysis.events){
    if(event.time<.04||event.time>analysis.duration-.25)continue;
    if(!selected.length||event.time-selected.at(-1).time>=gap)selected.push(event);
  }
  const phrase=[0,2,1,3,2,0,3,1];
  return selected.map((event,i)=>{
    const next=selected[i+1]?.time??analysis.duration,space=next-event.time;
    const holdLength=Math.min(beat,event.sustain,space-.24,analysis.duration-event.time-.1);
    const hold=i%7===4&&holdLength>=.3;
    return {id:i,lane:(phrase[i%phrase.length]+event.band)%4,time:event.time,type:hold?'hold':'tap',duration:hold?holdLength:0,status:'pending'};
  });
}
