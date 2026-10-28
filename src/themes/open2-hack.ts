import type { Theme } from "../engine/types";
import { POST, STORY, TIMING } from "./build-and-pitch";

/**
 * Example of a second event built on the same engine: Open2 Hack's lava on
 * carbon, a sans display face, a pixel volcano as the placeholder and a logo
 * strip. Everything not set here is reused from Build & Pitch.
 */

const VOLCANO = [
  "......##......",
  ".....#..#.....",
  "......##......",
  ".....####.....",
  "....######....",
  "....######....",
  "...########...",
  "..##########..",
  "..##########..",
  ".############.",
  "##############",
];

export const open2Hack: Theme = {
  id: "open2-hack",
  name: "Open2 Hack (ejemplo)",
  colors: {
    background: "#141414",
    card: "#1f1d1b",
    accent: "#f26722",
    text: "#f4efe8",
  },
  fonts: {
    display: '"Geist Variable", system-ui, sans-serif',
    displayWeight: 700,
    body: '"Geist Mono Variable", ui-monospace, monospace',
    preload: ['700 64px "Geist Variable"', '30px "Geist Mono Variable"'],
  },
  wordmark: {
    parts: [
      { text: "open2", color: "text" },
      { text: " hack", color: "accent" },
    ],
  },
  mark: { grid: VOLCANO },
  copy: {
    byline: "32 h de hacking",
    dateLine: "04-06.12.26",
    footer: "{date} | GT",
    footerTag: "Hackathon",
    headline: "Estoy dentro.",
    url: "hack.open2.io",
    shareText: "Estoy dentro de Open2 Hack. hack.open2.io",
    defaults: { name: "Grace Hopper", role: "Hacker", team: "" },
  },
  logos: [{ src: "logos/open2.svg", name: "Open2" }],
  formats: { story: STORY, post: POST },
  timing: TIMING,
  effects: {
    rain: true,
    wipe: true,
    fragments: true,
    sparks: true,
    strap: true,
    halftone: { grid: 72, duotoneAlpha: 0.5 },
    refine: [12, 20, 32, 52],
  },
  filePrefix: "open2-hack",
};
