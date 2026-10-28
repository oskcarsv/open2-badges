import type { FormatLayout, Theme, Timing } from "../engine/types";

/**
 * Build & Pitch (21 nov 2026, UVG). Matches the badge shipped in open2-app
 * pixel for pixel: ink + volt, Geist Pixel + Geist Mono, the pixel ampersand.
 *
 * Copy this file to start a new event; every field is documented in
 * `src/engine/types.ts`.
 */

const AMPERSAND = [
  "...####.....",
  "..######....",
  ".###..###...",
  ".##....##...",
  ".###..###...",
  "..######....",
  "..#####...##",
  ".###.###.###",
  "###...#####.",
  "##.....###..",
  "##....####..",
  "###..######.",
  ".######..###",
  "..####....##",
];

export const STORY: FormatLayout = {
  width: 1080,
  height: 1920,
  card: { width: 820, height: 1200, y: 300, radius: 40 },
  photo: { size: 520, offsetY: 130 },
  nameGap: 110,
  nameSize: { max: 96, min: 48 },
  footInset: 140,
  headlineGap: 170,
  headlineSize: 104,
  showUrl: true,
  logos: { y: 1800, height: 52, gap: 64 },
};

export const POST: FormatLayout = {
  width: 1080,
  height: 1350,
  card: { width: 700, height: 960, y: 210, radius: 40 },
  photo: { size: 400, offsetY: 110 },
  nameGap: 90,
  nameSize: { max: 80, min: 48 },
  footInset: 116,
  headlineGap: 100,
  headlineSize: 72,
  showUrl: false,
  // No room under the headline in 4:5.
  logos: null,
};

export const TIMING: Timing = {
  seconds: 6.5,
  fps: 30,
  wipe: { start: 0.7, full: 1.05, end: 1.45 },
  badgeAt: 1.0,
  beats: {
    mark: 0.1,
    meta: 0.4,
    drop: 0,
    fragments: 0.3,
    rule: 0.7,
    foot: 1.0,
    pop: 0.6,
    refine: 1.0,
    sharp: 1.8,
    name: 2.0,
    headline: 3.2,
    url: 3.9,
    logos: 4.2,
  },
};

export const buildAndPitch: Theme = {
  id: "build-and-pitch",
  name: "Build & Pitch",
  colors: {
    background: "#0a0a0a",
    card: "#141414",
    accent: "#d7ff3a",
    text: "#f7f7f2",
  },
  fonts: {
    display: '"Geist Pixel", "Geist Mono Variable", monospace',
    body: '"Geist Mono Variable", ui-monospace, monospace',
    preload: ['64px "Geist Pixel"', '30px "Geist Mono Variable"'],
  },
  wordmark: {
    parts: [
      { text: "build", color: "text" },
      { text: "&", color: "accent" },
      { text: "pitch", color: "text" },
    ],
  },
  mark: { grid: AMPERSAND },
  copy: {
    byline: "by Open2",
    dateLine: "21.11.26",
    footer: "{date} | UVG",
    footerTag: "Hackathon",
    headline: "Estoy dentro.",
    url: "open2.io/build-and-pitch",
    shareText: "Estoy dentro de Build & Pitch. 21.11 en la UVG. open2.io/build-and-pitch",
    defaults: { name: "Ada Lovelace", role: "Builder", team: "" },
  },
  // The shipped badge has no sponsor strip. Add files under public/logos and
  // list them here, e.g. [{ src: "logos/uvg.png", name: "UVG" }].
  logos: [],
  formats: { story: STORY, post: POST },
  timing: TIMING,
  effects: {
    rain: true,
    wipe: true,
    fragments: true,
    sparks: true,
    strap: true,
    halftone: { grid: 88, duotoneAlpha: 0.45 },
    refine: [12, 20, 32, 52],
  },
  filePrefix: "build-and-pitch",
};
