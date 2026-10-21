# Neon Rush

A playable, portrait-first rhythm game inspired by classic four-lane mobile rhythm games. Built with Canvas 2D, Web Audio, and plain JavaScript.

## Play locally

```sh
npm run dev
```

Open http://localhost:5186. On a phone on the same Wi-Fi, use your computer's LAN IP with port 5186. The published Sites URL also works directly on iPhone.

- Touch: tap a lane at the glowing line; hold green notes until their tail arrives; drag in the arrow direction for swipes.
- Keyboard: **D F J K**. Hold the corresponding lane key and press **Left / Right** for a swipe.
- **Esc** pauses. Switching tabs automatically pauses the track.
- Three original procedural soundtracks, three difficulty levels, local personal bests, results, and replay.
- Chill mode includes taps and holds only.

Music starts after a user gesture, as required by mobile browsers. Audio and note positions use the same AudioContext clock. Wired headphones or speakers avoid Bluetooth audio delay. Browser preview was checked at iPhone dimensions; physical iPhone hardware was not available for testing.

## Verify

```sh
npm test
npm run check
```

Tests cover timing windows, chart playability for all tracks and difficulties, score/accuracy calculation, duplicate judgment prevention, and hold completion/early release.

Source files live in `dist/` and require no build step. Music and game art are generated in code; no audio or artwork from the reference game is used. Google Fonts provides the display fonts, with local fallbacks.
