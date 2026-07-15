import { gameSession } from "../game/session";
import type { GameSnapshot } from "../game/types";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export function EndScreen({ snapshot }: { snapshot: GameSnapshot }) {
  if (snapshot.phase !== "victory" && snapshot.phase !== "defeat") return null;
  const victory = snapshot.phase === "victory";
  return (
    <div className={`modal-scrim end-scrim ${victory ? "victory" : "defeat"}`}>
      <section className="end-screen" role="dialog" aria-modal="true">
        <div className="end-code">EXP/{snapshot.seed.toString(16).toUpperCase().padStart(8, "0")}</div>
        <p className="eyebrow">RAPPORT DE TERMINAISON</p>
        <h2>{victory ? "LE RÉSEAU EST À VOUS." : "VOTRE LIGNÉE S’ARRÊTE ICI."}</h2>
        <p className="end-subtitle">{victory ? "Noyau rival dissous. Assimilation complète." : "Noyau rompu. Données de l’échec archivées."}</p>
        <div className="end-stats">
          <div><span>DURÉE</span><strong>{formatTime(snapshot.elapsedSeconds)}</strong></div>
          <div><span>CLONES PRODUITS</span><strong>{snapshot.stats.clonesProduced}</strong></div>
          <div><span>PERTES</span><strong>{snapshot.stats.clonesLost}</strong></div>
          <div><span>CIBLES DÉTRUITES</span><strong>{snapshot.stats.enemiesDestroyed}</strong></div>
          <div><span>SECTEURS MAX.</span><strong>{snapshot.stats.territoryPeak}</strong></div>
          <div><span>MATIÈRE LIVRÉE</span><strong>{snapshot.stats.cargoDelivered}</strong></div>
        </div>
        <div className="end-mutations">
          <span className="micro-label">LIGNÉE FINALE</span>
          {snapshot.mutations.player.length > 0
            ? snapshot.mutations.player.map((mutation) => <b key={mutation}>{mutation.replace(/([A-Z])/g, " $1").toUpperCase()}</b>)
            : <b>AUCUNE MUTATION</b>}
        </div>
        <div className="end-actions">
          <button type="button" className="secondary-button" onClick={() => gameSession.returnToMenu()}>RETOUR AU LABORATOIRE</button>
          <button type="button" className="launch-button" onClick={() => gameSession.start((snapshot.seed + 0x9e3779b9) >>> 0)}>NOUVELLE SEED <b>↗</b></button>
        </div>
      </section>
    </div>
  );
}
