import type { GameSnapshot } from "./types";

const CAREER_KEY = "clone-war:career-v1";
const SETTINGS_KEY = "clone-war:settings-v1";

export interface CareerStats {
  matches: number;
  victories: number;
  clonesProduced: number;
  sectorsCaptured: number;
  bestVictorySeconds: number | null;
}

export type RenderQuality = "eco" | "standard" | "high";

export interface KeyBindings {
  cameraUp: string;
  cameraDown: string;
  cameraLeft: string;
  cameraRight: string;
  rotateLeft: string;
  rotateRight: string;
  pause: string;
  cancel: string;
  attackModifier: string;
}

export interface GameSettings {
  renderQuality: RenderQuality;
  shadows: boolean;
  reducedMotion: boolean;
  masterVolume: number;
  sfxEnabled: boolean;
  highContrast: boolean;
  tutorialVisible: boolean;
  cameraSpeed: number;
  keybindings: KeyBindings;
}

export const DEFAULT_SETTINGS: GameSettings = {
  renderQuality: "standard",
  shadows: true,
  reducedMotion: false,
  masterVolume: 0.6,
  sfxEnabled: true,
  highContrast: false,
  tutorialVisible: true,
  cameraSpeed: 1,
  keybindings: {
    cameraUp: "w",
    cameraDown: "s",
    cameraLeft: "a",
    cameraRight: "d",
    rotateLeft: "q",
    rotateRight: "e",
    pause: "p",
    cancel: "escape",
    attackModifier: "shift",
  },
};

const EMPTY_CAREER: CareerStats = {
  matches: 0,
  victories: 0,
  clonesProduced: 0,
  sectorsCaptured: 0,
  bestVictorySeconds: null,
};

export function loadCareerStats(): CareerStats {
  try {
    const stored = localStorage.getItem(CAREER_KEY);
    if (!stored) return { ...EMPTY_CAREER };
    const parsed = JSON.parse(stored) as Partial<CareerStats>;
    return {
      matches: Number.isFinite(parsed.matches) ? parsed.matches! : 0,
      victories: Number.isFinite(parsed.victories) ? parsed.victories! : 0,
      clonesProduced: Number.isFinite(parsed.clonesProduced) ? parsed.clonesProduced! : 0,
      sectorsCaptured: Number.isFinite(parsed.sectorsCaptured) ? parsed.sectorsCaptured! : 0,
      bestVictorySeconds: typeof parsed.bestVictorySeconds === "number" ? parsed.bestVictorySeconds : null,
    };
  } catch {
    return { ...EMPTY_CAREER };
  }
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function defaultSettings(): GameSettings {
  return { ...DEFAULT_SETTINGS, keybindings: { ...DEFAULT_SETTINGS.keybindings } };
}

export function applySettings(settings: GameSettings): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.contrast = settings.highContrast ? "high" : "standard";
  document.documentElement.dataset.motion = settings.reducedMotion ? "reduced" : "full";
}

export function loadSettings(): GameSettings {
  try {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(SETTINGS_KEY);
    if (!stored) {
      const defaults = defaultSettings();
      applySettings(defaults);
      return defaults;
    }
    const parsed = JSON.parse(stored) as Partial<GameSettings>;
    const keybindings = { ...DEFAULT_SETTINGS.keybindings, ...(parsed.keybindings ?? {}) };
    const settings: GameSettings = {
      renderQuality: parsed.renderQuality === "eco" || parsed.renderQuality === "high" ? parsed.renderQuality : "standard",
      shadows: typeof parsed.shadows === "boolean" ? parsed.shadows : DEFAULT_SETTINGS.shadows,
      reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      masterVolume: clamp(parsed.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
      sfxEnabled: typeof parsed.sfxEnabled === "boolean" ? parsed.sfxEnabled : DEFAULT_SETTINGS.sfxEnabled,
      highContrast: typeof parsed.highContrast === "boolean" ? parsed.highContrast : DEFAULT_SETTINGS.highContrast,
      tutorialVisible: typeof parsed.tutorialVisible === "boolean" ? parsed.tutorialVisible : DEFAULT_SETTINGS.tutorialVisible,
      cameraSpeed: clamp(parsed.cameraSpeed, 0.65, 1.5, DEFAULT_SETTINGS.cameraSpeed),
      keybindings: Object.fromEntries(
        Object.entries(DEFAULT_SETTINGS.keybindings).map(([key, fallback]) => [
          key,
          typeof keybindings[key as keyof KeyBindings] === "string" && keybindings[key as keyof KeyBindings]
            ? keybindings[key as keyof KeyBindings]
            : fallback,
        ]),
      ) as KeyBindings,
    };
    applySettings(settings);
    return settings;
  } catch {
    const defaults = defaultSettings();
    applySettings(defaults);
    return defaults;
  }
}

export function saveSettings(settings: GameSettings): void {
  applySettings(settings);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; a blocked storage must not stop a match.
  }
}

export function recordMatch(snapshot: GameSnapshot): void {
  if (snapshot.phase !== "victory" && snapshot.phase !== "defeat") return;
  try {
    const career = loadCareerStats();
    career.matches += 1;
    career.victories += snapshot.phase === "victory" ? 1 : 0;
    career.clonesProduced += snapshot.stats.clonesProduced;
    career.sectorsCaptured += Math.max(0, snapshot.stats.territoryPeak - 1);
    if (
      snapshot.phase === "victory" &&
      (career.bestVictorySeconds === null || snapshot.elapsedSeconds < career.bestVictorySeconds)
    ) career.bestVictorySeconds = Math.round(snapshot.elapsedSeconds);
    localStorage.setItem(CAREER_KEY, JSON.stringify(career));
  } catch {
    // Storage can be unavailable in private browsing; gameplay must continue.
  }
}
