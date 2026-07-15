import { BIOMES } from "../game/config";
import { gameSession, type SessionState } from "../game/session";

interface DeploymentOverlayProps {
  state: SessionState;
}

function YieldBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="yield-row">
      <span>{label}</span>
      <div><i style={{ width: `${Math.min(100, value / 1.85 * 100)}%` }} /></div>
      <b>{value.toFixed(2)}×</b>
    </div>
  );
}

export function DeploymentOverlay({ state }: DeploymentOverlayProps) {
  const snapshot = state.snapshot;
  if (!snapshot) return null;
  const selected = snapshot.regions.find((region) => region.id === state.selectedStartRegionId);
  const hovered = snapshot.regions.find((region) => region.id === state.hoveredRegionId);
  const focus = hovered ?? selected;

  return (
    <div className="deployment-overlay">
      <header className="game-brand game-brand-deploy"><span>CW//01</span><b>CLONE WAR</b></header>
      <section className="deploy-brief">
        <p className="eyebrow">PROTOCOLE 00 — IMPLANTATION</p>
        <h2>CHOISISSEZ<br />VOTRE TISSU.</h2>
        <p>
          Les anneaux signalent les zones compatibles. Chaque implantation façonne votre première chaîne de production.
        </p>
        <div className="deploy-step"><span>01</span><p>Inspecter les rendements</p></div>
        <div className="deploy-step"><span>02</span><p>Cliquer une région viable</p></div>
        <div className="deploy-step"><span>03</span><p>Déployer l'équipe</p></div>
      </section>

      <section className={`region-dossier ${focus ? "is-visible" : ""}`}>
        {focus ? (
          <>
            <div className="dossier-code">{BIOMES[focus.biome].code} // {String(focus.id + 1).padStart(2, "0")}</div>
            <p className="micro-label">RÉGION CANDIDATE</p>
            <h3>{focus.name}</h3>
            <p className="region-biome">{BIOMES[focus.biome].name}</p>
            <p className="region-description">{BIOMES[focus.biome].description}</p>
            <div className="yield-chart">
              <YieldBar label="BIOMASSE" value={focus.yields.biomass} />
              <YieldBar label="MINERAI" value={focus.yields.ore} />
              <YieldBar label="EAU" value={focus.yields.water} />
              <YieldBar label="ÉNERGIE" value={focus.yields.energy} />
            </div>
            {!focus.startCandidate ? <div className="invalid-region">TISSU TROP INSTABLE POUR UN NOYAU</div> : null}
          </>
        ) : (
          <div className="dossier-empty">SURVOLEZ UNE RÉGION<br />POUR ANALYSE</div>
        )}
      </section>

      <div className="deploy-action">
        <div>
          <span className="micro-label">IMPLANTATION RETENUE</span>
          <strong>{selected?.name ?? "AUCUNE"}</strong>
        </div>
        <button type="button" disabled={!selected} onClick={() => gameSession.deploy()}>
          DÉPLOYER L'ÉQUIPE <span>↗</span>
        </button>
      </div>
    </div>
  );
}
