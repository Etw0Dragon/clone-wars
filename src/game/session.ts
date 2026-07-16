import type {
  BuildingType,
  BoatType,
  GameSnapshot,
  MatchConfig,
  MutationId,
  PlayerCommand,
  UnitOrder,
  UnitType,
  Vec2,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./types";
import { audioBus } from "../audio/AudioBus";
import { recordMatch } from "./persistence";

export type SessionScreen = "landing" | "game";

export interface SessionState {
  screen: SessionScreen;
  snapshot: GameSnapshot | null;
  selectedUnitIds: number[];
  selectedBuildingId: number | null;
  selectedBoatId: number | null;
  selectedBuildType: BuildingType | null;
  selectedRegionId: number | null;
  selectedStartRegionId: number | null;
  hoveredRegionId: number | null;
  selectionBox: { left: number; top: number; width: number; height: number } | null;
  combatFocus: Vec2 | null;
  error: string | null;
}

type Listener = () => void;
type SnapshotListener = (snapshot: GameSnapshot) => void;

const INITIAL_STATE: SessionState = {
  screen: "landing",
  snapshot: null,
  selectedUnitIds: [],
  selectedBuildingId: null,
  selectedBoatId: null,
  selectedBuildType: null,
  selectedRegionId: null,
  selectedStartRegionId: null,
  hoveredRegionId: null,
  selectionBox: null,
  combatFocus: null,
  error: null,
};

class GameSession {
  private state: SessionState = INITIAL_STATE;
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private snapshotListeners = new Set<SnapshotListener>();
  private latestSnapshot: GameSnapshot | null = null;
  private lastUiEmit = 0;
  private recordedResult = false;
  private lastNotificationId = 0;

  getState = (): SessionState => this.state;
  getServerState = (): SessionState => INITIAL_STATE;
  getLatestSnapshot = (): GameSnapshot | null => this.latestSnapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeSnapshots = (listener: SnapshotListener): (() => void) => {
    this.snapshotListeners.add(listener);
    if (this.latestSnapshot) listener(this.latestSnapshot);
    return () => this.snapshotListeners.delete(listener);
  };

  start(seed: number, config: MatchConfig = { mapPreset: "standard", aiCount: 1 }): void {
    this.worker?.terminate();
    this.latestSnapshot = null;
    this.recordedResult = false;
    this.lastNotificationId = 0;
    this.state = {
      ...INITIAL_STATE,
      screen: "game",
    };
    this.emit();
    this.worker = new Worker(new URL("./game.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", this.handleWorkerMessage);
    this.worker.addEventListener("error", (event) => {
      this.patch({ error: event.message || "La simulation n'a pas pu démarrer." });
    });
    this.send({ type: "init", seed, config });
    audioBus.play("start");
  }

  returnToMenu(): void {
    this.worker?.terminate();
    this.worker = null;
    this.latestSnapshot = null;
    this.state = INITIAL_STATE;
    this.emit();
  }

  deploy(): void {
    if (this.state.selectedStartRegionId === null) return;
    this.command({ type: "deploy", regionId: this.state.selectedStartRegionId });
    audioBus.play("deploy");
  }

  selectStartRegion(regionId: number): void {
    this.patch({ selectedStartRegionId: regionId });
  }

  setHoveredRegion(regionId: number | null): void {
    if (this.state.hoveredRegionId === regionId) return;
    this.patch({ hoveredRegionId: regionId });
  }

  selectUnits(unitIds: number[], additive = false): void {
    const available = new Set(
      this.latestSnapshot?.units.filter((unit) => unit.faction === "player").map((unit) => unit.id) ?? [],
    );
    const next = additive
      ? [...new Set([...this.state.selectedUnitIds, ...unitIds.filter((id) => available.has(id))])]
      : unitIds.filter((id) => available.has(id));
    this.patch({ selectedUnitIds: next, selectedBuildingId: null, selectedRegionId: null, selectedBuildType: null });
  }

  selectSquadFromUnit(unitId: number, additive = false): void {
    const unit = this.latestSnapshot?.units.find((candidate) => candidate.id === unitId && candidate.faction === "player");
    if (!unit) return;
    const squadIds = this.latestSnapshot?.units
      .filter((candidate) => candidate.faction === "player" && candidate.type === unit.type && candidate.squadId === unit.squadId)
      .map((candidate) => candidate.id) ?? [];
    this.selectUnits(squadIds, additive);
  }

  focusCombat(position: Vec2): void {
    if (this.state.combatFocus) return;
    this.patch({ combatFocus: { ...position } });
  }

  cancelCombatFocus(): void {
    if (!this.state.combatFocus) return;
    this.patch({ combatFocus: null });
  }

  toggleBoatPassengerCandidate(unitId: number): void {
    const selected = this.state.selectedUnitIds;
    this.selectUnits(
      selected.includes(unitId) ? selected.filter((id) => id !== unitId) : [...selected, unitId],
    );
  }

  selectBuilding(buildingId: number | null): void {
    this.patch({ selectedBuildingId: buildingId, selectedBoatId: null, selectedUnitIds: [], selectedRegionId: null, selectedBuildType: null });
  }

  selectBoat(boatId: number | null): void {
    this.patch({ selectedBoatId: boatId, selectedBuildingId: null, selectedRegionId: null, selectedBuildType: null });
  }

  setBuildType(type: BuildingType | null): void {
    this.patch({ selectedBuildType: type, selectedBuildingId: null, selectedBoatId: null, selectedRegionId: null, selectedUnitIds: [] });
  }

  selectRegion(regionId: number | null): void {
    this.patch({ selectedRegionId: regionId, selectedBuildingId: null, selectedBoatId: null, selectedUnitIds: [], selectedBuildType: null });
  }

  assignWorker(regionId: number, amount: 1 | -1): void {
    this.command({ type: "assignWorker", regionId, amount });
    audioBus.play("place");
  }

  setSelectionBox(box: SessionState["selectionBox"]): void {
    this.patch({ selectionBox: box });
  }

  placeBuilding(position: Vec2): void {
    const type = this.state.selectedBuildType;
    if (!type) return;
    this.command({ type: "placeBuilding", buildingType: type, position });
    audioBus.play("place");
  }

  issueOrder(order: UnitOrder): void {
    if (this.state.selectedUnitIds.length === 0) return;
    this.command({ type: "setOrder", unitIds: this.state.selectedUnitIds, order });
  }

  queueClone(unitType: UnitType, buildingId?: number): void {
    const snapshot = this.latestSnapshot;
    if (!snapshot) return;
    const vatId = buildingId ?? this.state.selectedBuildingId ??
      snapshot.buildings.find((building) => building.faction === "player" && building.type === "vat")?.id;
    if (vatId === undefined || vatId === null) return;
    this.command({ type: "queueClone", buildingId: vatId, unitType });
    audioBus.play("queue");
  }

  upgradeBuilding(buildingId?: number): void {
    const id = buildingId ?? this.state.selectedBuildingId;
    if (id === null || id === undefined) return;
    this.command({ type: "upgradeBuilding", buildingId: id });
    audioBus.play("place");
  }

  queueBoat(boatType: BoatType, buildingId?: number): void {
    const snapshot = this.latestSnapshot;
    if (!snapshot) return;
    const portId = buildingId ?? this.state.selectedBuildingId ??
      snapshot.buildings.find((building) => building.faction === "player" && building.type === "port")?.id;
    if (portId === undefined || portId === null) return;
    this.command({ type: "queueBoat", buildingId: portId, boatType });
    audioBus.play("queue");
  }

  boardSelectedBoat(): void {
    if (this.state.selectedBoatId === null || this.state.selectedUnitIds.length === 0) return;
    this.command({ type: "boardBoat", boatId: this.state.selectedBoatId, unitIds: this.state.selectedUnitIds });
  }

  boardBoatMaximum(): void {
    const snapshot = this.latestSnapshot;
    const boatId = this.state.selectedBoatId;
    if (!snapshot || boatId === null) return;
    const boat = snapshot.boats.find((candidate) => candidate.id === boatId && candidate.faction === "player");
    if (!boat || boat.state !== "moored") return;
    const capacity = boat.capacity - boat.passengerIds.length;
    if (capacity <= 0) return;
    const candidates = snapshot.units
      .filter((unit) => unit.faction === "player" && Math.hypot(unit.position.x - boat.position.x, unit.position.z - boat.position.z) <= 13)
      .slice(0, capacity)
      .map((unit) => unit.id);
    if (candidates.length === 0) return;
    this.command({ type: "boardBoat", boatId, unitIds: candidates });
    this.patch({ selectedUnitIds: candidates });
  }

  issueBoatOrder(target: Vec2): void {
    if (this.state.selectedBoatId === null) return;
    this.command({ type: "setBoatOrder", boatId: this.state.selectedBoatId, target });
  }

  chooseMutation(mutationId: MutationId): void {
    this.command({ type: "chooseMutation", mutationId });
    audioBus.play("mutation");
  }

  repairSelected(): void {
    if (this.state.selectedBuildingId === null) return;
    this.command({ type: "repair", buildingId: this.state.selectedBuildingId });
  }

  sellSelected(): void {
    if (this.state.selectedBuildingId === null) return;
    this.command({ type: "sell", buildingId: this.state.selectedBuildingId });
    this.patch({ selectedBuildingId: null });
  }

  togglePause(): void {
    const paused = !(this.latestSnapshot?.paused ?? false);
    this.send({ type: "pause", paused });
  }

  cancelMode(): void {
    this.patch({ selectedBuildType: null, selectedBoatId: null, selectionBox: null, combatFocus: null });
  }

  private command(command: PlayerCommand): void {
    this.send({ type: "command", command });
  }

  private send(message: WorkerInboundMessage): void {
    this.worker?.postMessage(message);
  }

  private handleWorkerMessage = (event: MessageEvent<WorkerOutboundMessage>): void => {
    const message = event.data;
    if (message.type === "error") {
      this.patch({ error: message.message });
      return;
    }
    const previousPhase = this.latestSnapshot?.phase;
    this.latestSnapshot = message.snapshot;
    if (!this.recordedResult && (message.snapshot.phase === "victory" || message.snapshot.phase === "defeat")) {
      recordMatch(message.snapshot);
      this.recordedResult = true;
    }
    if (previousPhase !== message.snapshot.phase) {
      if (message.snapshot.phase === "mutation") audioBus.play("mutation");
      if (message.snapshot.phase === "victory") audioBus.play("victory");
      if (message.snapshot.phase === "defeat") audioBus.play("defeat");
    }
    const newestNotification = message.snapshot.notifications.at(-1);
    if (newestNotification && newestNotification.id > this.lastNotificationId) {
      this.lastNotificationId = newestNotification.id;
      if (newestNotification.tone === "success") audioBus.play("success");
      if (newestNotification.tone === "warning") audioBus.play("warning");
    }
    for (const listener of this.snapshotListeners) listener(message.snapshot);
    const validUnitIds = new Set(message.snapshot.units.filter((unit) => unit.faction === "player").map((unit) => unit.id));
    const selectedUnitIds = this.state.selectedUnitIds.filter((id) => validUnitIds.has(id));
    const selectedBuildingId = this.state.selectedBuildingId !== null &&
      message.snapshot.buildings.some((building) => building.id === this.state.selectedBuildingId)
      ? this.state.selectedBuildingId
      : null;
    const selectedBoatId = this.state.selectedBoatId !== null &&
      message.snapshot.boats.some((boat) => boat.id === this.state.selectedBoatId && boat.faction === "player")
      ? this.state.selectedBoatId
      : null;
    const selectedRegionId = this.state.selectedRegionId !== null &&
      message.snapshot.regions.some((region) => region.id === this.state.selectedRegionId)
      ? this.state.selectedRegionId
      : null;
    const now = performance.now();
    const phaseChanged = previousPhase !== message.snapshot.phase;
    if (phaseChanged || now - this.lastUiEmit >= 140 || message.snapshot.paused !== this.state.snapshot?.paused) {
      this.lastUiEmit = now;
      this.state = { ...this.state, snapshot: message.snapshot, selectedUnitIds, selectedBuildingId, selectedBoatId, selectedRegionId };
      this.emit();
    }
  };

  private patch(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const gameSession = new GameSession();
