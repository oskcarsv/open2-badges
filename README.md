# open2-badges

Event badges as **PNG** and **MP4 video**, drawn on a `<canvas>` in the browser. The photo never leaves the device: nothing is uploaded, the video is encoded locally with WebCodecs (H.264) and muxed with [mediabunny](https://mediabunny.dev).

Extracted from the Build & Pitch badge maker in `open2-app` (`packages/ui/src/build-pitch-badge.ts`) and made theme-driven, so a new event is a new file instead of a code change.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + static build in dist/
```

## How it works

```
src/
  engine/
    types.ts     Theme and BadgeInput: every knob the design has
    draw.ts      drawFrame(canvas, theme, assets, input, t): any instant of the clip; t = null is the still PNG
    video.ts     encodeCanvasVideo: draws each frame at its exact time and encodes an MP4
    assets.ts    loadTheme: waits for fonts and loads logo images before drawing
  themes/
    build-and-pitch.ts   the shipped Build & Pitch badge (ink + volt, Geist Pixel)
    open2-hack.ts        example of a second event reusing the layout
    index.ts             the list of themes the app offers (first = default)
  main.ts        the page: form, preview, share and download
public/logos/    logo files referenced by themes
```

The clip and the still are the same drawing: every element is a function of time, so the last frame of the video is the PNG.

## Change the design

Everything lives in a theme (`src/themes/*.ts`). Fields are documented in `src/engine/types.ts`.

| You want to change | Edit |
| --- | --- |
| Colours | `colors.background`, `card`, `accent`, `text` |
| Fonts | `fonts.display`, `fonts.body`, `fonts.displayWeight`, `fonts.preload`. Install the font (e.g. `npm i @fontsource/...`) and import it in `src/main.ts` |
| Top-left brand | `wordmark.parts` (typed text, each part with a colour role) or `wordmark: { image: "logos/x.svg", height: 56 }` |
| Placeholder when there is no photo | `mark.grid` (rows of `#` and `.`) or `mark: { image: "logos/x.png" }` |
| Text | `copy.byline`, `dateLine`, `footer` (`{date}` is replaced), `footerTag`, `headline`, `url`, `shareText` |
| Sponsor logos | Drop files in `public/logos/` and list them in `logos: [{ src: "logos/x.png" }]`. White or single-colour files read best on dark backgrounds |
| Sizes and positions | `formats.story` / `formats.post`: canvas size, card, photo, name sizes, headline, logo strip |
| Video length, fps and rhythm | `timing.seconds`, `timing.fps`, `timing.wipe`, `timing.beats` (seconds after `badgeAt`) |
| Effects on and off | `effects.rain`, `wipe`, `fragments`, `sparks`, `strap`, `halftone`, `refine` |
| Download file name | `filePrefix` |

### New event in three steps

1. Copy `src/themes/open2-hack.ts` to `src/themes/my-event.ts` and edit it.
2. Put its logos in `public/logos/`.
3. Add it to the list in `src/themes/index.ts`.

## Links that prefill the badge

Query params fill the form, so you can send someone a link with their badge ready:

```
/?theme=build-and-pitch&name=Ada%20Lovelace&role=Builder&team=Los%20Pixeles&format=story&kind=video
```

`format` is `story` (1080x1920) or `post` (1080x1350); `kind` is `image` or `video`.

## Notes

- Video is offered only where the browser can encode H.264 (`VideoEncoder`): recent Chrome, Edge and Safari. Elsewhere the page offers the PNG only.
- Logos load from the same origin, so canvas export is never blocked. External logo URLs must send CORS headers.
- The badge never carries the attendee's QR: that stays on the private pass.
