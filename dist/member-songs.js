// Songs from the player's own VIPERMIX library, when the game runs on vipermix.cc
// (/game/): the songs they bought, claimed or uploaded, from /api/game/songs on
// the same site with their login. Anywhere else (local dev, a preview host) the
// API isn't there and the list is simply empty, so only the built-in songs show.
// Contract: VIPERMIX issue VMX-466, "API contract draft".
const MAX_PAGES = 10;                // 100 songs a page
const json = { credentials: 'same-origin', headers: { Accept: 'application/json' } };

export async function loadMemberSongs(fetcher = globalThis.fetch) {
  const songs = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let data;
    try {
      const response = await fetcher('/api/game/songs' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), json);
      if (!response.ok) break;       // 401 guest, 403 switched off: built-in songs only
      data = await response.json();
    } catch { break; }
    for (const song of data.songs ?? []) songs.push(memberTrack(song));
    cursor = data.next_cursor;
    if (!cursor) break;
  }
  return songs;
}

// One song from the API as a track the game can play. The audio is the whole
// song; `range` asks for only its first ~3 minutes, so a long song never fills
// a phone's memory. The note chart comes later, from loadChart.
export function memberTrack(song) {
  return {
    id: 'vmx-' + song.id, songId: song.id, title: song.title, artist: song.artist || '',
    duration: song.duration, bpm: song.bpm ? Math.round(song.bpm) : null,
    url: song.audio, range: song.audio_range || null, chartUrl: song.chart,
    analysis: null, buffer: null, recorded: true, member: true,
  };
}

const wait = ms => new Promise(done => setTimeout(done, ms));

// The song's beat analysis, made on the server by this game's own analyser (the
// same analyzePcm as the built-in songs). 202 = being analysed right now: ask
// again after retry_after seconds. Anything else that isn't 200 means the song
// can't be played for now.
export async function loadChart(item, { fetcher = globalThis.fetch, onWait = () => {}, sleep = wait, tries = 40 } = {}) {
  if (item.analysis) return item.analysis;
  for (let i = 0; i < tries; i++) {
    const response = await fetcher(item.chartUrl, json);
    if (response.status === 202) {
      onWait();
      const body = await response.json().catch(() => ({}));
      await sleep(Math.min(10, Math.max(1, Number(body.retry_after) || 3)) * 1000);
      continue;
    }
    if (!response.ok) throw new Error('chartUnavailable');
    const data = await response.json();
    if (!data?.analysis?.beats) throw new Error('chartUnavailable');
    item.analysis = data.analysis;
    item.bpm = data.analysis.bpm ?? item.bpm;
    return item.analysis;
  }
  throw new Error('chartUnavailable');
}
