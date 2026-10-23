export const messages = {
  en: {
    title: 'VIPERMIX — Find your rhythm',
    description: 'VIPERMIX rhythm game. Tap blue notes, hold purple notes, and find your flow. Play in English or Chinese.',
    game: 'VIPERMIX rhythm game', home: 'VIPERMIX home', liveScore: 'Live score',
    score: 'SCORE', best: 'PERSONAL BEST', noFail: 'NO FAIL', energy: 'ENERGY', combo: 'COMBO',
    stage: 'Four note lanes. Tap when notes reach the glowing line.',
    canvas: 'Notes travel down four lanes. Use D, F, J, K, or touch the lanes.',
    lane: 'Lane {number}, {key} key', difficulty: 'Difficulty',
    easy: 'CHILL', normal: 'NORMAL', hard: 'EXPERT',
    tapHold: 'TAP. HOLD.', flow: 'FLOW.', play: 'PLAY', help: 'HELP',
    fullscreen: 'Toggle fullscreen', mute: 'Mute sound', unmute: 'Unmute sound', pause: 'Pause game',
    changeTrack: 'Change track', nextTrack: 'Next track',
    landscape: 'Landscape play', turn: 'TURN', sideways: 'SIDEWAYS.', portrait: 'PLAY HERE ANYWAY',
    switchLanguage: '切换到中文', switchLabel: '中文',
    perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS', goodGreat: 'GOOD / GREAT',
    retry: 'LET’S TRY THAT AGAIN', oneMoreBeat: 'ONE MORE BEAT.',
    audioError: 'Audio could not start. Tap play again to enable your browser’s audio.',
    gotIt: 'GOT IT', paused: 'PAUSED.', resume: 'RESUME', restart: 'RESTART', menu: 'MENU',
    complete: 'TRACK COMPLETE', outOfEnergy: 'OUT OF ENERGY', niceFlow: 'NICE FLOW.', tryAgain: 'ONE MORE TRY?',
    newBest: 'NEW PERSONAL BEST', accuracy: 'ACCURACY', maxCombo: 'MAX COMBO', playAgain: 'PLAY AGAIN',
    tracks: 'TRACKS', done: 'DONE', tap: 'TAP', hold: 'HOLD',
    tapHelp: 'Hit blue notes at the line.', holdHelp: 'Hold purple notes until the tail arrives.',
    keyboardHelp: 'D F J K · Esc to pause',
    track_midnight: 'Midnight Circuit', track_afterglow: 'Afterglow', track_velocity: 'Terminal Velocity',
  },
  zh: {
    title: 'VIPERMIX — 跟随节奏',
    description: 'VIPERMIX 音乐节奏游戏。轻点蓝色音符，长按紫色音符，跟随节奏。支持中文和英文。',
    game: 'VIPERMIX 音乐节奏游戏', home: 'VIPERMIX 首页', liveScore: '实时得分',
    score: '得分', best: '个人最佳', noFail: '无失败模式', energy: '能量', combo: '连击',
    stage: '四条音轨，音符到达发光判定线时点击。',
    canvas: '音符沿四条音轨下落。使用 D、F、J、K 键，或触摸音轨。',
    lane: '第 {number} 条音轨，{key} 键', difficulty: '难度',
    easy: '轻松', normal: '普通', hard: '高手',
    tapHold: '轻点 · 长按', flow: '跟随节奏', play: '开始游戏', help: '玩法',
    fullscreen: '切换全屏', mute: '关闭声音', unmute: '开启声音', pause: '暂停游戏',
    changeTrack: '选择曲目', nextTrack: '下一首',
    landscape: '横屏游玩', turn: '转动手机', sideways: '横屏畅玩', portrait: '继续竖屏游玩',
    switchLanguage: 'Switch to English', switchLabel: 'EN',
    perfect: '完美', great: '出色', good: '不错', miss: '错过', goodGreat: '不错 / 出色',
    retry: '再试一次', oneMoreBeat: '继续律动',
    audioError: '暂时无法播放声音，请再次点击开始游戏以启用浏览器音频。',
    gotIt: '知道了', paused: '已暂停', resume: '继续游戏', restart: '重新开始', menu: '返回主页',
    complete: '曲目完成', outOfEnergy: '能量耗尽', niceFlow: '节奏超棒！', tryAgain: '再挑战一次？',
    newBest: '刷新个人最佳', accuracy: '准确率', maxCombo: '最高连击', playAgain: '再玩一次',
    tracks: '选择曲目', done: '完成', tap: '轻点', hold: '长按',
    tapHelp: '蓝色音符到达判定线时点击。', holdHelp: '按住紫色音符，直到尾部到达判定线。',
    keyboardHelp: 'D F J K 控制音轨 · Esc 暂停',
    track_midnight: '午夜回路', track_afterglow: '余晖', track_velocity: '极速',
  },
};

export function chooseLanguage(saved, preferred = 'en') {
  if (saved === 'en' || saved === 'zh') return saved;
  return /^zh(?:-|$)/i.test(preferred) ? 'zh' : 'en';
}

export function translate(language, key, values = {}) {
  const message = messages[language]?.[key] ?? messages.en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
