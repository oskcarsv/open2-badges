import type { Theme } from "../engine/types";
import { buildAndPitch } from "./build-and-pitch";
import { open2Hack } from "./open2-hack";

/** Every theme the app offers. The first one is the default. */
export const themes: Theme[] = [buildAndPitch, open2Hack];

export function themeById(id: string | null | undefined): Theme {
  return themes.find((theme) => theme.id === id) ?? themes[0]!;
}
