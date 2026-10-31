// Audio-derived onsets, not a fixed/random chart. Runs in a worker in the browser.
// Saved songs analysed by an older version are analysed again when picked.
export const ANALYSIS_VERSION=3;
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
    if(frame%1000===0)onProgress(.4*frame/frameCount);
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
  onProgress(.45);
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
  // The beat grid, then lined up with the song's own attacks: the pulse peaks a
  // little before the sound is heard, so the grid moves by the typical gap.
  const pulse=pulseBeats(spectralFlux(channels,sampleRate,p=>onProgress(.45+.35*p))), near=nearFinder(events);
  const gaps=pulse.beats.map(time=>near(time,.06)?.time-time).filter(Number.isFinite).sort((a,b)=>a-b);
  const shift=Math.max(-.04,Math.min(.04,gaps[gaps.length>>1]??0));
  const beats=pulse.beats.map(time=>Math.round((time+shift)*1000)/1000).filter(time=>time>=0&&time<duration);
  // The tempo shown for the song is the one its notes follow.
  const tempo=pulse.bpm;bpm=Math.round(tempo);
  const melody=melodyTrack(channels,sampleRate,p=>onProgress(.8+.17*p));
  for(const event of events)event.pitch=pitchAt(melody,event.time);
  const key=songKey(channels,sampleRate);
  const waveform=Array.from({length:96},(_,i)=>{
    let value=0;for(let j=Math.floor(i*frameCount/96);j<Math.floor((i+1)*frameCount/96);j++)value=Math.max(value,energy[j]);
    return value/maxEnergy;
  });
  onProgress(1);
  return {version:ANALYSIS_VERSION,bpm,tempo,beats,confidence,weakBeat,events,key,melody,waveform,duration};
}

