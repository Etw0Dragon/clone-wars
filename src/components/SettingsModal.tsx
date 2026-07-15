import { useState } from "react";
import type { GameSettings, KeyBindings, RenderQuality } from "../game/persistence";

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}

const BINDING_LABELS: Array<[keyof KeyBindings, string, string]> = [
  ["cameraUp", "Déplacer la caméra vers le haut", "W"],
  ["cameraDown", "Déplacer la caméra vers le bas", "S"],
  ["cameraLeft", "Déplacer la caméra à gauche", "A"],
  ["cameraRight", "Déplacer la caméra à droite", "D"],
  ["rotateLeft", "Pivoter la caméra à gauche", "Q"],
  ["rotateRight", "Pivoter la caméra à droite", "E"],
  ["pause", "Pause / reprendre", "P"],
  ["cancel", "Annuler un mode", "Échap"],
  ["attackModifier", "Marche d’attaque (clic droit)", "Maj"],
];

function displayKey(value: string): string {
  const names: Record<string, string> = {
    escape: "ÉCHAP", space: "ESPACE", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", shift: "MAJ",
  };
  return names[value] ?? value.toUpperCase();
}

function normalizeKey(value: string): string {
  const key = value.toLowerCase();
  const aliases: Record<string, string> = { " ": "space", escape: "escape", arrowup: "arrowup", arrowdown: "arrowdown", arrowleft: "arrowleft", arrowright: "arrowright", shift: "shift" };
  return aliases[key] ?? (key.length === 1 ? key : key.replace(/^key/, ""));
}

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  const [capturing, setCapturing] = useState<keyof KeyBindings | null>(null);
  const [captureError, setCaptureError] = useState("");

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const updateBinding = (binding: keyof KeyBindings, value: string) => {
    const duplicate = Object.entries(settings.keybindings).some(([key, current]) => key !== binding && current === value);
    if (duplicate) {
      setCaptureError("Cette touche est déjà utilisée.");
      return;
    }
    setCaptureError("");
    onChange({ ...settings, keybindings: { ...settings.keybindings, [binding]: value } });
    setCapturing(null);
  };

  const reset = () => {
    onChange({
      ...settings,
      renderQuality: "standard",
      shadows: true,
      reducedMotion: false,
      masterVolume: 0.6,
      sfxEnabled: true,
      highContrast: false,
      tutorialVisible: true,
      cameraSpeed: 1,
      keybindings: { ...settings.keybindings, cameraUp: "w", cameraDown: "s", cameraLeft: "a", cameraRight: "d", rotateLeft: "q", rotateRight: "e", pause: "p", cancel: "escape", attackModifier: "shift" },
    });
    setCaptureError("");
  };

  return (
    <div className="settings-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <p className="eyebrow">CONFIGURATION // LOCALE</p>
            <h2 id="settings-title">PARAMÈTRES DE LA FOUNDRY</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer les paramètres">×</button>
        </header>

        <div className="settings-body">
          <div className="settings-grid">
            <section className="settings-section">
              <div className="settings-heading"><span>01</span><h3>VISUEL &amp; CONFORT</h3></div>
              <p className="settings-hint">Ces options s’appliquent à la prochaine partie.</p>
              <label className="setting-label">RÉSOLUTION DES TEXTURES / RENDU</label>
              <div className="quality-options" role="radiogroup" aria-label="Qualité du rendu">
                {(["eco", "standard", "high"] as RenderQuality[]).map((quality) => (
                  <button key={quality} type="button" className={`quality-option ${settings.renderQuality === quality ? "is-selected" : ""}`} onClick={() => update("renderQuality", quality)} role="radio" aria-checked={settings.renderQuality === quality}>
                    <strong>{quality === "eco" ? "ÉCO" : quality === "standard" ? "STANDARD" : "HAUTE"}</strong>
                    <small>{quality === "eco" ? "Fluidité maximale" : quality === "standard" ? "Équilibre recommandé" : "Détails et ombres"}</small>
                  </button>
                ))}
              </div>
              <div className="setting-toggles">
                <label className="toggle-row"><span><strong>Ombres dynamiques</strong><small>Plus lisible, plus gourmand</small></span><input type="checkbox" checked={settings.shadows} onChange={(event) => update("shadows", event.target.checked)} /></label>
                <label className="toggle-row"><span><strong>Réduire les animations</strong><small>Pour une interface plus calme</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => update("reducedMotion", event.target.checked)} /></label>
                <label className="toggle-row"><span><strong>Contraste renforcé</strong><small>Contours plus visibles</small></span><input type="checkbox" checked={settings.highContrast} onChange={(event) => update("highContrast", event.target.checked)} /></label>
                <label className="toggle-row"><span><strong>Afficher les conseils</strong><small>Rappels utiles en partie</small></span><input type="checkbox" checked={settings.tutorialVisible} onChange={(event) => update("tutorialVisible", event.target.checked)} /></label>
              </div>
              <label className="setting-label" htmlFor="camera-speed">VITESSE DE CAMÉRA <output>{Math.round(settings.cameraSpeed * 100)}%</output></label>
              <input id="camera-speed" className="setting-range" type="range" min="0.65" max="1.5" step="0.05" value={settings.cameraSpeed} onChange={(event) => update("cameraSpeed", Number(event.target.value))} />
            </section>

            <section className="settings-section">
              <div className="settings-heading"><span>02</span><h3>AUDIO</h3></div>
              <label className="setting-label" htmlFor="master-volume">VOLUME GÉNÉRAL <output>{Math.round(settings.masterVolume * 100)}%</output></label>
              <input id="master-volume" className="setting-range" type="range" min="0" max="1" step="0.05" value={settings.masterVolume} onChange={(event) => update("masterVolume", Number(event.target.value))} />
              <label className="toggle-row standalone"><span><strong>Effets sonores</strong><small>Alertes, construction et combat</small></span><input type="checkbox" checked={settings.sfxEnabled} onChange={(event) => update("sfxEnabled", event.target.checked)} /></label>

              <div className="settings-heading controls-heading"><span>03</span><h3>TOUCHES</h3></div>
              <p className="settings-hint">Cliquez sur une touche puis appuyez sur la nouvelle touche.</p>
              <div className="keybinding-list">
                {BINDING_LABELS.map(([binding, label, fallback]) => (
                  <div className="keybinding-row" key={binding}>
                    <span>{label}</span>
                    <button type="button" className={`keybinding-capture ${capturing === binding ? "is-listening" : ""}`} onClick={() => { setCapturing(binding); setCaptureError(""); }} onKeyDown={(event) => { if (capturing !== binding) return; event.preventDefault(); if (event.key === "Escape") { setCapturing(null); return; } updateBinding(binding, normalizeKey(event.key)); }} aria-label={`Changer la touche : ${label}`}>
                      {capturing === binding ? "APPUYEZ…" : displayKey(settings.keybindings[binding] || fallback)}
                    </button>
                  </div>
                ))}
              </div>
              {captureError ? <p className="settings-error" role="alert">{captureError}</p> : null}
            </section>
          </div>
        </div>

        <footer className="settings-footer">
          <button type="button" className="text-button" onClick={reset}>RÉINITIALISER</button>
          <button type="button" className="launch-button settings-done" onClick={onClose}><span>ENREGISTRER &amp; FERMER</span><b>↗</b></button>
        </footer>
      </section>
    </div>
  );
}
