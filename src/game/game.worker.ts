/// <reference lib="webworker" />

import { TICK_RATE } from "./config";
import { GameSimulation } from "./simulation";
import type { WorkerInboundMessage, WorkerOutboundMessage } from "./types";

let simulation: GameSimulation | null = null;
let lastSentTick = -1;

function postSnapshot(force = false): void {
  if (!simulation) return;
  if (!force && simulation.tickCount === lastSentTick) return;
  lastSentTick = simulation.tickCount;
  const message: WorkerOutboundMessage = { type: "snapshot", snapshot: simulation.getSnapshot() };
  self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<WorkerInboundMessage>) => {
  try {
    const message = event.data;
    if (message.type === "init" || message.type === "restart") {
      simulation = new GameSimulation(message.seed, message.type === "init" ? message.config : undefined);
      lastSentTick = -1;
      postSnapshot(true);
      return;
    }
    if (!simulation) return;
    if (message.type === "command") simulation.applyPlayerCommand(message.command);
    if (message.type === "pause") simulation.setPaused(message.paused);
    postSnapshot(true);
  } catch (error) {
    const message: WorkerOutboundMessage = {
      type: "error",
      message: error instanceof Error ? error.message : "Erreur inconnue dans la simulation",
    };
    self.postMessage(message);
  }
});

setInterval(() => {
  if (!simulation) return;
  simulation.tick();
  if (simulation.tickCount % 2 === 0 || simulation.phase !== "playing") postSnapshot();
}, 1000 / TICK_RATE);

export {};
