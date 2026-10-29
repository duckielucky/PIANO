import { analyzePcm } from './beat-analysis.js?v=935406f2a6';
self.onmessage=({data})=>{
  try{
    const result=analyzePcm(data.channels,data.sampleRate,value=>self.postMessage({progress:value}));
    self.postMessage({result});
  }catch(error){self.postMessage({error:error.message==='silentSong'?'silentSong':'analysisError'});}
};
