export const MAX_FILE_BYTES=80*1024*1024, MAX_DURATION=15*60;
const cancelled=()=>new DOMException('Cancelled','AbortError');
function check(signal){if(signal.aborted)throw cancelled();}
export async function importSong(file,audio,signal,onProgress){
  if(!file.size)throw new Error('decodeError');
  if(file.size>MAX_FILE_BYTES)throw new Error('fileTooLarge');
  onProgress('decoding',null);check(signal);
  const bytes=await file.arrayBuffer();check(signal);
  // Stable, file-specific records; different files with the same name don't share scores.
  const digest=await crypto.subtle.digest('SHA-256',bytes);check(signal);
  const id='upload-v1-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
  let buffer;
  try{buffer=await audio.decode(bytes);}catch{check(signal);throw new Error('decodeError');}
  check(signal);
  if(buffer.duration>MAX_DURATION)throw new Error('songTooLong');
  if(buffer.duration<5)throw new Error('songTooShort');
  onProgress('analyzing',0);
  const rate=11025,length=Math.ceil(buffer.duration*rate),channels=[];
  // Copy a small analysis representation; keep the original quality for playback.
  for(let c=0;c<Math.min(2,buffer.numberOfChannels);c++){
    const input=buffer.getChannelData(c),output=new Float32Array(length),ratio=buffer.sampleRate/rate;
    for(let i=0;i<length;i++){
      const begin=Math.floor(i*ratio),end=Math.min(input.length,Math.max(begin+1,Math.floor((i+1)*ratio)));
      let sum=0;for(let k=begin;k<end;k++)sum+=input[k];output[i]=sum/Math.max(1,end-begin);
      if(i%262144===0){check(signal);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    channels.push(output);
  }
  check(signal);
  const analysis=await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./beat-worker.js?v=b5e28e065b',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',abort);clearTimeout(timeout);};
    const abort=()=>{cleanup();reject(cancelled());};
    const timeout=setTimeout(()=>{cleanup();reject(new Error('analysisError'));},90000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{
      if(data.result){cleanup();resolve(data.result);}
      else if(data.error){cleanup();reject(new Error(data.error));}
      else onProgress('analyzing',Math.round(data.progress*100));
    };
    worker.onerror=()=>{cleanup();reject(new Error('analysisError'));};
    worker.postMessage({channels,sampleRate:rate},channels.map(channel=>channel.buffer));
  });
  check(signal);
  return {id,title:file.name.replace(/\.[^.]+$/,'').slice(0,160)||file.name,bpm:analysis.bpm,duration:buffer.duration,buffer,analysis,file,uploaded:true};
}
