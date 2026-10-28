import "@fontsource/geist-pixel";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

import {
  canEncodeCanvasVideo,
  drawFrame,
  encodeCanvasVideo,
  loadTheme,
  type BadgeFormat,
  type BadgeInput,
  type Theme,
  type ThemeAssets,
} from "./engine";
import { themeById, themes } from "./themes";

/**
 * The badge maker page. State lives in one object; every change redraws the
 * picture, or restarts the clip preview and its MP4 encoding. Query params
 * (`?theme=&name=&role=&team=&format=&kind=`) prefill the form, so a link can
 * hand someone their badge ready to download.
 */

type Kind = "image" | "video";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("canvas");
const form = $<HTMLFormElement>("controls");
const themeSelect = $<HTMLSelectElement>("theme");
const nameInput = $<HTMLInputElement>("name");
const roleInput = $<HTMLInputElement>("role");
const teamInput = $<HTMLInputElement>("team");
const photoInput = $<HTMLInputElement>("photo");
const photoLabel = $("photo-label");
const sliders = $("sliders");
const zoomInput = $<HTMLInputElement>("zoom");
const fxInput = $<HTMLInputElement>("fx");
const fyInput = $<HTMLInputElement>("fy");
const progress = $("progress");
const progressBar = $("progress-bar");
const progressLabel = $("progress-label");
const shareButton = $<HTMLButtonElement>("share");
const downloadButton = $<HTMLButtonElement>("download");
const errorLine = $("error");
const kindField = $<HTMLFieldSetElement>("kind");

const params = new URLSearchParams(location.search);

const state = {
  theme: themeById(params.get("theme")),
  assets: null as ThemeAssets | null,
  kind: (params.get("kind") === "video" ? "video" : "image") as Kind,
  format: (params.get("format") === "post" ? "post" : "story") as BadgeFormat,
  photo: null as HTMLImageElement | null,
  videoOk: false,
};

// The file of what is on screen, made in the background after every change.
// Sharing has to run inside the tap itself (Safari and Chrome drop the
// permission across an await), so the file must already exist when the
// button is pressed.
let file: File | null = null;
let stopRun: (() => void) | null = null;

for (const theme of themes) themeSelect.add(new Option(theme.name, theme.id));
themeSelect.value = state.theme.id;
fillDefaults(state.theme, true);
(form.elements.namedItem("format") as RadioNodeList).value = state.format;
(form.elements.namedItem("kind") as RadioNodeList).value = state.kind;

/** Puts the theme's sample person in the form, without overwriting what someone typed. */
function fillDefaults(theme: Theme, fromUrl = false) {
  const d = theme.copy.defaults;
  nameInput.value = (fromUrl && params.get("name")) || d.name;
  roleInput.value = (fromUrl && params.get("role")) || d.role;
  teamInput.value = (fromUrl && params.get("team")) || d.team;
}

function input(): BadgeInput {
  const photo = state.photo;
  return {
    format: state.format,
    name: nameInput.value,
    role: roleInput.value,
    team: teamInput.value.trim() || null,
    photo,
    photoSize: photo ? { width: photo.naturalWidth, height: photo.naturalHeight } : null,
    zoom: Number(zoomInput.value),
    focus: { x: Number(fxInput.value), y: Number(fyInput.value) },
  };
}

function fileName() {
  return `${state.theme.filePrefix}-${state.format}.${state.kind === "video" ? "mp4" : "png"}`;
}

function setError(message: string) {
  errorLine.textContent = message;
}

function setBusy(busy: boolean) {
  shareButton.disabled = busy;
  downloadButton.disabled = busy;
  const noun = state.kind === "video" ? "video" : "imagen";
  shareButton.textContent = `Compartir ${noun}`;
  downloadButton.textContent = `Descargar ${noun}`;
}

function setProgress(value: number | null) {
  progress.hidden = state.kind !== "video";
  const done = value == null || value >= 1;
  progressBar.style.transform = `scaleX(${value ?? 1})`;
  progressLabel.textContent = done ? "Tu video está listo" : `Armando tu video ${Math.round(value * 100)}%`;
}

