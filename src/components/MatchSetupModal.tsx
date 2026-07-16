import type { MapPreset, MatchConfig } from "../game/types";

interface MatchSetupModalProps {
  config: MatchConfig;
  onApply: (config: MatchConfig) => void;
  onClose: () => void;
}

const MAPS: Array<{ id: MapPreset; name: string; detail: string; sectors: string }> = [
  { id: "compact", name: "COMPACTE", detail: "Confrontation rapide, canaux serrés.", sectors: "16 SECTEURS" },
  { id: "standard", name: "STANDARD", detail: "Deux masses de terre et des routes maritimes.", sectors: "25 SECTEURS" },
  { id: "frontier", name: "FRONTIÈRE", detail: "Plus de relief, de rivages et de lignes à défendre.", sectors: "36 SECTEURS" },
];

export function MatchSetupModal({ config, onApply, onClose }: MatchSetupModalProps) {
  const update = <K extends keyof MatchConfig>(key: K, value: MatchConfig[K]) => onApply({ ...config, [key]: value });
  return (
    <div className="settings-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal match-setup-modal" role="dialog" aria-modal="true" aria-labelledby="match-setup-title">
        <header className="settings-header">
          <div><p className="eyebrow">PROTOCOLE D’ENGAGEMENT // 00</p><h2 id="match-setup-title">CONFIGURER LA PARTIE</h2></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer la configuration">×</button>
        </header>
        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-heading"><span>01</span><h3>MODE</h3></div>
            <div className="mode-options">
              <button type="button" className={`mode-option ${config.mode !== "classic" ? "is-selected" : ""}`} onClick={() => update("mode", "frontline")}><strong>FRONTLINE</strong><small>Conquête par garnisons, fronts et doctrines.</small></button>
              <button type="button" className={`mode-option ${config.mode === "classic" ? "is-selected" : ""}`} onClick={() => update("mode", "classic")}><strong>CLASSIQUE</strong><small>Prototype industriel avec microgestion complète.</small></button>
              <button type="button" className="mode-option is-locked" disabled><strong>MULTI</strong><small>PROCHAINE PHASE DE DÉVELOPPEMENT</small></button>
            </div>
          </section>
          <section className="settings-section match-section">
            <div className="settings-heading"><span>02</span><h3>TAILLE DE CARTE</h3></div>
            <div className="match-map-options">
              {MAPS.map((map) => <button type="button" key={map.id} className={`match-map-option ${config.mapPreset === map.id ? "is-selected" : ""}`} onClick={() => update("mapPreset", map.id)}><span>{map.sectors}</span><strong>{map.name}</strong><small>{map.detail}</small></button>)}
            </div>
          </section>
          <section className="settings-section match-section">
            <div className="settings-heading"><span>03</span><h3>COLONIES IA</h3></div>
            <p className="settings-hint">En Frontline, chaque IA engage des garnisons automatiquement et choisit ses propres fronts.</p>
            <div className="quality-options ai-options">
              {[1, 2, 3].map((count) => <button type="button" key={count} className={`quality-option ${config.aiCount === count ? "is-selected" : ""}`} onClick={() => update("aiCount", count)}><strong>{count} IA</strong><small>{count === 1 ? "Duel tactique" : count === 2 ? "Pression double" : "Front chaotique"}</small></button>)}
            </div>
          </section>
        </div>
        <footer className="settings-footer"><span className="match-summary">{(config.mode ?? "classic").toUpperCase()} · {MAPS.find((map) => map.id === config.mapPreset)?.sectors} · {config.aiCount} IA</span><button type="button" className="launch-button settings-done" onClick={onClose}><span>VALIDER LA CONFIGURATION</span><b>↗</b></button></footer>
      </section>
    </div>
  );
}