// The beat itself. The song's sound is split into 48 bands from 40 Hz to
// 5 kHz, 100 times a second, and every rise in any band counts towards the
// pulse (spectral flux), so drums, bass, chords and voice all mark the beat.
// The tempo is how that pulse repeats, leaning toward everyday tempos around
// 120 BPM so a song is not read at half or double speed. The beats are then
// threaded through the strongest moments by dynamic programming, which keeps
// the tempo steady but lets it bend with a live drummer.
const FRAME=.01, FFT_SIZE=1024, BANDS=48;
// Bit-reversal order and twiddle factors are worked out once per FFT size.
const fftTables=new Map();
function tables(n){
  let t=fftTables.get(n);
  if(!t){
    const rev=new Uint32Array(n),cos=new Float64Array(n/2),sin=new Float64Array(n/2);
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;rev[i]=j;}
    for(let k=0;k<n/2;k++){cos[k]=Math.cos(-2*Math.PI*k/n);sin[k]=Math.sin(-2*Math.PI*k/n);}
    fftTables.set(n,t={rev,cos,sin});
  }
  return t;
}
function fft(re,im){
  const n=re.length,{rev,cos,sin}=tables(n);
  for(let i=1;i<n;i++){const j=rev[i];if(i<j){let v=re[i];re[i]=re[j];re[j]=v;v=im[i];im[i]=im[j];im[j]=v;}}
  for(let len=2;len<=n;len<<=1){
    const half=len>>1,step=n/len;
    for(let i=0;i<n;i+=len)for(let k=0;k<half;k++){const a=i+k,b=a+half,wr=cos[k*step],wi=sin[k*step],tr=re[b]*wr-im[b]*wi,ti=re[b]*wi+im[b]*wr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;}
  }
}
// Two channels share one FFT: left as the real part, right as the imaginary
// part. The sum of their powers at bin k is then (|Z[k]|^2+|Z[n-k]|^2)/2, so
// stereo costs no more than mono and the channels are still measured apart.
function channelPower(channels,begin,length,window,re,im,out){
  const n=re.length,size=window.length;out.fill(0);
  for(let c=0;c<channels.length;c+=2){
    const left=channels[c],right=channels[c+1];re.fill(0);im.fill(0);
    for(let i=0;i<size;i++){const k=begin+i;if(k>=0&&k<length){re[i]=left[k]*window[i];if(right)im[i]=right[k]*window[i];}}
    fft(re,im);
    for(let k=0;k<out.length;k++){const m=(n-k)&(n-1);out[k]+=(re[k]*re[k]+im[k]*im[k]+re[m]*re[m]+im[m]*im[m])/2;}
  }
  return out;
}
export function spectralFlux(channels,sampleRate,onProgress=()=>{}){
  const length=channels[0]?.length||0, hop=sampleRate*FRAME, frames=Math.max(1,Math.floor(length/hop));
  const window=Float32Array.from({length:FFT_SIZE},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/FFT_SIZE));
  const top=Math.min(5000,sampleRate*.475), edges=Array.from({length:BANDS+1},(_,i)=>Math.round(40*Math.pow(top/40,i/BANDS)/sampleRate*FFT_SIZE));
  const power=new Float64Array(frames*BANDS), re=new Float64Array(FFT_SIZE), im=new Float64Array(FFT_SIZE), bins=new Float64Array(FFT_SIZE/2);let loudest=1e-12;
  for(let t=0;t<frames;t++){
    // Each channel is measured on its own, so opposite-phase stereo never cancels.
    channelPower(channels,Math.round(t*hop)-FFT_SIZE/2,length,window,re,im,bins);
    for(let b=0;b<BANDS;b++){const from=edges[b],to=Math.max(from+1,edges[b+1]);let sum=0;for(let k=from;k<to;k++)sum+=bins[k];power[t*BANDS+b]=sum;}
    for(let b=0;b<BANDS;b++)loudest=Math.max(loudest,power[t*BANDS+b]);
    if(t%2000===0)onProgress(.8*t/frames);
  }
  const floor=loudest*1e-8;
  for(let i=0;i<power.length;i++)power[i]=10*Math.log10(Math.max(floor,power[i]));
  // A rise counts against the loudest neighbouring band two frames earlier, so vibrato and slides don't read as hits.
  const env=new Float32Array(frames);
  for(let t=2;t<frames;t++){
    let sum=0;
    for(let b=0;b<BANDS;b++){const p=(t-2)*BANDS;sum+=Math.max(0,power[t*BANDS+b]-Math.max(power[p+Math.max(0,b-1)],power[p+b],power[p+Math.min(BANDS-1,b+1)]));}
    env[t]=sum/BANDS;
  }
  onProgress(1);
  return env;
}
export function pulseBeats(pulse){
  const n=pulse.length;let mean=0;for(const v of pulse)mean+=v;mean/=Math.max(1,n);
  let spread=0;for(const v of pulse)spread+=(v-mean)**2;spread=Math.sqrt(spread/Math.max(1,n))||1;
  const env=Float32Array.from(pulse,v=>v/spread);
  // Tempo: the strongest repeat between 50 and 220 BPM, weighted toward 120.
  const minLag=Math.round(60/220/FRAME),maxLag=Math.round(60/50/FRAME),repeat=new Float64Array(maxLag+2);
  for(let lag=minLag;lag<=maxLag+1;lag++){let sum=0;for(let i=0;i+lag<n;i++)sum+=env[i]*env[i+lag];repeat[lag]=sum/Math.max(1,n-lag);}
  let bestLag=Math.round(60/120/FRAME),bestScore=-Infinity;
  for(let lag=minLag+1;lag<maxLag;lag++){
    if(repeat[lag]<repeat[lag-1]||repeat[lag]<repeat[lag+1])continue;
    const bpm=60/(lag*FRAME),score=repeat[lag]*Math.exp(-.5*Math.log2(bpm/120)**2);
    if(score>bestScore){bestScore=score;bestLag=lag;}
  }
  let period=bestLag;
  {const a=repeat[bestLag-1],b=repeat[bestLag],c=repeat[bestLag+1],d=a-2*b+c;if(d<0)period=bestLag+.5*(a-c)/d;}
  // Beats: each frame scores its own (lightly smoothed) pulse plus the best
  // beat one period earlier, penalised for stretching or squeezing the period.
  const sigma=period/32,width=Math.ceil(3*sigma),local=new Float64Array(n);
  for(let i=0;i<n;i++){let sum=0;for(let j=-width;j<=width;j++){const q=i+j;if(q>=0&&q<n)sum+=env[q]*Math.exp(-.5*(j/sigma)**2);}local[i]=sum;}
  const tight=1000,best=new Float64Array(n),back=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){
    let top=0,from=-1;
    for(let j=Math.max(0,Math.round(i-2*period));j<=Math.round(i-period/2);j++){const v=best[j]-tight*Math.log((i-j)/period)**2;if(v>top){top=v;from=j;}}
    best[i]=local[i]+top;back[i]=from;
  }
  let end=n-1;for(let i=Math.max(0,Math.round(n-period));i<n;i++)if(best[i]>best[end])end=i;
  const frames=[];for(let i=end;i>=0;i=back[i])frames.push(i);
  frames.reverse();
  return {bpm:60/(period*FRAME),beats:frames.map(f=>f*FRAME)};
}
// The notes. Just after each attack the sound is split into its pitches, and the
// pitch whose harmonics ring loudest (usually the singer or the lead) is that
// note's pitch, in semitones (MIDI numbers: 60 is middle C). Drum hits have no
// clear pitch and stay unpitched. Across the whole song the same pitches, folded
// into one octave, give its key.
const PITCH_SIZE=4096, PITCH_WINDOW=1024, LOW_NOTE=48, HIGH_NOTE=84, HARMONICS=10;
const hz=note=>440*Math.pow(2,(note-69)/12);
// A short window (93 ms), padded out so peaks can be placed between bins.
function spectrumReader(channels,sampleRate,size=PITCH_WINDOW){
  const length=channels[0]?.length||0, re=new Float64Array(PITCH_SIZE), im=new Float64Array(PITCH_SIZE), mag=new Float64Array(PITCH_SIZE/2);
  const window=Float32Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/size));
  return time=>{
    channelPower(channels,Math.round(time*sampleRate-size/2),length,window,re,im,mag);
    for(let k=0;k<PITCH_SIZE/2;k++)mag[k]=Math.sqrt(mag[k]);
    return mag;
  };
}
// Only spectral peaks count, each against the level around it, so a loud kick or a wash of noise doesn't read as a note.
function peaks(mag,binHz){
  const out=new Float64Array(mag.length), reach=Math.max(4,Math.round(80/binHz));let top=0;
  for(const v of mag)top=Math.max(top,v);
  for(let k=2;k<mag.length-2;k++){
    if(mag[k]<mag[k-1]||mag[k]<mag[k+1]||mag[k]<top*.01)continue;
    let sum=0,count=0;for(let j=Math.max(0,k-reach);j<=Math.min(mag.length-1,k+reach);j++){sum+=mag[j];count++;}
    const level=sum/count;if(mag[k]>level*1.5)out[k]=mag[k]/top;
  }
  return out;
}
// Where each candidate pitch's harmonics fall, and how much each nearby bin
// counts, depend only on the bin width, so they are worked out once, listed
// by bin: a frame then only visits the few bins that hold a peak.
const harmonicTables=new Map();
function harmonicBins(binHz,bins){
  const key=binHz+'/'+bins;let t=harmonicTables.get(key);
  if(!t){
    const steps=(HIGH_NOTE-LOW_NOTE)*4+1,byBin=Array.from({length:bins},()=>[]);
    for(let s=0;s<steps;s++){
      const f0=hz(LOW_NOTE+s/4);
      for(let h=1;h<=HARMONICS;h++){
        const f=f0*h, from=Math.max(1,Math.floor(f*.9715/binHz)), to=Math.min(bins-1,Math.ceil(f*1.0293/binHz));
        // A harmonic counts most when it sits right on the pitch, less as it drifts up to half a semitone away.
        for(let k=from;k<=to;k++)byBin[k].push(s*HARMONICS+h-1,Math.cos(Math.PI*6*Math.log2(k*binHz/f))**2*Math.pow(.8,h-1));
      }
    }
    const starts=new Uint32Array(bins+1),slot=[],weight=[];
    byBin.forEach((list,k)=>{starts[k]=slot.length;for(let i=0;i<list.length;i+=2){slot.push(list[i]);weight.push(list[i+1]);}});
    starts[bins]=slot.length;
    harmonicTables.set(key,t={steps,starts,slot:Uint32Array.from(slot),weight:Float64Array.from(weight),top:new Float64Array(steps*HARMONICS)});
  }
  return t;
}
// Each candidate pitch scores the loudest peak near each of its harmonics.
function salience(peak,binHz){
  const {steps,starts,slot,weight,top}=harmonicBins(binHz,peak.length), out=new Float64Array(steps);
  top.fill(0);
  for(let k=1;k<peak.length;k++){
    const p=peak[k];if(!p)continue;
    for(let i=starts[k],end=starts[k+1];i<end;i++){const v=p*weight[i];if(v>top[slot[i]])top[slot[i]]=v;}
  }
  for(let s=0;s<steps;s++){let sum=0;for(let h=0;h<HARMONICS;h++)sum+=top[s*HARMONICS+h];out[s]=sum;}
  return out;
}
// The tune, 25 times a second: the loudest pitch wherever one rings out clearly (0 where none does).
export const MELODY_STEP=.04;
export function melodyTrack(channels,sampleRate,onProgress=()=>{}){
  const read=spectrumReader(channels,sampleRate), binHz=sampleRate/PITCH_SIZE, duration=(channels[0]?.length||0)/sampleRate;
  const notes=[];let previous=null,since=9;
  for(let t=0;t*MELODY_STEP<duration;t++){
    const score=salience(peaks(read(t*MELODY_STEP),binHz),binHz);
    let best=0,mean=0;for(let s=0;s<score.length;s++){mean+=score[s];if(score[s]>score[best])best=s;}
    mean/=score.length;since++;
    if(!(score[best]>mean*3)){notes.push(0);continue;}
    // An octave slip is the usual mistake: when the octave nearer the last note rings almost as loud, the melody stays there.
    if(previous!==null&&since<8)for(const octave of [-48,48]){
      const s=best+octave;
      if(s>=0&&s<score.length&&score[s]>=score[best]*.8&&Math.abs(s-previous)<Math.abs(best-previous))best=s;
    }
    previous=best;since=0;notes.push(LOW_NOTE*4+best);
    if(t%500===0)onProgress(t*MELODY_STEP/duration);
  }
  return notes;
}
// A note's pitch is the one held across most of the moment just after it starts; a drum hit or a slide has none.
export function pitchAt(melody,time){
  const from=Math.ceil((time+.04)/MELODY_STEP),to=Math.floor((time+.22)/MELODY_STEP),heard=[];
  for(let i=from;i<=to&&i<melody.length;i++)if(melody[i])heard.push(melody[i]);
  if(heard.length<3)return null;
  heard.sort((a,b)=>a-b);const middle=heard[heard.length>>1];
  return heard.filter(v=>Math.abs(v-middle)<=3).length>=3?middle/4:null;
}
const NOTE_NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
// Temperley's key profiles: how strongly each step of the scale belongs to a major or a minor key.
const PROFILE={major:[5,2,3.5,2,4.5,4,2,4.5,2,3.5,1.5,4],minor:[5,2,3.5,4.5,2,4,2,4.5,3.5,2,1.5,4]};
export function songKey(channels,sampleRate){
  const read=spectrumReader(channels,sampleRate), binHz=sampleRate/PITCH_SIZE, duration=(channels[0]?.length||0)/sampleRate, chroma=new Float64Array(12);
  for(let time=0;time<duration-.2;time+=.25){
    const peak=peaks(read(time),binHz);
    for(let k=Math.ceil(65/binHz);k<Math.min(peak.length,2100/binHz);k++)if(peak[k])chroma[((Math.round(12*Math.log2(k*binHz/440))+69)%12+12)%12]+=peak[k];
  }
  const correlate=(a,b)=>{const ma=a.reduce((s,v)=>s+v,0)/12,mb=b.reduce((s,v)=>s+v,0)/12;let ab=0,aa=0,bb=0;for(let i=0;i<12;i++){ab+=(a[i]-ma)*(b[i]-mb);aa+=(a[i]-ma)**2;bb+=(b[i]-mb)**2;}return aa&&bb?ab/Math.sqrt(aa*bb):0;};
  let key={tonic:0,mode:'major',fit:-2};
  for(const mode of ['major','minor'])for(let tonic=0;tonic<12;tonic++){
    const fit=correlate(chroma,Array.from({length:12},(_,i)=>PROFILE[mode][(i-tonic+12)%12]));
    if(fit>key.fit)key={tonic,mode,fit};
  }
  return {tonic:key.tonic,mode:key.mode,name:NOTE_NAMES[key.tonic],fit:Math.round(key.fit*100)/100};
}
export function trackBeats(analysis){
  if(analysis.beats?.length)return {bpm:analysis.tempo??analysis.bpm,beats:analysis.beats};
  // Songs analysed before the spectral pulse existed: rebuild a pulse from their detected attacks.
  const events=analysis.events||[], duration=analysis.duration||((events.at(-1)?.time||0)+1);
  const n=Math.max(2,Math.ceil(duration/FRAME)+2), env=new Float32Array(n);
  for(const event of events){
    const at=Math.round(event.time/FRAME);
    [.25,.6,1,.6,.25].forEach((w,i)=>{const k=at+i-2;if(k>=0&&k<n)env[k]+=w*Math.max(.05,event.strength??1);});
  }
  return pulseBeats(env);
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
const PLAN={easy:[[4,1],[2,1],[1,1]],normal:[[2,1],[1,1],[1,2]],hard:[[1,2],[1,4],[1,4]]};
const GAP={easy:.45,normal:.2,hard:.09};

export function makeAudioChart(analysis,difficulty='easy'){
  const map=beatMap(analysis), {beat,beats,levels,downbeat}=map, events=analysis.events||[], near=nearFinder(events);
  const plan=PLAN[difficulty]||PLAN.easy, gap=GAP[difficulty]||GAP.easy, easy=difficulty==='easy', hard=difficulty==='hard';
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
      if(steps===4&&step%2&&event.strength<(hard&&level===2?accent:sharp))continue;
      const last=picked.at(-1);
      if(last&&(event===last.event||event.time-last.event.time<gap))continue;
      picked.push({event,k,bar,level,onBeat});
    }
  });
  // Big hits get a second lane: the first downbeat of a peak, then downbeats
  // while the peak lasts. Hard also doubles strong bass on beat 3 of a peak,
  // and loud downbeats in the groove.
  picked.forEach(note=>{
    const {event,k,bar,level,onBeat}=note;
    if(easy||level<(hard?1:2)||!onBeat||event.strength<accent)return;
    const drop=levels[Math.max(0,k-4)]<2, barIndex=Math.floor((k-downbeat)/4);
    note.chord=level<2?bar===0&&event.strength>=sharp:bar===0&&(drop||hard||barIndex%2===0)||hard&&bar===2&&event.band===0;
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
  // Lanes follow the tune like keys on a piano: a higher note sits further
  // right, a lower one further left, and a repeated note stays where it is.
  // Each note is placed within the range the melody covers around it, then
  // nudged so a step up always moves right and a step down always moves left.
  // Notes with no clear pitch (drums) walk on in the tune's last direction.
  const tune=picked.map(({event})=>event.pitch??(analysis.melody?pitchAt(analysis.melody,event.time):null));
  const placed=i=>{
    const around=[];for(let j=Math.max(0,i-8);j<=Math.min(tune.length-1,i+8);j++)if(tune[j]!==null)around.push(tune[j]);
    around.sort((a,b)=>a-b);
    let lo=around[Math.floor(around.length*.1)],hi=around[Math.floor((around.length-1)*.9)];
    if(hi-lo<5){const mid=(lo+hi)/2;lo=mid-2.5;hi=mid+2.5;}
    return Math.max(0,Math.min(3,Math.round((tune[i]-lo)/(hi-lo)*3)));
  };
  const free=[-9,-9,-9,-9], notes=[];let lane=1,last=[],dir=1,sung=null;
  picked.forEach(({event,chord,hold,length},i)=>{
    const time=event.time, open=l=>l>=0&&l<4&&time-free[l]>=.18, pitch=tune[i];
    let pick;
    if(pitch===null){
      pick=lane+dir;if(pick<0||pick>3){dir=-dir;pick=lane+dir;}
    }else{
      pick=placed(i);
      if(sung!==null){
        const step=pitch-sung;
        if(Math.abs(step)<.5)pick=lane;
        else if(step>0)pick=Math.max(pick,Math.min(3,lane+(step>=5?2:1)));
        else pick=Math.min(pick,Math.max(0,lane-(step<=-5?2:1)));
      }
    }
    // A lane still busy (just played, or held) hands the note to the nearest open lane, on the side the tune is heading.
    if(!open(pick)){const toward=pick===lane?dir:Math.sign(pick-lane);pick=[0,1,2,3].filter(open).sort((a,b)=>Math.abs(a-pick)-Math.abs(b-pick)||Math.sign(b-pick)*toward-Math.sign(a-pick)*toward)[0]??pick;}
    const add=l=>{notes.push({lane:l,time,type:hold?'hold':'tap',duration:hold?length:0,status:'pending'});free[l]=time+(hold?length:0);};
    add(pick);
    if(chord){const second=[0,1,2,3].filter(l=>l!==pick&&!last.includes(l)&&time-free[l]>=.18).sort((a,b)=>Math.abs(b-pick)-Math.abs(a-pick))[0];last=[pick];if(second!==undefined){add(second);last.push(second);}}else last=[pick];
    if(pick!==lane)dir=pick>lane?1:-1;
    lane=pick;sung=pitch;
  });
  return notes.sort((a,b)=>a.time-b.time||a.lane-b.lane).map((note,id)=>({id,...note}));
}
