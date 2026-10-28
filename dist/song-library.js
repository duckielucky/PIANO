// Uploaded songs stay on this device: the audio file plus its beat analysis, so a song plays again without re-analysis.
export const MAX_SONGS=30;
const NAME='vipermix-songs',STORE='songs';
let opening=null;
function open(){
  opening??=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB)return reject(new Error('noStorage'));
    const request=indexedDB.open(NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  }).catch(error=>{opening=null;throw error;});
  return opening;
}
async function use(mode,work){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode),request=work(tx.objectStore(STORE));
    tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(tx.error);
  });
}
export async function listSongs(){return ((await use('readonly',store=>store.getAll()))||[]).sort((a,b)=>b.added-a.added);}
export function saveSong(song){navigator.storage?.persist?.().catch(()=>{});return use('readwrite',store=>store.put(song));}
export function deleteSong(id){return use('readwrite',store=>store.delete(id));}
