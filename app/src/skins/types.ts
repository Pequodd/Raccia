// A skin is everything that makes Oleg look and talk the way it does.
// Screens never name colours: they ask for a role («the main button», «a chip»,
// «the selected row») and the skin decides what that looks like.

export type Gradient = readonly [string, string];

// A filled surface and the text that sits on it.
export type Fill = { grad: Gradient; text: string };

// How filled surfaces are drawn:
//   glossy  — translucent plastic with a highlight (Y2K)
//   bevel   — flat metal, light top-left / dark bottom-right edge (Winamp, Windows 98)
//   pixel   — solid fill, thick black outline, hard offset shadow (Dendy)
//   phosphor— flat CRT colour, glow, no edges (DOS)
//   enamel  — painted, softly rounded, bottom lip (Dacha)
//   luna    — rounded glossy XP buttons
export type ShapeKind = 'glossy' | 'bevel' | 'pixel' | 'phosphor' | 'enamel' | 'luna';

// Frame styles merged into cards, fields and panels (border, shadow).
export type Frame = {
  borderWidth?: number;
  borderColor?: string;
  borderTopColor?: string;
  borderLeftColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  boxShadow?: string;
};

export type BackgroundKind = 'grid' | 'scanlines' | 'phosphor' | 'sky' | 'carpet' | 'oilcloth' | 'bliss';

export type Skin = {
  id: string;
  name: string; // shown in Settings
  dark: boolean; // status bar style

  shape: {
    kind: ShapeKind;
    maxRadius: number; // every corner radius is clamped to this (0 = square theme)
  };
  frames: { card: Frame; field: Frame; panel: Frame; button: Frame };

  colors: {
    ink: string; // main text, on panels and on surfaces
    text2: string;
    text3: string;
    text4: string;
    placeholder: string;
    accentText: string; // links, subtitles («в сети», «передаёт сигнал…»)
    nameText: string; // chat names in the list
    focus: string;
    focusGlow: string; // ring around a focused field
    voteTitle: string; // «НОВЫЙ АБОНЕНТ!»
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
    limeAccent: string; // selected marks
    chromeEdge: string; // panel edges
    chromeInk: string; // icons on chrome panels (header, composer): must read on skin.chrome
    lcdBg: string;
    lcdText: string;
    led: string;
    readTick: string; // third tick, «Записано на дискету»
    white: string;
    screen: string; // behind everything
    surface: string; // cards
    surfaceBorder: string;
    field: string; // inputs
    fieldText: string;
    fieldFocus: string;
    fieldBorder: string;
    fieldBorderSoft: string;
    sidebar: string; // wide-screen list column
    divider: string;
  };

  // Filled things, by role.
  roles: {
    cta: Fill; // big login / register button
    action: Fill; // send, save, share, retry
    round: Fill; // round «new chat» button in the header
    chipNew: Fill;
    chipInvite: Fill;
    chipGroup: Fill;
    positive: Fill; // «Впустить», «Собрать тусовку»
    negative: Fill; // «Отключить»
    danger: Fill; // «Выход»
    badge: Fill; // unread counter
    selected: Fill; // selected chat row on wide screens
    tab: Fill; // active tab
    vote: Fill; // vote / invite cards
    promo: Fill; // «БЕЗ ЦЕНЗУРЫ…» sticker
  };

  bubbles: {
    theirs: { grad: Gradient; text: string; meta: string; border?: string };
    mine: { grad: Gradient; text: string; meta: string; border?: string };
    shine: boolean; // glossy highlight strip on top
  };

  ball: Gradient; // the mascot sphere on the Y2K login screen
  stickerAvatar: Gradient; // behind sticker avatars
  chrome: { colors: readonly [string, string, ...string[]]; locations: readonly [number, number, ...number[]] };
  logoChrome: readonly { offset: number; color: string }[]; // «ОЛЕГ» letters
  logoShadow: string;
  hero: 'ball' | 'player'; // what crowns the login screen
  background: { kind: BackgroundKind; gradient: Gradient; line: string };
  avatars: Gradient[];
  authorColors: string[]; // names in group bubbles
  fonts: { display: string; body: string; bodyBold: string; bodyHeavy: string; mono: string; field: string };
  vote: { meta: 'mono' | 'body'; bar: 'smooth' | 'segments'; buttonFont: 'display' | 'bodyHeavy' };
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
  heroTitle?: string; // e.g. «ОЛЕГАМП» on the Winamp player
  heroMarquee?: string; // scrolling LCD line on the Winamp player
  listStrip?: string; // title strip above the chat list header («ПЛЕЙЛИСТ»)
};
