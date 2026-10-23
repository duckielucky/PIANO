import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { messages, chooseLanguage, translate } from '../dist/i18n.js';
import { TRACKS } from '../dist/engine.js';

test('both languages cover all UI labels, dynamic text, and tracks', () => {
  assert.deepEqual(Object.keys(messages.zh).sort(), Object.keys(messages.en).sort());
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
  const keys=[...html.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)].map(m=>m[1]);
  keys.push(...[...game.matchAll(/\bt\('([^']+)'(?:,|\))/g)].map(m=>m[1]));
  keys.push(...TRACKS.map(track=>'track_'+track.id));
  for(const language of ['en','zh'])for(const key of keys)assert.ok(messages[language][key],`${language}: missing ${key}`);
});

test('saved language wins and Chinese browser locales select Chinese', () => {
  assert.equal(chooseLanguage('en','zh-CN'),'en');
  assert.equal(chooseLanguage('zh','en-US'),'zh');
  for(const language of ['zh','zh-CN','zh-TW','zh-HK'])assert.equal(chooseLanguage(undefined,language),'zh');
  assert.equal(chooseLanguage('invalid','en-MY'),'en');
  assert.equal(translate('zh','lane',{number:2,key:'F'}),'第 2 条音轨，F 键');
});
