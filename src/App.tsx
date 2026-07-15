import { lazy, Suspense, useSyncExternalStore } from "react";
import { DeploymentOverlay } from "./components/DeploymentOverlay";
import { EndScreen } from "./components/EndScreen";
import { Hud } from "./components/Hud";
import { Landing } from "./components/Landing";
import { MutationModal } from "./components/MutationModal";
import { gameSession } from "./game/session";

const GameViewport = lazy(() => import("./components/GameViewport"));

function LoadingGame() {
  return (
    <div className="game-loading">
      <div className="loading-mark"><i /><i /><i /></div>
      <span>SYNTHÈSE DU TISSU EN COURS</span>
    </div>
  );
}

export default function App() {
  const state = useSyncExternalStore(gameSession.subscribe, gameSession.getState, gameSession.getServerState);
  if (state.screen === "landing") return <Landing />;

  return (
    <main className="game-shell">
      <Suspense fallback={<LoadingGame />}><GameViewport /></Suspense>
      {!state.snapshot ? <LoadingGame /> : null}
      {state.snapshot?.phase === "deployment" ? <DeploymentOverlay state={state} /> : null}
      {state.snapshot && state.snapshot.phase !== "deployment" ? <Hud state={state} snapshot={state.snapshot} /> : null}
      {state.snapshot ? <MutationModal snapshot={state.snapshot} /> : null}
      {state.snapshot ? <EndScreen snapshot={state.snapshot} /> : null}
      {state.selectionBox ? <div className="selection-box" style={state.selectionBox} /> : null}
      {state.error ? <div className="fatal-error"><strong>ERREUR DE SIMULATION</strong><span>{state.error}</span><button onClick={() => gameSession.returnToMenu()}>RETOUR</button></div> : null}
      <div className="screen-grain" />
      <div className="mobile-warning"><strong>ÉCRAN TACTIQUE REQUIS</strong><span>Clone War est conçu pour ordinateur avec souris et clavier.</span></div>
    </main>
  );
}
