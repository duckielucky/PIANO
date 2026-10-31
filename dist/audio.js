// Original procedural soundtrack. All playback and note timing share this audio clock.
export class Soundtrack {
  constructor() { this.ctx = null; this.nodes = new Set(); this.muted = false; this.timer = null; this.offset = 0; }
  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .6;
      const compressor = this.ctx.createDynamicsCompressor(); compressor.threshold.value = -14; compressor.ratio.value = 5;
      this.master.connect(compressor).connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0); for(let i=0;i<data.length;i++) data[i] = Math.random()*2-1;
    }
  }
  async unlock() {
    this.ensureContext();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }
  // Decoding need not resume playback; mobile browsers unlock at the Play gesture.
  async decode(bytes) { this.ensureContext(); return this.ctx.decodeAudioData(bytes); }
  own(node) { this.nodes.add(node); node.onended = () => this.nodes.delete(node); return node; }
  tone(freq, time, duration, type='sine', volume=.15, slide=0) {
    const osc = this.own(this.ctx.createOscillator()), gain = this.ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,time);
    if(slide) osc.frequency.exponentialRampToValueAtTime(slide,time+duration);
    gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(volume,time+.005); gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(gain).connect(this.master); osc.start(time); osc.stop(time+duration+.03);
  }
  hiss(time, duration, frequency, volume) {
    const src=this.own(this.ctx.createBufferSource()), filter=this.ctx.createBiquadFilter(), gain=this.ctx.createGain();
    src.buffer=this.noise; filter.type='highpass';filter.frequency.value=frequency;
    gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    src.connect(filter).connect(gain).connect(this.master);src.start(time);src.stop(time+duration);
  }
  start(track, leadIn=0) {
    this.stop(); this.track=track;this.beat=60/track.bpm;this.startTime=this.ctx.currentTime+.1+Math.max(leadIn,3*this.beat);this.step=0;
    for(let i=0;i<3;i++) this.tone(i===2?880:660,this.startTime-(3-i)*this.beat,.07,'sine',.12);
    if(track.buffer){
      const source=this.own(this.ctx.createBufferSource());source.buffer=track.buffer;
      source.connect(this.master);source.start(this.startTime);return;
    }
    this.schedule(); this.timer=setInterval(()=>this.schedule(),25);
  }
  schedule() {
    if(!this.track || this.track.buffer || this.ctx.state!=='running') return;
    while(this.startTime + this.step*this.beat/4 < this.ctx.currentTime+.15 && this.step < this.track.bars*16) {
      const s=this.step++, t=this.startTime+s*this.beat/4, bar=Math.floor(s/16), p=s%16;
      const chord=[0,8,3,10][Math.floor(bar/2)%4], root=this.track.root+chord;
      const hz=n=>440*Math.pow(2,(n-69)/12);
      const breakdown=bar>=this.track.bars/2 && bar<this.track.bars/2+4;
      if(p%4===0 && (!breakdown || p===0)) this.tone(145,t,.19,'sine',.78,42);
      if(p===4||p===12) { this.hiss(t,.13,1200,breakdown?.09:.2);this.tone(180,t,.07,'triangle',.07); }
      if(s%2===0) this.hiss(t,s%4===2?.09:.035,6500,s%4===2?.13:.065);
      if(!breakdown && (p===0||p===3||p===6||p===10||p===12||p===14)) this.tone(hz(root-12),t,this.beat*.38,'triangle',.33);
      if(p===0) [0,3,7,10].forEach((offset,i)=>this.tone(hz(root+offset+12),t+i*.012,this.beat*3.8,'sine',.065));
      if(s%2===0 && bar>0) {
        const melody=[0,7,12,3,10,7,15,12];const n=root+24+melody[(s/2+Math.floor(bar/4))%8];
        this.tone(hz(n),t,this.beat*.55,'triangle',breakdown?.065:.095);
        this.tone(hz(n),t+this.beat*.75,this.beat*.45,'sine',.027);
      }
      if(p===14 && bar%4===3) this.hiss(t,.16,3400,.1);
    }
  }
  // What you hear lags the clock by the device's output delay (large on
  // Bluetooth); notes follow the sound you hear, not the sound being sent.
  // Not every browser reports that delay, so the player's own sound delay
  // (learned from their taps, or set by hand) is taken off as well.
  get latency(){const c=this.ctx;if(!c)return 0;const v=(Number(c.outputLatency)||0)+(Number(c.baseLatency)||0);return Math.min(.5,Math.max(0,v));}
  get time(){return this.ctx?this.ctx.currentTime-this.latency-this.offset-this.startTime:0;}
  async pause(){if(this.ctx?.state==='running')await this.ctx.suspend();}
  async resume(){await this.unlock();this.schedule();}
  setMuted(value){this.muted=value;if(this.master)this.master.gain.setTargetAtTime(value?0:.6,this.ctx.currentTime,.02);}
  stop(){clearInterval(this.timer);this.timer=null;this.track=null;for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();}
}
