/**
 * Everything a badge design can change lives in a `Theme`. The engine reads
 * only from it, so a new event is a new theme file: colours, fonts, copy,
 * logos, the placeholder mark, layout per format and the clip's timing.
 */

export type BadgeFormat = "story" | "post";

/** A colour role inside the theme palette. */
export type ColorRole = "background" | "card" | "accent" | "text";

export type Palette = Record<ColorRole, string>;

export type WordmarkPart = { text: string; color: ColorRole };

export type LogoSpec = {
  /** Path under `public/` (e.g. "themes/my-event/sponsor.png") or any URL. */
  src: string;
  /** Optional label, only for the UI and alt text. */
  name?: string;
};

export type FormatLayout = {
  width: number;
  height: number;
  card: { width: number; height: number; y: number; radius: number };
  photo: { size: number; offsetY: number };
  /** Distance from the photo's bottom to the first line of the name. */
  nameGap: number;
  nameSize: { max: number; min: number };
  /** Distance from the card's bottom up to the foot rule. */
  footInset: number;
  /** Distance from the card's bottom down to the headline baseline. */
  headlineGap: number;
  headlineSize: number;
  /** Whether the URL line under the headline shows in this format. */
  showUrl: boolean;
  /** Where the logo strip sits, or null to hide it in this format. */
  logos: { y: number; height: number; gap: number } | null;
};

export type Timing = {
  /** Total length of the clip, seconds. */
  seconds: number;
  fps: number;
  /** The pixel curtain: starts covering, fully covered, fully lifted. */
  wipe: { start: number; full: number; end: number };
  /** Where the badge's own beats start counting. */
  badgeAt: number;
  /** Badge beats, relative to `badgeAt`. */
  beats: {
    mark: number;
    meta: number;
    drop: number;
    fragments: number;
    rule: number;
    foot: number;
    pop: number;
    refine: number;
    sharp: number;
    name: number;
    headline: number;
    url: number;
    logos: number;
  };
};

export type Effects = {
  /** Pixels falling at the start of the clip. */
  rain: boolean;
  /** The block curtain that hands over from the rain to the badge. */
  wipe: boolean;
  /** Pixel fragments eating into the card's edges. */
  fragments: boolean;
  /** Loose pixels blinking around the card while it holds. */
  sparks: boolean;
  /** The lanyard strap above the card. */
  strap: boolean;
  /** Halftone dots over the duotone photo. */
  halftone: { grid: number; duotoneAlpha: number };
  /** Pixel grids the photo goes through before it resolves. */
  refine: number[];
};

export type Theme = {
  id: string;
  name: string;
  colors: Palette;
  fonts: {
    /** CSS font-family used for the wordmark, name and headline. */
    display: string;
    /** Weight for the display face (e.g. 700). Omit for the regular cut. */
    displayWeight?: number;
    /** CSS font-family used for metadata lines. */
    body: string;
    /** `document.fonts.load` specs to await before drawing. */
    preload: string[];
  };
  /**
   * The top-left brand: a typed wordmark, or an image (logo file) drawn at
   * `height` pixels tall.
   */
  wordmark: { parts: WordmarkPart[] } | { image: string; height: number };
  /** Shown in the portrait while there is no photo: a pixel grid of "#" cells or an image. */
  mark: { grid: string[] } | { image: string };
  copy: {
    byline: string;
    dateLine: string;
    /** Left side of the card foot. `{date}` is replaced with `dateLine`. */
    footer: string;
    /** Right side of the card foot, in the accent colour. */
    footerTag: string;
    headline: string;
    url: string;
    /** Text sent with the file when sharing from a phone. */
    shareText: string;
    /** Default values for the form. */
    defaults: { name: string; role: string; team: string };
  };
  /** Sponsor / partner logos drawn as a strip. Prefer white or single-colour files. */
  logos: LogoSpec[];
  formats: Record<BadgeFormat, FormatLayout>;
  timing: Timing;
  effects: Effects;
  /** File name prefix for downloads. */
  filePrefix: string;
};

/** The person on the badge and how their photo is framed. */
export type BadgeInput = {
  format: BadgeFormat;
  name: string;
  role: string;
  team?: string | null;
  photo?: CanvasImageSource | null;
  /** The photo's own size, so it can be cropped to a square. */
  photoSize?: { width: number; height: number } | null;
  /** 1 fits the shorter side; larger zooms in. */
  zoom?: number;
  /** -1..1 on each axis, where the square crop sits inside the photo. */
  focus?: { x: number; y: number };
};

/** Images a theme refers to, loaded once before drawing. */
export type ThemeAssets = {
  wordmark: HTMLImageElement | null;
  mark: HTMLImageElement | null;
  logos: HTMLImageElement[];
};
