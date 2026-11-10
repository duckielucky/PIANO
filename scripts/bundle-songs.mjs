// Builds dist/songs.js: the songs that ship with the game, each with its beat
// analysis worked out ahead of time, so it plays at once with no analysing on
// the phone. The audio is decoded the way a browser decodes it (WebKit and
// ffmpeg give the same samples) and averaged down to 11025 Hz as the importer
// does, so the notes are the ones an import would give. Run it again whenever
// ANALYSIS_VERSION changes: node scripts/bundle-songs.mjs
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyzePcm} from '../dist/beat-analysis.js';
// The VIPERMIX remixes are their first two minutes, faded out over the last 3 s.
const SONGS=[
  {id:'not-like-us',title:'Not Like Us',file:'not-like-us.mp3'},
  {id:'leslie-bu-zhi-de-ai',title:'不值得爱吗 说散就散',file:'leslie-bu-zhi-de-ai.mp3'},
  {id:'awan-nano',title:'Awan Nano',file:'awan-nano.mp3'},
  {id:'mohicans',title:'Mohicans',file:'mohicans.mp3'},
  {id:'da-huo-ji',title:'打火机',file:'da-huo-ji.mp3'},
  {id:'wo-shi-fen-nu',title:'我是愤怒',file:'wo-shi-fen-nu.mp3'},
];
const dist=new URL('../dist/',import.meta.url), source=44100, rate=11025;
const out=SONGS.map(song=>{
  const path=new URL(song.file,dist).pathname;
  const raw=execFileSync('ffmpeg',['-v','error','-i',path,'-ac','2','-ar',String(source),'-f','f32le','-'],{maxBuffer:1<<30});
  const pcm=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4), frames=pcm.length/2, ratio=source/rate, length=Math.ceil(frames/source*rate);
  const channels=[0,1].map(c=>{
    const output=new Float32Array(length);
    for(let i=0;i<length;i++){const begin=Math.floor(i*ratio),end=Math.min(frames,Math.max(begin+1,Math.floor((i+1)*ratio)));let sum=0;for(let k=begin;k<end;k++)sum+=pcm[2*k+c];output[i]=sum/Math.max(1,end-begin);}
    return output;
  });
  const analysis=analyzePcm(channels,rate), tag=createHash('sha1').update(readFileSync(path)).digest('hex').slice(0,10);
  console.log(song.id,analysis.bpm,'BPM',Math.round(frames/source)+'s',analysis.key.name,analysis.key.mode);
  return {...song,file:`${song.file}?v=${tag}`,bpm:analysis.bpm,duration:frames/source,analysis};
});
writeFileSync(new URL('songs.js',dist),'// Songs that ship with the game, made by scripts/bundle-songs.mjs; do not edit by hand.\nexport const SONGS='+JSON.stringify(out)+';\n');
