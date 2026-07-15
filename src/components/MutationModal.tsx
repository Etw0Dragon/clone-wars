import { gameSession } from "../game/session";
import type { GameSnapshot } from "../game/types";

export function MutationModal({ snapshot }: { snapshot: GameSnapshot }) {
  if (snapshot.phase !== "mutation") return null;
  return (
    <div className="modal-scrim mutation-scrim">
      <section className="mutation-modal" role="dialog" aria-modal="true" aria-labelledby="mutation-title">
        <div className="mutation-header">
          <span className="mutation-index">ADN/{snapshot.mutations.player.length + 1}</span>
          <div>
            <p className="eyebrow">PALIER D’ADAPTATION ATTEINT</p>
            <h2 id="mutation-title">CHOISISSEZ CE QUE<br />VOUS SACRIFIEZ.</h2>
          </div>
          <div className="helix" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </div>
        <div className="mutation-grid">
          {snapshot.mutationChoices.map((choice, index) => (
            <button type="button" key={choice.id} onClick={() => gameSession.chooseMutation(choice.id)}>
              <span className="mutation-letter">{String.fromCharCode(65 + index)}</span>
              <span className="micro-label">MUTATION DISPONIBLE</span>
              <strong>{choice.name}</strong>
              <span className="mutation-benefit">+ {choice.description}</span>
              <span className="mutation-drawback">− {choice.drawback}</span>
              <span className="mutation-select">STABILISER <b>↗</b></span>
            </button>
          ))}
        </div>
        <p className="mutation-warning">CHOIX IRRÉVERSIBLE POUR CETTE EXPÉRIENCE — SIMULATION SUSPENDUE</p>
      </section>
    </div>
  );
}