/** Redraws everything for the current state, cancelling any clip in flight. */
function render() {
  stopRun?.();
  stopRun = null;
  file = null;
  const assets = state.assets;
  if (!assets) return;
  const theme = state.theme;
  const badge = input();
  const name = fileName();

  if (state.kind === "image") {
    setBusy(false);
    setProgress(null);
    drawFrame(canvas, theme, assets, badge, null);
    let alive = true;
    canvas.toBlob((data) => {
      if (alive && data) file = new File([data], name, { type: "image/png" });
    }, "image/png");
    stopRun = () => {
      alive = false;
    };
    return;
  }

  // The clip: the preview plays on a loop while the MP4 is made off screen.
  // A change while encoding drops that file and starts over, after a short
  // pause so dragging a slider does not encode every step.
  setBusy(true);
  setProgress(0);
  const { seconds, fps } = theme.timing;
  const { width, height } = theme.formats[badge.format];
  let frame = 0;
  const start = performance.now();
  const play = (now: number) => {
    drawFrame(canvas, theme, assets, badge, ((now - start) / 1000) % seconds);
    frame = requestAnimationFrame(play);
  };
  frame = requestAnimationFrame(play);

  const abort = new AbortController();
  const wait = setTimeout(() => {
    encodeCanvasVideo({
      width,
      height,
      seconds,
      fps,
      drawFrame: (target, t) => drawFrame(target, theme, assets, badge, t),
      onProgress: (done) => {
        if (!abort.signal.aborted) setProgress(done);
      },
      signal: abort.signal,
    })
      .then((blob) => {
        if (abort.signal.aborted) return;
        file = new File([blob], name, { type: "video/mp4" });
        setProgress(1);
        setBusy(false);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        setBusy(false);
        setError("No pudimos armar el video. Descarga la imagen o intenta de nuevo.");
      });
  }, 500);

  stopRun = () => {
    cancelAnimationFrame(frame);
    clearTimeout(wait);
    abort.abort();
  };
}

async function useTheme(theme: Theme) {
  state.theme = theme;
  state.assets = null;
  // The page's own accent follows the badge's.
  document.documentElement.style.setProperty("--accent", theme.colors.accent);
  const assets = await loadTheme(theme);
  // A faster pick may have replaced this theme while it loaded.
  if (state.theme !== theme) return;
  state.assets = assets;
  render();
}

function save(target: File) {
  const url = URL.createObjectURL(target);
  const a = document.createElement("a");
  a.href = url;
  a.download = target.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The ready file, or for a picture a fresh one when the last draw has not finished encoding. */
function current(): Promise<File | null> {
  if (file || state.kind === "video") return Promise.resolve(file);
  const name = fileName();
  return new Promise((resolve) => {
    canvas.toBlob((data) => resolve(data ? new File([data], name, { type: "image/png" }) : null), "image/png");
  });
}

async function download() {
  setError("");
  const target = await current();
  if (!target) {
    setError(state.kind === "video" ? "Tu video aún se está armando." : "No pudimos generar la imagen.");
    return;
  }
  save(target);
}

form.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  setError("");
  if ((target as HTMLElement) === themeSelect || target === photoInput) return;
  if (target.name === "kind") state.kind = target.value as Kind;
  if (target.name === "format") state.format = target.value as BadgeFormat;
  render();
});

themeSelect.addEventListener("change", () => {
  const theme = themeById(themeSelect.value);
  fillDefaults(theme);
  void useTheme(theme);
});

photoInput.addEventListener("change", () => {
  const picked = photoInput.files?.[0];
  if (!picked) return;
  setError("");
  if (!picked.type.startsWith("image/")) {
    setError("Elige una imagen.");
    return;
  }
  const img = new Image();
  img.onload = () => {
    state.photo = img;
    zoomInput.value = "1";
    fxInput.value = "0";
    fyInput.value = "0";
    sliders.hidden = false;
    photoLabel.textContent = "Cambiar foto";
    render();
  };
  img.onerror = () => setError("No pudimos abrir esa foto. Prueba con otra.");
  img.src = URL.createObjectURL(picked);
});

shareButton.addEventListener("click", () => {
  setError("");
  const payload = file ? { files: [file], text: state.theme.copy.shareText } : null;
  // No await before navigator.share: it must run inside the tap.
  if (payload && typeof navigator.share === "function" && navigator.canShare?.(payload)) {
    navigator.share(payload).catch(() => {
      // Closing the share sheet is not an error worth showing.
    });
    return;
  }
  // Desktop browsers and older phones cannot share files: save it instead.
  void download();
});

downloadButton.addEventListener("click", () => void download());

// Video is offered only where the browser can encode it; elsewhere the
// picture is the whole tool.
const { width, height } = state.theme.formats.story;
void canEncodeCanvasVideo(width, height).then((ok) => {
  state.videoOk = ok;
  kindField.hidden = !ok;
  if (!ok && state.kind === "video") {
    state.kind = "image";
    (form.elements.namedItem("kind") as RadioNodeList).value = "image";
    render();
  }
});

void useTheme(state.theme);
