import type { Theme, ThemeAssets } from "./types";

/** Resolves a theme path against the site's base, leaving full URLs alone. */
export function assetUrl(src: string) {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^\//, "")}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    // A missing logo should not break the badge: it is skipped and reported.
    img.onerror = () => {
      console.warn(`[badges] could not load ${src}`);
      resolve(null);
    };
    img.src = assetUrl(src);
  });
}

/** Waits for the theme's fonts and images, so no frame bakes in a fallback. */
export async function loadTheme(theme: Theme): Promise<ThemeAssets> {
  const fonts = Promise.all(theme.fonts.preload.map((spec) => document.fonts.load(spec))).catch(() => undefined);
  const [wordmark, mark, logos] = await Promise.all([
    "image" in theme.wordmark ? loadImage(theme.wordmark.image) : Promise.resolve(null),
    "image" in theme.mark ? loadImage(theme.mark.image) : Promise.resolve(null),
    Promise.all(theme.logos.map((logo) => loadImage(logo.src))),
    fonts,
  ]);
  return { wordmark, mark, logos: logos.filter((img): img is HTMLImageElement => img != null) };
}
