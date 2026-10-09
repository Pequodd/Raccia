// A skin is everything that makes Oleg look and talk the way it does:
// colours, plastic gradients, chrome, background, fonts and interface copy.
// Screens read it through useSkin() / makeStyles(); nothing visual is hard-coded.

export type Gradient = readonly [string, string];

export type Skin = {
  id: string;
  name: string; // shown in Settings
  dark: boolean; // status bar style

  colors: {
    ink: string; // main text, on chrome and on surfaces
    text2: string;
    text3: string;
    text4: string;
    placeholder: string;
    accentText: string; // links, subtitles («в сети», «передаёт сигнал…»)
    focus: string;
    labelText: string; // field labels, inviter line
    serviceText: string;
    serviceBg: string;
    neon: string; // online dot, typing dots, «за»
    neonGlow: string;
    voteNo: string; // «против» bar
    danger: string;
    dangerText: string;
    dangerBg: string;
    dangerBorder: string;
    okBg: string;
    okBorder: string;
    limeText: string; // text on lime plastic
    limeAccent: string; // selected marks
    chromeEdge: string;
    lcdBg: string;
    lcdText: string;
    led: string;
    mineText: string; // own bubble
    mineMeta: string;
    readTick: string; // third tick, «Записано на дискету»
    white: string;
    screen: string; // behind everything
    surface: string; // cards
    surfaceBorder: string;
    field: string; // inputs
    fieldFocus: string;
    fieldBorder: string;
    fieldBorderSoft: string;
    sidebar: string; // wide-screen list column
    divider: string;
  };

  plastic: {
    bondi: Gradient;
    tangerine: Gradient;
    grape: Gradient;
    lime: Gradient;
    pink: Gradient;
    danger: Gradient;
    bubbleTheirs: Gradient;
    bubbleMine: Gradient;
    vote: Gradient;
    ball: Gradient; // the mascot sphere on the login screen
    stickerAvatar: Gradient; // behind sticker avatars
  };

  chrome: { colors: readonly [string, string, ...string[]]; locations: readonly [number, number, ...number[]] };
  logoChrome: readonly { offset: number; color: string }[]; // «ОЛЕГ» letters
  logoShadow: string;
  background: { gradient: Gradient; grid: string };
  avatars: Gradient[];
  authorColors: string[]; // names in group bubbles
  fonts: { display: string; body: string; bodyBold: string; bodyHeavy: string; mono: string };
  copy: Copy;
};

// Interface words that change with the skin.
export type Copy = {
  slogan: string;
  promise: string;
  promiseProof: string;
  loginButton: string;
  registerButton: string;
  footer: string;
  noSignal: string;
  errorPrefix: string; // «Ошибка Y2K!»
  loginError: string;
  chats: string;
  search: string;
  newChat: string;
  newGroup: string;
  invite: string;
  composer: string;
  send: string;
  typing: string;
  online: string;
  offline: string;
  ticks: [string, string, string]; // sent · delivered · read
  emptyFeed: string;
  voteTitle: string;
  voteFor: string;
  voteAgainst: string;
  profile: string;
  settings: string;
  logout: string;
};
