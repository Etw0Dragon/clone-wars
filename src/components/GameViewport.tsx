import { useEffect, useRef } from "react";
import { GameScene } from "../engine/GameScene";

export default function GameViewport() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const gameScene = new GameScene(container);
    return () => gameScene.dispose();
  }, []);

  return <div className="game-viewport" ref={containerRef} aria-label="Carte tactique 3D" />;
}
