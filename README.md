# VIPERMIX

A playable, landscape-first rhythm game inspired by classic four-lane mobile rhythm games. Built with Canvas 2D, Web Audio, and plain JavaScript.

## Play locally

```sh
npm run dev
```

Open http://localhost:5186. On a phone on the same Wi-Fi, use your computer's LAN IP with port 5186. The published Sites URL also works directly on iPhone. Turn the phone sideways for the wide layout. The portrait prompt also offers a compact fallback.

- Touch: tap a lane at the glowing line; hold purple notes until their tail arrives.
- Keyboard: **D F J K**. Keep the lane key pressed for purple holds.
- **Esc** pauses. Switching tabs automatically pauses the track.
- Three original procedural soundtracks, three difficulty levels, local personal bests, results, and replay.
- All modes use taps and holds only. Chill is the default, with slower notes, half as many notes as before, one-beat holds, generous timing, and no game over. The starting track is the slower Afterglow.
- Scores use a separate tap-and-hold record so old, denser charts do not set an unreachable personal best.

Music starts after a user gesture, as required by mobile browsers. Audio and note positions use the same AudioContext clock. Wired headphones or speakers avoid Bluetooth audio delay. Browser preview covers desktop and landscape iPhone dimensions; physical iPhone hardware was not available for testing.

## Verify

```sh
npm test
npm run check
```

Tests cover timing windows, chart playability for all tracks and difficulties, score/accuracy calculation, duplicate judgment prevention, and hold completion/early release.

Source files live in `dist/` and require no build step. Music and note effects are generated in code. VIPERMIX’s logo and favicon come from vipermix.cc. The visual theme uses the supplied deep-purple gradient (#150927 to #100a21), ViperMix-inspired violet/blue controls, blue taps, purple holds, and system sans-serif fonts.

The English / 简体中文 toggle works on the game, rotation prompt, and dialogs. Language preference is saved locally; first-time visitors use their browser language. Existing score records remain compatible.

## Play your own song

Start at the main menu and press **PLAY / 开始游戏**. Choose an original track or use **UPLOAD SONG / 上传歌曲** to select your audio. After analysis, choose **CHILL / 轻松**, **NORMAL / 普通**, or **EXPERT / 高手**, then press **START GAME / 开始挑战**. The difficulty screen shows the selected song and note count. Back returns to song selection; uploading never starts playback automatically.

Supported audio formats depend on the browser (typically MP3, WAV, M4A, OGG, and FLAC); limits are 80 MB, 5 seconds minimum, and 15 minutes maximum. The audio stays on the device. One imported song is retained in memory; choose the file again after refreshing. A hash of the file keeps its personal best separate from other songs.

Analysis runs in a Web Worker using energy rises in three frequency bands. Notes use detected attack timestamps, so they follow changes in the song instead of an assumed constant BPM. Difficulty thins those attacks into a playable tap-and-hold chart. BPM is an estimate and can have half/double-tempo ambiguity. Songs without a clear beat use a labelled gentle fallback that skips silence. Results vary with the recording and arrangement.

The original decoded audio and notes share the Web Audio clock, including pause/resume. Imported tracks get a lead-in long enough to see the first notes. Tests include known synthetic beats, changing tempo, silent gaps, opposite-phase stereo, fallback behavior, chart spacing, and uploaded-audio scheduling. Browser QA uses a generated WAV fixture; physical iPhone playback has not been tested.


## Cloudflare Pages

For GitHub integration, use framework preset **None**, build command `exit 0`, build output directory `dist`, and leave the root directory blank. For manual upload, upload the contents of `dist` or the prepared Cloudflare ZIP, with `index.html` directly at the archive root. Publishing the repository root places the game under `/dist/` and leaves the homepage returning 404.
