import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMemberSongs, memberTrack, loadChart } from '../dist/member-songs.js';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const song = (id, extra = {}) => ({ id, title: 'Song ' + id, artist: 'DJ A', duration: 245.3, bpm: 127.6,
  audio: `/api/game/songs/${id}/audio`, audio_range: 'bytes=0-999', chart: `/api/game/songs/${id}/chart`, ...extra });

test('member songs come page by page from /api/game/songs', async () => {
  const asked = [];
  const fetcher = async url => {
    asked.push(url);
    return url.endsWith('cursor=100') ? reply(200, { songs: [song(3)], next_cursor: null })
                                      : reply(200, { songs: [song(1), song(2)], next_cursor: '100' });
  };
  const songs = await loadMemberSongs(fetcher);
  assert.deepEqual(asked, ['/api/game/songs', '/api/game/songs?cursor=100']);
  assert.deepEqual(songs.map(s => s.id), ['vmx-1', 'vmx-2', 'vmx-3']);
});

test('no songs for guests, a switched-off library, or a site without the API', async () => {
  for (const fetcher of [async () => reply(401, {}), async () => reply(403, {}), async () => reply(404, {}),
                         async () => { throw new TypeError('offline'); }])
    assert.deepEqual(await loadMemberSongs(fetcher), []);
});

test('a member song plays its first minutes only and keeps its own best score', () => {
  const track = memberTrack(song(7, { audio_range: null, bpm: null }));
  assert.equal(track.id, 'vmx-7'); assert.equal(track.recorded, true); assert.equal(track.member, true);
  assert.equal(track.range, null); assert.equal(track.bpm, null); assert.equal(track.analysis, null);
  assert.equal(memberTrack(song(8)).range, 'bytes=0-999');
  assert.equal(memberTrack(song(8)).bpm, 128);
});

test('the chart waits while the server analyses, then loads', async () => {
  const analysis = { version: 4, bpm: 128, beats: [.5, 1], events: [], waveform: [], duration: 180 };
  const replies = [reply(202, { status: 'analysing', retry_after: 3 }), reply(202, {}), reply(200, { analysis })];
  let waits = 0, slept = [];
  const item = memberTrack(song(9));
  const got = await loadChart(item, { fetcher: async () => replies.shift(), onWait: () => waits++, sleep: async ms => slept.push(ms) });
  assert.equal(got, analysis); assert.equal(item.analysis, analysis); assert.equal(item.bpm, 128);
  assert.equal(waits, 2); assert.deepEqual(slept, [3000, 3000]);
});

test('a song whose chart can\'t be made is reported, not played', async () => {
  for (const r of [reply(503, { status: 'analyser_off' }), reply(422, { status: 'failed' }), reply(404, {}), reply(200, { analysis: {} })])
    await assert.rejects(loadChart(memberTrack(song(10)), { fetcher: async () => r }), /chartUnavailable/);
  await assert.rejects(loadChart(memberTrack(song(11)), { fetcher: async () => reply(202, {}), sleep: async () => {}, tries: 3 }), /chartUnavailable/);
});
