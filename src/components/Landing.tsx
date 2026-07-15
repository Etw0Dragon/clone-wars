import { useMemo, useState } from "react";
import { gameSession } from "../game/session";
import { loadCareerStats, loadSettings, saveSettings, type GameSettings } from "../game/persistence";
import { GuideModal } from "./GuideModal";
import { SettingsModal } from "./SettingsModal";
import { MatchSetupModal } from "./MatchSetupModal";
import type { MatchConfig } from "../game/types";

function randomSeed(): number {
  if (typeof crypto !== "undefined") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? Date.now();
  }
  return Date.now() >>> 0;
}

function parseSeed(input: string): number {
  const normalized = input.trim();
  if (/^[0-9a-f]{1,8}$/i.test(normalized)) return Number.parseInt(normalized, 16) >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function Landing() {
  const initialSeed = useMemo(() => randomSeed().toString(16).toUpperCase().padStart(8, "0"), []);
  const [seed, setSeed] = useState(initialSeed);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [matchConfig, setMatchConfig] = useState<MatchConfig>({ mapPreset: "standard", aiCount: 1 });
  const career = useMemo(() => loadCareerStats(), []);

  const regenerate = () => setSeed(randomSeed().toString(16).toUpperCase().padStart(8, "0"));
  const launch = () => gameSession.start(parseSeed(seed), matchConfig);
  const changeSettings = (next: GameSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  return (
    <main className="landing">
      <div className="landing-noise" />
      <header className="landing-header">
        <div className="brand-chip">
          <span className="brand-mark" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span>CW//01</span>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          SIMULATION LOCALE
        </div>
        <div className="landing-header-actions">
          <button type="button" className="guide-open-button" onClick={() => setGuideOpen(true)}>
            <span>?</span> COMMENT JOUER <b>↗</b>
          </button>
          <button type="button" className="settings-open-button" onClick={() => setSettingsOpen(true)} aria-label="Ouvrir les paramètres">
            <span aria-hidden="true">⚙</span> PARAMÈTRES
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="hero-index" aria-hidden="true">01</div>
        <div className="hero-copy">
          <p className="eyebrow">PROGRAMME D’EXPANSION SYNTHÉTIQUE</p>
          <h1>
            <span>CLONE</span>
            <span className="outline-text">WAR</span>
          </h1>
          <p className="hero-lead">
            Construisez une colonie qui respire. Nourrissez ses cuves. Coupez les veines adverses.
            <strong> Il ne doit rester qu’un noyau.</strong>
          </p>
        </div>

        <aside className="launch-panel">
          <div className="panel-ruler"><span>EXPÉRIENCE</span><span>SOLO // {matchConfig.aiCount} IA</span></div>
          <label htmlFor="seed">SIGNATURE DE CARTE</label>
          <div className="seed-control">
            <span>0x</span>
            <input
              id="seed"
              value={seed}
              maxLength={20}
              onChange={(event) => setSeed(event.target.value.toUpperCase())}
              onKeyDown={(event) => { if (event.key === "Enter") launch(); }}
              spellCheck={false}
            />
            <button type="button" className="icon-button" onClick={regenerate} aria-label="Générer une nouvelle carte">↻</button>
          </div>
          <button type="button" className="launch-button" onClick={launch}>
            <span>DÉMARRER L’EXPÉRIENCE</span>
            <b>↗</b>
          </button>
          <div className="launch-meta">
            <span>1 JOUEUR / {matchConfig.aiCount} IA</span>
            <span>≈ 15–20 MIN</span>
            <span>{matchConfig.mapPreset.toUpperCase()} // SEED</span>
          </div>
          <button type="button" className="launch-guide-button match-config-button" onClick={() => setSetupOpen(true)}><span>⌘</span> CONFIGURER SOLO, IA &amp; CARTE <b>↗</b></button>
          <button type="button" className="launch-guide-button" onClick={() => setGuideOpen(true)}>
            <span>?</span> NOUVEAU CLONE ? LIRE LE GUIDE DE DÉPART <b>↗</b>
          </button>
        </aside>
      </section>

      <section className="manifesto-strip" aria-label="Principes du jeu">
        <article>
          <span className="manifest-number">A</span>
          <div><h2>ALIMENTER</h2><p>Biomasse, minerai et énergie circulent dans une base vulnérable.</p></div>
        </article>
        <article>
          <span className="manifest-number">B</span>
          <div><h2>MULTIPLIER</h2><p>Configurez les cuves et déployez jusqu’à 200 clones spécialisés.</p></div>
        </article>
        <article>
          <span className="manifest-number">C</span>
          <div><h2>ASSIMILER</h2><p>Capturez les tissus de la carte, puis détruisez le noyau rival.</p></div>
        </article>
      </section>

      <footer className="landing-footer">
        <span>PROTOTYPE MÉCANIQUE // TEXTURES NON DÉFINITIVES</span>
        <span className="career-line">ARCHIVES {career.matches.toString().padStart(2, "0")} · VICTOIRES {career.victories.toString().padStart(2, "0")} · CLONES {career.clonesProduced.toString().padStart(3, "0")}</span>
        <span>THREE.JS / SIMULATION 20 HZ</span>
      </footer>
      {guideOpen ? <GuideModal onClose={() => setGuideOpen(false)} /> : null}
      {settingsOpen ? <SettingsModal settings={settings} onChange={changeSettings} onClose={() => setSettingsOpen(false)} /> : null}
      {setupOpen ? <MatchSetupModal config={matchConfig} onApply={setMatchConfig} onClose={() => setSetupOpen(false)} /> : null}
    </main>
  );
}
