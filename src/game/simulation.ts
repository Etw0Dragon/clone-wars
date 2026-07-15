import {
  BUILD_GRID,
  BUILDINGS,
  BOATS,
  CORE_SHIELD_SECONDS,
  MAX_UNITS_PER_FACTION,
  MUTATIONS,
  MUTATION_THRESHOLDS,
  PLAYER_STARTING_RESOURCES,
  TICK_RATE,
  TICK_SECONDS,
  UNITS,
} from "./config";
import { chooseEnemyStart, createMap, findRegionAt, pointInPolygon } from "./map";
import { findPath } from "./pathfinding";
import { SeededRandom } from "./random";
import type {
  Building,
  BuildingType,
  Boat,
  BoatType,
  CargoPacket,
  FactionId,
  GamePhase,
  GameSnapshot,
  MatchStats,
  MatchConfig,
  MapPreset,
  MutationId,
  Notification,
  PlayerCommand,
  Projectile,
  Region,
  ResourceStock,
  ResourceType,
  Unit,
  UnitOrder,
  UnitType,
  Vec2,
  TradeShip,
} from "./types";

interface SquadPath {
  points: Vec2[];
  index: number;
  unitIds: Set<number>;
}

interface AiMemory {
  nextThink: number;
  knownPlayerCore: Vec2 | null;
  scoutRegionCursor: number;
}

const EMPTY_STATS: MatchStats = {
  clonesProduced: 0,
  clonesLost: 0,
  enemiesDestroyed: 0,
  buildingsBuilt: 0,
  territoryPeak: 1,
  cargoDelivered: 0,
  portTradesCompleted: 0,
};

const FACTIONS: FactionId[] = ["player", "enemy"];

function opposingFaction(faction: FactionId): FactionId {
  return faction === "player" ? "enemy" : "player";
}

function distance(first: Vec2, second: Vec2): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function snap(value: number): number {
  return Math.round(value / BUILD_GRID) * BUILD_GRID;
}

function cloneOrder(order: UnitOrder): UnitOrder {
  if (order.type === "idle") return { type: "idle" };
  if (order.type === "attack") return { ...order };
  if (order.type === "patrol") {
    return { type: "patrol", target: { ...order.target }, origin: { ...order.origin } };
  }
  return { type: order.type, target: { ...order.target } };
}

export class GameSimulation {
  readonly seed: number;
  readonly random: SeededRandom;
  readonly mapPreset: MapPreset;
  readonly aiCount: number;
  regions: Region[];
  buildings: Building[] = [];
  units: Unit[] = [];
  boats: Boat[] = [];
  tradeShips: TradeShip[] = [];
  cargo: CargoPacket[] = [];
  projectiles: Projectile[] = [];
  resources: Record<FactionId, ResourceStock> = {
    player: { ...PLAYER_STARTING_RESOURCES, energyProduced: 0, energyUsed: 0, research: 0 },
    enemy: { biomass: 90, ore: 95, water: 0, energyProduced: 0, energyUsed: 0, research: 0 },
  };
  mutations: Record<FactionId, MutationId[]> = { player: [], enemy: [] };
  mutationChoices: MutationId[] = [];
  stats: MatchStats = { ...EMPTY_STATS };
  notifications: Notification[] = [];
  phase: GamePhase = "deployment";
  paused = false;
  tickCount = 0;
  winner: FactionId | null = null;

  private nextEntityId = 1;
  private nextNotificationId = 1;
  private extractorTimers = new Map<number, number>();
  private portTradeTimers = new Map<number, number>();
  private squadPaths = new Map<string, SquadPath>();
  private mutationLevel: Record<FactionId, number> = { player: 0, enemy: 0 };
  private discoveredBy: Record<FactionId, Set<number>> = {
    player: new Set<number>(),
    enemy: new Set<number>(),
  };
  private ai: AiMemory = { nextThink: 0, knownPlayerCore: null, scoutRegionCursor: 0 };

  constructor(seed: number, config: MatchConfig = { mapPreset: "standard", aiCount: 1 }) {
    this.seed = seed >>> 0;
    this.random = new SeededRandom(this.seed);
    this.mapPreset = config.mapPreset;
    this.aiCount = Math.max(1, Math.min(3, Math.round(config.aiCount)));
    this.regions = createMap(this.seed, this.mapPreset);
    this.notify("info", `CARTE ${this.seed.toString(16).toUpperCase().padStart(8, "0")} SYNTHÉTISÉE`);
  }

  get elapsedSeconds(): number {
    return this.tickCount / TICK_RATE;
  }

  setPaused(paused: boolean): void {
    if (this.phase !== "playing") return;
    this.paused = paused;
  }

  applyPlayerCommand(command: PlayerCommand): boolean {
    return this.applyCommand("player", command);
  }

  applyCommand(faction: FactionId, command: PlayerCommand): boolean {
    if (command.type === "deploy") {
      if (faction !== "player" || this.phase !== "deployment") return false;
      return this.deploy(command.regionId);
    }
    if (this.phase !== "playing" && !(this.phase === "mutation" && command.type === "chooseMutation")) {
      return false;
    }

    switch (command.type) {
      case "placeBuilding":
        return this.placeBuilding(faction, command.buildingType, command.position);
      case "queueClone":
        return this.queueClone(faction, command.buildingId, command.unitType);
      case "queueBoat":
        return this.queueBoat(faction, command.buildingId, command.boatType);
      case "boardBoat":
        return this.boardBoat(faction, command.boatId, command.unitIds);
      case "setBoatOrder":
        return this.setBoatOrder(faction, command.boatId, command.target);
      case "setOrder":
        return this.setUnitOrder(faction, command.unitIds, command.order);
      case "chooseMutation":
        return this.chooseMutation(faction, command.mutationId);
      case "repair":
        return this.repairBuilding(faction, command.buildingId);
      case "sell":
        return this.sellBuilding(faction, command.buildingId);
      default:
        return false;
    }
  }

  tick(): void {
    if (this.phase !== "playing" || this.paused) return;
    this.tickCount += 1;
    this.updateConstruction();
    this.updatePower();
    this.updateEconomy();
    this.updateCargo();
    this.updateProduction();
    this.updateBoatProduction();
    this.updateBoats();
    this.updatePortTrade();
    this.updateSquadPaths();
    this.updateUnits();
    this.updateTurrets();
    this.updateProjectiles();
    this.removeDestroyedEntities();
    this.updateCapture();
    this.updateVision();
    this.updateResearch();
    if (this.tickCount % (TICK_RATE * 2) === 0) this.runAi();
    this.checkMutations();
    this.checkVictory();
    this.notifications = this.notifications.filter((entry) => this.tickCount - entry.tick < TICK_RATE * 16);
  }

  private deploy(playerRegionId: number): boolean {
    const playerRegion = this.regions.find((region) => region.id === playerRegionId);
    if (!playerRegion?.startCandidate) return false;
    this.spawnPlayerDeployment(playerRegion);
    const enemyRegions = this.chooseEnemyRegions(playerRegionId);
    if (enemyRegions.length === 0) return false;
    for (const enemyRegion of enemyRegions) this.spawnBase("enemy", enemyRegion);
    this.phase = "playing";
    this.updatePower();
    this.updateVision();
    this.notify("success", `ÉQUIPE DÉPLOYÉE — ${playerRegion.name.toUpperCase()}`);
    this.notify("info", "PLACEZ LE NOYAU POUR AMORCER LA COLONIE");
    this.notify("warning", `${enemyRegions.length} COLONIE${enemyRegions.length > 1 ? "S" : ""} RIVALE${enemyRegions.length > 1 ? "S" : ""} DÉTECTÉE${enemyRegions.length > 1 ? "S" : ""}`);
    return true;
  }

  private chooseEnemyRegions(playerRegionId: number): Region[] {
    const firstId = chooseEnemyStart(this.regions, playerRegionId);
    const first = this.regions.find((region) => region.id === firstId);
    if (!first) return [];
    const selected = [first];
    const player = this.regions.find((region) => region.id === playerRegionId)!;
    const candidates = this.regions.filter((region) => region.startCandidate && region.biome !== "water" && region.id !== playerRegionId && region.id !== first.id);
    while (selected.length < this.aiCount && candidates.length > 0) {
      candidates.sort((a, b) => {
        const score = (region: Region) => Math.min(...selected.map((chosen) => distance(region.center, chosen.center))) + distance(region.center, player.center) * 0.35;
        return score(b) - score(a);
      });
      selected.push(candidates.shift()!);
    }
    return selected;
  }

  private spawnBase(faction: FactionId, region: Region): void {
    region.owner = faction;
    region.captureFaction = faction;
    region.captureProgress = 100;
    this.discoveredBy[faction].add(region.id);
    const center = this.findFreePoint(region, region.center, 5);
    const offsets: Array<[BuildingType, number, number]> = [
      ["core", 0, 0],
      ["generator", -6, -4],
      ["storage", 6, -4],
      ["vat", 0, 7],
    ];
    for (const [type, offsetX, offsetZ] of offsets) {
      const position = this.findFreePoint(region, { x: center.x + offsetX, z: center.z + offsetZ }, BUILDINGS[type].size);
      this.addBuilding(faction, type, position, region.id, true);
    }
    for (let index = 0; index < 4; index += 1) {
      this.spawnUnit(faction, "worker", {
        x: center.x + (index - 1.5) * 1.2,
        z: center.z + 4,
      });
    }
  }

  private spawnPlayerDeployment(region: Region): void {
    region.owner = "player";
    region.captureFaction = "player";
    region.captureProgress = 100;
    this.discoveredBy.player.add(region.id);
    const center = this.findFreePoint(region, region.center, 5);
    for (let index = 0; index < 4; index += 1) {
      this.spawnUnit("player", "worker", {
        x: center.x + (index - 1.5) * 1.2,
        z: center.z + 4,
      });
    }
  }

  private findFreePoint(region: Region, desired: Vec2, size: number): Vec2 {
    const candidates: Vec2[] = [{ x: snap(desired.x), z: snap(desired.z) }];
    for (let radius = 1; radius <= 8; radius += 1) {
      for (let step = 0; step < radius * 8; step += 1) {
        const angle = (step / (radius * 8)) * Math.PI * 2;
        candidates.push({
          x: snap(region.center.x + Math.cos(angle) * radius * BUILD_GRID),
          z: snap(region.center.z + Math.sin(angle) * radius * BUILD_GRID),
        });
      }
    }
    return candidates.find((candidate) =>
      pointInPolygon(candidate, region.vertices) &&
      this.buildings.every((building) => distance(candidate, building.position) >= (size + BUILDINGS[building.type].size) * 0.58),
    ) ?? { x: snap(region.center.x), z: snap(region.center.z) };
  }

  private addBuilding(
    faction: FactionId,
    type: BuildingType,
    position: Vec2,
    regionId: number,
    complete = false,
  ): Building {
    const definition = BUILDINGS[type];
    const snappedPosition = { x: snap(position.x), z: snap(position.z) };
    const building: Building = {
      id: this.nextEntityId++,
      faction,
      type,
      position: snappedPosition,
      regionId,
      hp: complete ? definition.hp : Math.max(1, definition.hp * 0.12),
      maxHp: definition.hp,
      construction: complete ? 1 : 0.03,
      active: complete,
      powered: complete,
      orientation: this.automaticOrientation(faction, type, snappedPosition, regionId),
      queue: [],
      boatQueue: [],
      productionProgress: 0,
      boatProductionProgress: 0,
      cooldown: 0,
    };
    this.buildings.push(building);
    return building;
  }

  private automaticOrientation(faction: FactionId, type: BuildingType, position: Vec2, regionId: number): number {
    const face = (target: Vec2): number => Math.atan2(position.x - target.x, position.z - target.z);
    const region = this.regions.find((candidate) => candidate.id === regionId);
    const adjacentWater = region?.neighbors
      .map((id) => this.regions.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Region => candidate?.biome === "water")
      .sort((first, second) => distance(position, first.center) - distance(position, second.center))[0];

    // Docks and intake pipes always point towards the nearest available channel.
    if ((type === "port" || type === "waterExtractor") && adjacentWater) return face(adjacentWater.center);

    const hostileCore = this.buildings
      .filter((building) => building.faction === opposingFaction(faction) && building.type === "core" && building.hp > 0)
      .sort((first, second) => distance(position, first.position) - distance(position, second.position))[0];
    if ((type === "turret" || type === "wall") && hostileCore) return face(hostileCore.position);

    const priority = type === "conveyor"
      ? ["storage", "conveyor", "core"] as BuildingType[]
      : ["core", "storage", "vat"] as BuildingType[];
    const anchor = this.buildings
      .filter((building) => building.faction === faction && priority.includes(building.type) && building.hp > 0)
      .sort((first, second) => {
        const typeDifference = priority.indexOf(first.type) - priority.indexOf(second.type);
        return typeDifference !== 0 ? typeDifference : distance(position, first.position) - distance(position, second.position);
      })[0];
    if (anchor) return face(anchor.position);

    // A deterministic fallback keeps startup bases coherent without introducing a random facing.
    return region ? face(region.center) : 0;
  }

  private canAfford(faction: FactionId, cost: Partial<Record<ResourceType, number>>): boolean {
    const stock = this.resources[faction];
    return (cost.biomass ?? 0) <= stock.biomass && (cost.ore ?? 0) <= stock.ore;
  }

  private spend(faction: FactionId, cost: Partial<Record<ResourceType, number>>): void {
    const stock = this.resources[faction];
    stock.biomass -= cost.biomass ?? 0;
    stock.ore -= cost.ore ?? 0;
    stock.water -= cost.water ?? 0;
  }

  private placeBuilding(faction: FactionId, type: BuildingType, rawPosition: Vec2): boolean {
    const definition = BUILDINGS[type];
    if (!definition.buildable) return false;
    if (type === "core" && this.buildings.some((building) => building.faction === faction && building.type === "core" && building.hp > 0)) {
      if (faction === "player") this.notify("warning", "NOYAU DÉJÀ ÉTABLI");
      return false;
    }
    if (!this.canAfford(faction, definition.cost)) {
      if (faction === "player") this.notify("warning", "MATIÈRE INSUFFISANTE");
      return false;
    }
    const position = { x: snap(rawPosition.x), z: snap(rawPosition.z) };
    const region = findRegionAt(this.regions, position);
    if (!region || region.biome === "water" || region.owner !== faction) {
      if (faction === "player") this.notify("warning", "CONSTRUCTION HORS TERRITOIRE");
      return false;
    }
    const collision = this.buildings.some((building) => {
      const minimum = (definition.size + BUILDINGS[building.type].size) * (type === "conveyor" || building.type === "conveyor" ? 0.39 : 0.57);
      return distance(position, building.position) < minimum;
    });
    if (collision) {
      if (faction === "player") this.notify("warning", "EMPLACEMENT OBSTRUÉ");
      return false;
    }
    const builderRange = type === "conveyor" || type === "wall" ? 24 : 18;
    const hasBuilder = this.units.some((unit) =>
      unit.faction === faction && unit.type === "worker" && unit.hp > 0 && distance(unit.position, position) <= builderRange,
    );
    if (!hasBuilder) {
      if (faction === "player") this.notify("warning", "AUCUN OUVRIER À PORTÉE");
      return false;
    }
    if ((type === "waterExtractor" || type === "port") && !this.isWaterAdjacent(region)) {
      if (faction === "player") this.notify("warning", "CANAL HORS DE PORTÉE");
      return false;
    }

    this.spend(faction, definition.cost);
    this.addBuilding(faction, type, position, region.id);
    if (faction === "player") {
      this.stats.buildingsBuilt += 1;
      this.notify("info", `${definition.shortName} — CONSTRUCTION LANCÉE`);
    }
    return true;
  }

  private isWaterAdjacent(region: Region): boolean {
    return region.neighbors.some((id) => this.regions.find((candidate) => candidate.id === id)?.biome === "water");
  }

  private queueClone(faction: FactionId, buildingId: number, type: UnitType): boolean {
    const vat = this.buildings.find((building) => building.id === buildingId);
    if (!vat || vat.faction !== faction || vat.type !== "vat" || vat.construction < 1 || vat.queue.length >= 12) {
      if (faction === "player") this.notify("warning", "CUVE INDISPONIBLE OU FILE SATURÉE");
      return false;
    }
    if (this.units.filter((unit) => unit.faction === faction).length + vat.queue.length >= MAX_UNITS_PER_FACTION) {
      if (faction === "player") this.notify("warning", "LIMITE DE 200 CLONES ATTEINTE");
      return false;
    }
    const definition = UNITS[type];
    const biomassDiscount = this.mutations[faction].includes("leanMetabolism") ? 0.75 : 1;
    const cost = { biomass: Math.ceil(definition.biomassCost * biomassDiscount), ore: definition.oreCost };
    if (!this.canAfford(faction, cost)) {
      if (faction === "player") this.notify("warning", "MATIÈRE INSUFFISANTE POUR GESTATION");
      return false;
    }
    this.spend(faction, cost);
    vat.queue.push(type);
    return true;
  }

  private queueBoat(faction: FactionId, buildingId: number, type: BoatType): boolean {
    const port = this.buildings.find((building) => building.id === buildingId);
    if (!port || port.faction !== faction || port.type !== "port" || !port.active || port.boatQueue.length >= 3) {
      if (faction === "player") this.notify("warning", "PORT INDISPONIBLE OU FILE SATURÉE");
      return false;
    }
    const definition = BOATS[type];
    if (!this.canAfford(faction, definition.cost)) {
      if (faction === "player") this.notify("warning", "RESSOURCES INSUFFISANTES POUR LA COQUE");
      return false;
    }
    this.spend(faction, definition.cost);
    port.boatQueue.push(type);
    if (faction === "player") this.notify("info", `${definition.code} — BATEAU COMMANDÉ AU PORT`);
    return true;
  }

  private boardBoat(faction: FactionId, boatId: number, unitIds: number[]): boolean {
    const boat = this.boats.find((candidate) => candidate.id === boatId && candidate.faction === faction);
    if (!boat || boat.state !== "moored") return false;
    const candidates = this.units.filter((unit) => unit.faction === faction && unitIds.includes(unit.id) && unit.embarkedIn === null && unit.hp > 0 && distance(unit.position, boat.position) <= 13);
    const available = boat.capacity - boat.passengerIds.length;
    const passengers = candidates.slice(0, Math.max(0, available));
    if (passengers.length === 0) {
      if (faction === "player") this.notify("warning", "AUCUN CLONE À PORTÉE DE LA COQUE");
      return false;
    }
    for (const unit of passengers) {
      unit.embarkedIn = boat.id;
      unit.order = { type: "idle" };
      unit.velocity = { x: 0, z: 0 };
      unit.position = { ...boat.position };
      boat.passengerIds.push(unit.id);
    }
    if (faction === "player") this.notify("success", `${passengers.length} CLONE${passengers.length > 1 ? "S" : ""} EMBARQUÉ${passengers.length > 1 ? "S" : ""}`);
    return true;
  }

  private setBoatOrder(faction: FactionId, boatId: number, target: Vec2): boolean {
    const boat = this.boats.find((candidate) => candidate.id === boatId && candidate.faction === faction);
    const destination = findRegionAt(this.regions, target);
    if (!boat || boat.passengerIds.length === 0 || !destination || destination.biome === "water") return false;
    boat.target = { ...target };
    boat.state = "sailing";
    if (faction === "player") this.notify("info", "COQUE EN ROUTE — DÉBARQUEMENT PROGRAMMÉ");
    return true;
  }

  private setUnitOrder(faction: FactionId, unitIds: number[], order: UnitOrder): boolean {
    const idSet = new Set(unitIds);
    const commanded = this.units.filter((unit) => unit.faction === faction && idSet.has(unit.id) && unit.embarkedIn === null);
    if (commanded.length === 0) return false;
    const requestedTarget = order.type === "attack" ? this.getEntityPosition(order.targetId, order.targetKind) : order.type === "idle" ? null : order.target;
    if (requestedTarget) {
      const targetRegion = findRegionAt(this.regions, requestedTarget);
      const originRegion = findRegionAt(this.regions, commanded[0]!.position);
      if (!targetRegion || targetRegion.biome === "water" || !originRegion || !this.isLandReachable(originRegion.id, targetRegion.id)) {
        if (faction === "player") this.notify("warning", "VOIE MARITIME REQUISE — EMBARQUEZ UNE ESCOUADE");
        return false;
      }
    }
    const squads = new Map<number, Unit[]>();
    for (const unit of commanded) {
      unit.order = cloneOrder(order);
      const members = squads.get(unit.squadId) ?? [];
      members.push(unit);
      squads.set(unit.squadId, members);
    }
    if (order.type !== "idle") {
      const target = order.type === "attack"
        ? this.getEntityPosition(order.targetId, order.targetKind)
        : order.target;
      if (target) {
        for (const [squadId, members] of squads) {
          const origin = {
            x: members.reduce((sum, unit) => sum + unit.position.x, 0) / members.length,
            z: members.reduce((sum, unit) => sum + unit.position.z, 0) / members.length,
          };
          const ignoredId = order.type === "attack" && order.targetKind === "building" ? order.targetId : undefined;
          this.squadPaths.set(`${faction}:${squadId}`, {
            points: findPath(origin, target, this.buildings, ignoredId),
            index: 0,
            unitIds: new Set(members.map((unit) => unit.id)),
          });
        }
      }
    }
    return true;
  }

  private isLandReachable(fromId: number, targetId: number): boolean {
    if (fromId === targetId) return true;
    const visited = new Set<number>([fromId]);
    const queue = [fromId];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const region = this.regions.find((candidate) => candidate.id === queue[cursor]);
      if (!region) continue;
      for (const neighborId of region.neighbors) {
        if (visited.has(neighborId)) continue;
        const neighbor = this.regions.find((candidate) => candidate.id === neighborId);
        if (!neighbor || neighbor.biome === "water") continue;
        if (neighborId === targetId) return true;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
    return false;
  }

  private isAdjacentToPlayerTerritory(position: Vec2): boolean {
    const region = findRegionAt(this.regions, position);
    if (!region) return false;
    return region.owner === "player" || region.neighbors.some((id) => this.regions.find((candidate) => candidate.id === id)?.owner === "player");
  }

  private repairBuilding(faction: FactionId, buildingId: number): boolean {
    const building = this.buildings.find((candidate) => candidate.id === buildingId && candidate.faction === faction);
    if (!building || building.hp >= building.maxHp) return false;
    const missingRatio = 1 - building.hp / building.maxHp;
    const oreCost = Math.max(1, Math.ceil((BUILDINGS[building.type].cost.ore ?? 4) * missingRatio * 0.45));
    const hasWorker = this.units.some((unit) => unit.faction === faction && unit.type === "worker" && distance(unit.position, building.position) < 14);
    if (!hasWorker || this.resources[faction].ore < oreCost) return false;
    this.resources[faction].ore -= oreCost;
    building.hp = building.maxHp;
    if (faction === "player") this.notify("success", `${BUILDINGS[building.type].shortName} RÉPARÉ`);
    return true;
  }

  private sellBuilding(faction: FactionId, buildingId: number): boolean {
    const index = this.buildings.findIndex((candidate) => candidate.id === buildingId && candidate.faction === faction);
    if (index < 0) return false;
    const building = this.buildings[index]!;
    if (building.type === "core") return false;
    const definition = BUILDINGS[building.type];
    this.resources[faction].biomass += Math.floor((definition.cost.biomass ?? 0) * 0.4);
    this.resources[faction].ore += Math.floor((definition.cost.ore ?? 0) * 0.4);
    this.buildings.splice(index, 1);
    return true;
  }

  private updateConstruction(): void {
    for (const building of this.buildings) {
      if (building.construction >= 1 || building.hp <= 0) continue;
      let builders = 0;
      const constructionRange = building.type === "conveyor" || building.type === "wall" ? 24 : 18;
      for (const unit of this.units) {
        if (
          unit.faction === building.faction && unit.type === "worker" && unit.hp > 0 &&
          distance(unit.position, building.position) <= constructionRange
        ) builders += 1;
      }
      if (builders === 0) continue;
      const definition = BUILDINGS[building.type];
      const speed = 0.55 + Math.min(3, builders) * 0.45;
      const previous = building.construction;
      building.construction = Math.min(1, building.construction + (TICK_SECONDS / Math.max(0.25, definition.buildTime)) * speed);
      building.hp = Math.min(building.maxHp, Math.max(building.hp, building.maxHp * building.construction));
      if (previous < 1 && building.construction >= 1 && building.faction === "player") {
        this.notify("success", `${definition.shortName} OPÉRATIONNEL`);
      }
    }
  }

  private updatePower(): void {
    for (const faction of FACTIONS) {
      const factionBuildings = this.buildings.filter((building) => building.faction === faction && building.hp > 0 && building.construction >= 1);
      const nodes = factionBuildings.filter((building) => ["core", "generator", "relay"].includes(building.type));
      const connected = new Set<number>();
      const queue = nodes.filter((building) => building.type === "core");
      for (const core of queue) connected.add(core.id);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor]!;
        for (const candidate of nodes) {
          if (!connected.has(candidate.id) && distance(current.position, candidate.position) <= 24) {
            connected.add(candidate.id);
            queue.push(candidate);
          }
        }
      }
      const connectedNodes = nodes.filter((node) => connected.has(node.id));
      let produced = connectedNodes.reduce((sum, building) => sum + BUILDINGS[building.type].energyProduction, 0);
      let used = 0;
      const priority: BuildingType[] = ["core", "generator", "relay", "storage", "conveyor", "bioExtractor", "oreExtractor", "waterExtractor", "port", "vat", "lab", "turret", "wall"];
      factionBuildings.sort((first, second) => priority.indexOf(first.type) - priority.indexOf(second.type));
      for (const building of factionBuildings) {
        const isPassive = building.type === "wall" || building.type === "core";
        const inNetwork = isPassive || connectedNodes.some((node) => distance(node.position, building.position) <= 21);
        let demand = BUILDINGS[building.type].energyUse;
        if (building.type === "vat" && this.mutations[faction].includes("leanMetabolism")) demand += 4;
        if (building.type === "conveyor" && this.mutations[faction].includes("hyperConveyors")) demand *= 2;
        building.powered = inNetwork && (isPassive || used + demand <= produced + 0.001);
        building.active = building.construction >= 1 && building.powered && building.hp > 0;
        if (building.powered) used += demand;
      }
      this.resources[faction].energyProduced = produced;
      this.resources[faction].energyUsed = used;
    }
  }

  private updateEconomy(): void {
    for (const faction of FACTIONS) {
      const stock = this.resources[faction];
      const activeCores = this.buildings.filter((building) => building.faction === faction && building.type === "core" && building.active).length;
      // A new colony can bootstrap itself, but dedicated extractors remain the
      // meaningful source of materials once the game is underway.
      stock.biomass = Math.min(999, stock.biomass + activeCores * 0.2 * TICK_SECONDS);
      stock.ore = Math.min(999, stock.ore + activeCores * 0.1 * TICK_SECONDS);
    }

    for (const extractor of this.buildings) {
      if (!extractor.active || !["bioExtractor", "oreExtractor", "waterExtractor"].includes(extractor.type)) continue;
      const region = this.regions.find((candidate) => candidate.id === extractor.regionId);
      if (!region) continue;
      const resource: ResourceType = extractor.type === "bioExtractor" ? "biomass" : extractor.type === "oreExtractor" ? "ore" : "water";
      let timer = this.extractorTimers.get(extractor.id) ?? 0;
      timer -= TICK_SECONDS;
      if (timer <= 0) {
        const path = this.findCargoPath(extractor);
        if (path) {
          this.cargo.push({
            id: this.nextEntityId++,
            faction: extractor.faction,
            resource,
            amount: 5,
            path,
            segment: 0,
            progress: 0,
            position: { ...path[0]! },
          });
          const yieldRate = resource === "water"
            ? Math.max(...region.neighbors.map((id) => this.regions.find((candidate) => candidate.id === id)?.yields.water ?? 0), 0.35)
            : region.yields[resource];
          timer = 3 / Math.max(0.35, yieldRate);
        } else {
          timer = 0.6;
        }
      }
      this.extractorTimers.set(extractor.id, timer);
    }
  }

  private findCargoPath(extractor: Building): Vec2[] | null {
    const candidates = this.buildings.filter((building) =>
      building.faction === extractor.faction && building.active &&
      (building.type === "conveyor" || building.type === "storage" || building.id === extractor.id),
    );
    const byId = new Map(candidates.map((building) => [building.id, building]));
    byId.set(extractor.id, extractor);
    const queue: number[] = [extractor.id];
    const parent = new Map<number, number | null>([[extractor.id, null]]);
    let targetId: number | null = null;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const currentId = queue[cursor]!;
      const current = byId.get(currentId);
      if (!current) continue;
      if (current.type === "storage") {
        targetId = currentId;
        break;
      }
      for (const candidate of byId.values()) {
        if (parent.has(candidate.id) || candidate.id === currentId) continue;
        const reach = current.type === "conveyor" && candidate.type === "conveyor" ? BUILD_GRID * 1.45 : 4.5;
        if (distance(current.position, candidate.position) <= reach) {
          parent.set(candidate.id, currentId);
          queue.push(candidate.id);
        }
      }
    }
    if (targetId === null) return null;
    const reversed: Vec2[] = [];
    let cursor: number | null = targetId;
    while (cursor !== null) {
      const building = byId.get(cursor);
      if (building) reversed.push({ ...building.position });
      cursor = parent.get(cursor) ?? null;
    }
    return reversed.reverse();
  }

  private updateCargo(): void {
    const retained: CargoPacket[] = [];
    for (const packet of this.cargo) {
      const next = packet.path[packet.segment + 1];
      const current = packet.path[packet.segment];
      if (!next || !current) {
        this.resources[packet.faction][packet.resource] = Math.min(999, this.resources[packet.faction][packet.resource] + packet.amount);
        if (packet.faction === "player") this.stats.cargoDelivered += packet.amount;
        continue;
      }
      const stillConnected = packet.path.slice(Math.max(1, packet.segment), -1).every((point) =>
        this.buildings.some((building) =>
          building.faction === packet.faction && building.type === "conveyor" && building.hp > 0 && distance(point, building.position) < 0.4,
        ),
      );
      if (!stillConnected) continue;
      const segmentLength = Math.max(0.001, distance(current, next));
      const multiplier = this.mutations[packet.faction].includes("hyperConveyors") ? 1.65 : 1;
      packet.progress += (7 * multiplier * TICK_SECONDS) / segmentLength;
      while (packet.progress >= 1) {
        packet.progress -= 1;
        packet.segment += 1;
        if (packet.segment >= packet.path.length - 1) break;
      }
      const from = packet.path[packet.segment] ?? next;
      const to = packet.path[packet.segment + 1];
      if (!to) {
        this.resources[packet.faction][packet.resource] = Math.min(999, this.resources[packet.faction][packet.resource] + packet.amount);
        if (packet.faction === "player") this.stats.cargoDelivered += packet.amount;
        continue;
      }
      packet.position.x = from.x + (to.x - from.x) * packet.progress;
      packet.position.z = from.z + (to.z - from.z) * packet.progress;
      retained.push(packet);
    }
    this.cargo = retained;
  }

  private updateProduction(): void {
    for (const vat of this.buildings) {
      if (vat.type !== "vat" || !vat.active || vat.queue.length === 0) continue;
      const type = vat.queue[0]!;
      const definition = UNITS[type];
      const speed = this.mutations[vat.faction].includes("rapidGestation") ? 1.4 : 1;
      vat.productionProgress += (TICK_SECONDS * speed) / definition.productionTime;
      if (vat.productionProgress < 1) continue;
      vat.productionProgress = 0;
      vat.queue.shift();
      const angle = this.random.between(0, Math.PI * 2);
      this.spawnUnit(vat.faction, type, {
        x: vat.position.x + Math.cos(angle) * 5,
        z: vat.position.z + Math.sin(angle) * 5,
      });
      this.resources[vat.faction].research += type === "breaker" ? 7 : 3;
      if (vat.faction === "player") this.stats.clonesProduced += 1;
    }
  }

  private updateBoatProduction(): void {
    for (const port of this.buildings) {
      if (port.type !== "port" || !port.active || port.boatQueue.length === 0) continue;
      const type = port.boatQueue[0]!;
      const definition = BOATS[type];
      port.boatProductionProgress += TICK_SECONDS / definition.productionTime;
      if (port.boatProductionProgress < 1) continue;
      port.boatProductionProgress = 0;
      port.boatQueue.shift();
      this.spawnBoat(port.faction, type, port);
      if (port.faction === "player") this.notify("success", `${definition.code} — BATEAU MIS À L’EAU`);
    }
  }

  private spawnBoat(faction: FactionId, type: BoatType, port: Building): void {
    const definition = BOATS[type];
    const region = this.regions.find((candidate) => candidate.id === port.regionId);
    const waterNeighbor = region?.neighbors
      .map((id) => this.regions.find((candidate) => candidate.id === id))
      .find((candidate) => candidate?.biome === "water");
    const direction = waterNeighbor
      ? { x: waterNeighbor.center.x - port.position.x, z: waterNeighbor.center.z - port.position.z }
      : { x: 1, z: 0 };
    const length = Math.max(0.001, Math.hypot(direction.x, direction.z));
    const position = {
      x: Math.max(-49, Math.min(49, port.position.x + (direction.x / length) * 5)),
      z: Math.max(-49, Math.min(49, port.position.z + (direction.z / length) * 5)),
    };
    this.boats.push({
      id: this.nextEntityId++, faction, type, position, velocity: { x: 0, z: 0 },
      hp: definition.hp, maxHp: definition.hp, capacity: definition.capacity, passengerIds: [], portId: port.id,
      target: null, state: "moored",
    });
  }

  private updateBoats(): void {
    for (const boat of this.boats) {
      for (const passengerId of boat.passengerIds) {
        const passenger = this.units.find((unit) => unit.id === passengerId);
        if (passenger) passenger.position = { ...boat.position };
      }
      if (boat.state !== "sailing" || !boat.target) continue;
      const dx = boat.target.x - boat.position.x;
      const dz = boat.target.z - boat.position.z;
      const gap = Math.hypot(dx, dz);
      const speed = BOATS[boat.type].speed;
      if (gap > speed * TICK_SECONDS + 1.2) {
        boat.velocity = { x: (dx / gap) * speed, z: (dz / gap) * speed };
        boat.position.x += boat.velocity.x * TICK_SECONDS;
        boat.position.z += boat.velocity.z * TICK_SECONDS;
        continue;
      }
      boat.position = { ...boat.target };
      boat.velocity = { x: 0, z: 0 };
      boat.target = null;
      boat.state = "moored";
      this.disembarkBoat(boat);
    }
  }

  private disembarkBoat(boat: Boat): void {
    const passengerIds = [...boat.passengerIds];
    boat.passengerIds = [];
    for (let index = 0; index < passengerIds.length; index += 1) {
      const unit = this.units.find((candidate) => candidate.id === passengerIds[index]);
      if (!unit) continue;
      const angle = (index / Math.max(1, passengerIds.length)) * Math.PI * 2;
      unit.embarkedIn = null;
      unit.position = { x: boat.position.x + Math.cos(angle) * 2.3, z: boat.position.z + Math.sin(angle) * 2.3 };
      unit.velocity = { x: 0, z: 0 };
      unit.order = { type: "idle" };
    }
    if (boat.faction === "player") this.notify("success", `DÉBARQUEMENT TERMINÉ — ${passengerIds.length} CLONES`);
  }

  private updatePortTrade(): void {
    const ports = this.buildings.filter((building) => building.type === "port" && building.active);
    const retained: TradeShip[] = [];
    for (const ship of this.tradeShips) {
      const destination = ports.find((port) => port.id === ship.destinationPortId);
      const origin = ports.find((port) => port.id === ship.originPortId);
      if (!destination || !origin) continue;
      const dx = destination.position.x - ship.position.x;
      const dz = destination.position.z - ship.position.z;
      const gap = Math.hypot(dx, dz);
      const speed = 8.2;
      if (gap > speed * TICK_SECONDS + 1.1) {
        ship.velocity = { x: (dx / gap) * speed, z: (dz / gap) * speed };
        ship.position.x += ship.velocity.x * TICK_SECONDS;
        ship.position.z += ship.velocity.z * TICK_SECONDS;
        retained.push(ship);
        continue;
      }
      this.completeTrade(ship, origin, destination);
    }
    this.tradeShips = retained;

    for (const port of ports) {
      let timer = (this.portTradeTimers.get(port.id) ?? 3) - TICK_SECONDS;
      if (timer > 0) {
        this.portTradeTimers.set(port.id, timer);
        continue;
      }
      timer = 12;
      if (this.tradeShips.filter((ship) => ship.originPortId === port.id).length >= 2 || this.tradeShips.length >= 18) {
        this.portTradeTimers.set(port.id, timer);
        continue;
      }
      const targets = ports.filter((candidate) =>
        candidate.id !== port.id && !this.isLandReachable(port.regionId, candidate.regionId),
      );
      if (targets.length === 0) {
        this.portTradeTimers.set(port.id, timer);
        continue;
      }
      targets.sort((first, second) => distance(port.position, first.position) - distance(port.position, second.position));
      const destination = this.random.pick(targets.slice(0, Math.min(3, targets.length)));
      const reward = Math.max(3, Math.round(2 + distance(port.position, destination.position) / 13));
      this.tradeShips.push({
        id: this.nextEntityId++, faction: port.faction, originPortId: port.id, destinationPortId: destination.id,
        position: { ...port.position }, velocity: { x: 0, z: 0 }, reward,
      });
      this.portTradeTimers.set(port.id, timer);
      if (port.faction === "player") this.notify("info", "NAVIRE D’ÉCHANGE EXPÉDIÉ");
    }
  }

  private completeTrade(ship: TradeShip, origin: Building, destination: Building): void {
    const reward = ship.reward;
    this.resources[origin.faction].biomass = Math.min(999, this.resources[origin.faction].biomass + reward);
    this.resources[origin.faction].water = Math.min(999, this.resources[origin.faction].water + Math.ceil(reward * 0.5));
    this.resources[destination.faction].ore = Math.min(999, this.resources[destination.faction].ore + reward);
    this.resources[destination.faction].research += reward * 0.35;
    if (origin.faction === "player" || destination.faction === "player") this.stats.portTradesCompleted += 1;
    if (origin.faction === "player" || destination.faction === "player") {
      this.notify("success", `ÉCHANGE PORTUAIRE TERMINÉ — +${reward} MATÉRIAUX`);
    }
  }

  private spawnUnit(faction: FactionId, type: UnitType, position: Vec2): Unit {
    const definition = UNITS[type];
    const reinforced = this.mutations[faction].includes("reinforcedTissue") ? 1.28 : 1;
    const fragile = this.mutations[faction].includes("rapidGestation") ? 0.9 : 1;
    const maxHp = Math.round(definition.hp * reinforced * fragile);
    const sameTypeCount = this.units.filter((unit) => unit.faction === faction && unit.type === type).length;
    // Every species forms compact four-clone squads. The type prefix keeps squads
    // distinct even when two species are produced in the same match.
    const squadPrefixes: Record<UnitType, number> = { worker: 1_000, scout: 2_000, assault: 3_000, breaker: 4_000 };
    const squadId = squadPrefixes[type] + Math.floor(sameTypeCount / 4);
    const unit: Unit = {
      id: this.nextEntityId++, faction, type, squadId,
      position: { ...position }, velocity: { x: 0, z: 0 },
      hp: maxHp, maxHp, cooldown: 0, order: { type: "idle" }, visible: true, embarkedIn: null, kills: 0,
    };
    this.units.push(unit);
    return unit;
  }

  private chooseMutation(faction: FactionId, mutationId: MutationId): boolean {
    if (this.mutations[faction].includes(mutationId)) return false;
    if (faction === "player" && !this.mutationChoices.includes(mutationId)) return false;
    this.mutations[faction].push(mutationId);
    this.mutationLevel[faction] += 1;
    if (mutationId === "reinforcedTissue" || mutationId === "rapidGestation") {
      for (const unit of this.units) {
        if (unit.faction !== faction) continue;
        const oldMax = unit.maxHp;
        const definition = UNITS[unit.type];
        const reinforced = this.mutations[faction].includes("reinforcedTissue") ? 1.28 : 1;
        const fragile = this.mutations[faction].includes("rapidGestation") ? 0.9 : 1;
        unit.maxHp = Math.round(definition.hp * reinforced * fragile);
        unit.hp = Math.min(unit.maxHp, unit.hp * (unit.maxHp / oldMax));
      }
    }
    if (faction === "player") {
      this.mutationChoices = [];
      this.phase = "playing";
      this.notify("success", `MUTATION STABILISÉE — ${MUTATIONS[mutationId].name}`);
    }
    return true;
  }

  private getEntityPosition(id: number, kind: "unit" | "building"): Vec2 | null {
    const entity = kind === "unit"
      ? this.units.find((unit) => unit.id === id)
      : this.buildings.find((building) => building.id === id);
    return entity ? entity.position : null;
  }

  private notify(tone: Notification["tone"], text: string): void {
    this.notifications.push({ id: this.nextNotificationId++, tone, text, tick: this.tickCount });
  }

  private updateSquadPaths(): void {
    const squads = new Map<string, Unit[]>();
    for (const unit of this.units) {
      const key = `${unit.faction}:${unit.squadId}`;
      const members = squads.get(key) ?? [];
      members.push(unit);
      squads.set(key, members);
    }
    for (const [key, path] of this.squadPaths) {
      const members = squads.get(key)?.filter((unit) => path.unitIds.has(unit.id));
      const waypoint = path.points[path.index];
      if (!members || !waypoint) {
        this.squadPaths.delete(key);
        continue;
      }
      const center = {
        x: members.reduce((sum, unit) => sum + unit.position.x, 0) / members.length,
        z: members.reduce((sum, unit) => sum + unit.position.z, 0) / members.length,
      };
      if (distance(center, waypoint) < 3.8 && path.index < path.points.length - 1) path.index += 1;
    }
  }

  private movementTarget(unit: Unit): Vec2 | null {
    if (unit.order.type === "idle") return null;
    const path = this.squadPaths.get(`${unit.faction}:${unit.squadId}`);
    if (path?.unitIds.has(unit.id) && path.points[path.index]) return path.points[path.index]!;
    const order = unit.order;
    if (order.type === "attack") return this.getEntityPosition(order.targetId, order.targetKind);
    return order.target;
  }

  private unitSpeed(unit: Unit): number {
    const slow = this.mutations[unit.faction].includes("reinforcedTissue") ? 0.9 : 1;
    return UNITS[unit.type].speed * slow;
  }

  private unitVision(unit: Unit): number {
    const collective = this.mutations[unit.faction].includes("collectiveSight") ? 1.3 : 1;
    const recycling = this.mutations[unit.faction].includes("corpseRecycling") ? 0.88 : 1;
    return UNITS[unit.type].vision * collective * recycling;
  }

  private unitDamage(unit: Unit): number {
    const collective = this.mutations[unit.faction].includes("collectiveSight") ? 0.92 : 1;
    return UNITS[unit.type].damage * collective;
  }

  private updateUnits(): void {
    const spatial = new Map<string, Unit[]>();
    const cellSize = 4;
    const spatialKey = (position: Vec2) => `${Math.floor(position.x / cellSize)}:${Math.floor(position.z / cellSize)}`;
    for (const unit of this.units) {
      if (unit.embarkedIn !== null) continue;
      const key = spatialKey(unit.position);
      const list = spatial.get(key) ?? [];
      list.push(unit);
      spatial.set(key, list);
    }

    for (const unit of this.units) {
      if (unit.hp <= 0 || unit.embarkedIn !== null) continue;
      unit.cooldown = Math.max(0, unit.cooldown - TICK_SECONDS);
      const definition = UNITS[unit.type];
      let combatTarget: Unit | Building | null = null;
      let combatTargetKind: "unit" | "building" = "unit";

      if (unit.order.type === "attack") {
        const attackOrder = unit.order;
        if (attackOrder.targetKind === "unit") {
          combatTarget = this.units.find((target) => target.id === attackOrder.targetId && target.hp > 0) ?? null;
        } else {
          combatTarget = this.buildings.find((target) => target.id === attackOrder.targetId && target.hp > 0) ?? null;
          combatTargetKind = "building";
        }
        if (!combatTarget) unit.order = { type: "idle" };
      }

      if (!combatTarget && (unit.order.type === "attackMove" || unit.order.type === "idle" || unit.order.type === "patrol")) {
        const nearby = this.findNearestEnemy(unit.faction, unit.position, definition.aggroRange);
        if (nearby) {
          combatTarget = nearby.entity;
          combatTargetKind = nearby.kind;
        }
      }

      let desiredTarget = this.movementTarget(unit);
      if (combatTarget) {
        const targetSize = combatTargetKind === "building"
          ? BUILDINGS[(combatTarget as Building).type].size * 0.42
          : 0.4;
        const attackRange = definition.attackRange + targetSize;
        const targetDistance = distance(unit.position, combatTarget.position);
        if (targetDistance <= attackRange && unit.cooldown <= 0) {
          const targetId = combatTarget.id;
          this.projectiles.push({
            id: this.nextEntityId++, faction: unit.faction,
            from: { ...unit.position }, position: { ...unit.position }, target: { ...combatTarget.position },
            targetId, targetKind: combatTargetKind,
            damage: this.unitDamage(unit) * (combatTargetKind === "building" ? definition.structureMultiplier : 1),
            speed: unit.type === "worker" || unit.type === "breaker" ? 18 : 30,
            color: unit.faction === "player" ? "#d5ff69" : "#ff6857",
          });
          unit.cooldown = definition.attackCooldown;
        }
        if (targetDistance > attackRange * 0.88) desiredTarget = combatTarget.position;
        else desiredTarget = null;
      }

      let desiredX = 0;
      let desiredZ = 0;
      if (desiredTarget) {
        const dx = desiredTarget.x - unit.position.x;
        const dz = desiredTarget.z - unit.position.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.35) {
          const speed = this.unitSpeed(unit);
          desiredX = (dx / length) * speed;
          desiredZ = (dz / length) * speed;
        } else if (unit.order.type === "move" || unit.order.type === "attackMove") {
          const path = this.squadPaths.get(`${unit.faction}:${unit.squadId}`);
          if (!path || path.index >= path.points.length - 1) unit.order = { type: "idle" };
        } else if (unit.order.type === "patrol") {
          const next = unit.order.origin;
          unit.order = { type: "patrol", origin: { ...unit.order.target }, target: { ...next } };
          this.squadPaths.delete(`${unit.faction}:${unit.squadId}`);
        }
      }

      const gridX = Math.floor(unit.position.x / cellSize);
      const gridZ = Math.floor(unit.position.z / cellSize);
      let separationX = 0;
      let separationZ = 0;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
          const neighbors = spatial.get(`${gridX + offsetX}:${gridZ + offsetZ}`);
          if (!neighbors) continue;
          for (const neighbor of neighbors) {
            if (neighbor.id === unit.id || neighbor.faction !== unit.faction) continue;
            const dx = unit.position.x - neighbor.position.x;
            const dz = unit.position.z - neighbor.position.z;
            const gap = Math.hypot(dx, dz);
            if (gap > 0.001 && gap < 1.25) {
              const strength = (1.25 - gap) / 1.25;
              separationX += (dx / gap) * strength * 3.5;
              separationZ += (dz / gap) * strength * 3.5;
            }
          }
        }
      }

      for (const building of this.buildings) {
        if (building.hp <= 0 || building.type === "conveyor" || building.type === "storage") continue;
        const dx = unit.position.x - building.position.x;
        const dz = unit.position.z - building.position.z;
        const gap = Math.hypot(dx, dz);
        const radius = BUILDINGS[building.type].size * 0.48 + 0.45;
        if (gap > 0.001 && gap < radius) {
          separationX += (dx / gap) * (radius - gap) * 6;
          separationZ += (dz / gap) * (radius - gap) * 6;
        }
      }

      const targetVelocityX = desiredX + separationX;
      const targetVelocityZ = desiredZ + separationZ;
      unit.velocity.x += (targetVelocityX - unit.velocity.x) * 0.2;
      unit.velocity.z += (targetVelocityZ - unit.velocity.z) * 0.2;
      const maximumSpeed = this.unitSpeed(unit) * 1.15;
      const velocityLength = Math.hypot(unit.velocity.x, unit.velocity.z);
      if (velocityLength > maximumSpeed) {
        unit.velocity.x = (unit.velocity.x / velocityLength) * maximumSpeed;
        unit.velocity.z = (unit.velocity.z / velocityLength) * maximumSpeed;
      }
      const nextPosition = {
        x: Math.max(-49, Math.min(49, unit.position.x + unit.velocity.x * TICK_SECONDS)),
        z: Math.max(-49, Math.min(49, unit.position.z + unit.velocity.z * TICK_SECONDS)),
      };
      if (findRegionAt(this.regions, nextPosition)?.biome === "water") {
        unit.velocity = { x: 0, z: 0 };
        unit.order = { type: "idle" };
      } else {
        unit.position = nextPosition;
      }
    }
  }

  private findNearestEnemy(
    faction: FactionId,
    position: Vec2,
    range: number,
  ): { entity: Unit | Building; kind: "unit" | "building" } | null {
    const enemy = opposingFaction(faction);
    let result: { entity: Unit | Building; kind: "unit" | "building" } | null = null;
    let closest = range;
    for (const unit of this.units) {
      if (unit.faction !== enemy || unit.hp <= 0 || unit.embarkedIn !== null) continue;
      const gap = distance(position, unit.position);
      if (gap < closest) {
        closest = gap;
        result = { entity: unit, kind: "unit" };
      }
    }
    for (const building of this.buildings) {
      if (building.faction !== enemy || building.hp <= 0 || building.construction < 0.2) continue;
      const gap = distance(position, building.position) - BUILDINGS[building.type].size * 0.35;
      if (gap < closest) {
        closest = gap;
        result = { entity: building, kind: "building" };
      }
    }
    return result;
  }

  private updateTurrets(): void {
    for (const turret of this.buildings) {
      if (turret.type !== "turret" || !turret.active) continue;
      turret.cooldown = Math.max(0, turret.cooldown - TICK_SECONDS);
      if (turret.cooldown > 0) continue;
      const target = this.findNearestEnemy(turret.faction, turret.position, 17);
      if (!target) continue;
      this.projectiles.push({
        id: this.nextEntityId++, faction: turret.faction,
        from: { ...turret.position }, position: { ...turret.position }, target: { ...target.entity.position },
        targetId: target.entity.id, targetKind: target.kind,
        damage: 24, speed: 34,
        color: turret.faction === "player" ? "#e7ff93" : "#ff8d7f",
      });
      turret.cooldown = 0.7;
    }
  }

  private updateProjectiles(): void {
    const retained: Projectile[] = [];
    for (const projectile of this.projectiles) {
      const target = projectile.targetKind === "unit"
        ? this.units.find((unit) => unit.id === projectile.targetId && unit.hp > 0)
        : this.buildings.find((building) => building.id === projectile.targetId && building.hp > 0);
      if (!target) continue;
      projectile.target = { ...target.position };
      const gap = distance(projectile.position, projectile.target);
      const travel = projectile.speed * TICK_SECONDS;
      if (gap <= travel + 0.2) {
        this.damageEntity(target, projectile.targetKind, projectile.damage, projectile.faction);
        continue;
      }
      projectile.position.x += ((projectile.target.x - projectile.position.x) / gap) * travel;
      projectile.position.z += ((projectile.target.z - projectile.position.z) / gap) * travel;
      retained.push(projectile);
    }
    this.projectiles = retained;
  }

  private damageEntity(
    target: Unit | Building,
    kind: "unit" | "building",
    amount: number,
    attacker: FactionId,
  ): void {
    if (target.hp <= 0) return;
    if (kind === "building") {
      const building = target as Building;
      if (building.type === "core" && this.elapsedSeconds < CORE_SHIELD_SECONDS) return;
    }
    target.hp -= amount;
    if (target.hp > 0) return;
    target.hp = 0;
    if (kind === "unit") {
      const unit = target as Unit;
      if (unit.faction === "player") this.stats.clonesLost += 1;
      if (attacker === "player" && unit.faction === "enemy") this.stats.enemiesDestroyed += 1;
      if (this.mutations[attacker].includes("corpseRecycling")) {
        this.resources[attacker].biomass = Math.min(999, this.resources[attacker].biomass + 4);
      }
      this.resources[attacker].research += 1.5;
    } else {
      const building = target as Building;
      this.resources[attacker].research += building.type === "core" ? 35 : 5;
      if (building.type === "core") {
        this.collapseColony(building);
        const survivingCores = this.buildings.some((candidate) =>
          candidate.id !== building.id && candidate.type === "core" && candidate.faction === building.faction && candidate.hp > 0,
        );
        if (!survivingCores) this.winner = attacker;
        this.notify(attacker === "player" ? "success" : "warning", survivingCores ? "NOYAU RIVAL DÉTRUIT — AUTRES COLONIES ACTIVES" : "NOYAU DE RÉPLICATION ANÉANTI");
      } else if (building.faction === "player") {
        this.notify("warning", `${BUILDINGS[building.type].shortName} DÉTRUIT`);
      }
    }
  }

  private collapseColony(core: Building): void {
    const collapsedBuildingIds = new Set(
      this.buildings
        .filter((building) => building.faction === core.faction && building.regionId === core.regionId)
        .map((building) => building.id),
    );
    for (const building of this.buildings) {
      if (collapsedBuildingIds.has(building.id)) building.hp = 0;
    }
    for (const unit of this.units) {
      const region = findRegionAt(this.regions, unit.position);
      if (unit.faction === core.faction && region?.id === core.regionId) unit.hp = 0;
    }
    this.boats = this.boats.filter((boat) => !collapsedBuildingIds.has(boat.portId));
    this.cargo = this.cargo.filter((packet) => packet.faction !== core.faction || !pointInPolygon(packet.position, this.regions.find((region) => region.id === core.regionId)?.vertices ?? []));
  }

  private removeDestroyedEntities(): void {
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.buildings = this.buildings.filter((building) => building.hp > 0);
  }

  private updateCapture(): void {
    const presence = new Map<number, Record<FactionId, number>>();
    for (const region of this.regions) presence.set(region.id, { player: 0, enemy: 0 });
    for (const unit of this.units) {
      if (unit.embarkedIn !== null) continue;
      const region = findRegionAt(this.regions, unit.position);
      if (!region || region.biome === "water") continue;
      presence.get(region.id)![unit.faction] += UNITS[unit.type].capture;
    }

    for (const region of this.regions) {
      if (region.biome === "water") continue;
      const scores = presence.get(region.id)!;
      const dominant: FactionId | null = scores.player > scores.enemy * 1.15 && scores.player > 0.2
        ? "player"
        : scores.enemy > scores.player * 1.15 && scores.enemy > 0.2
          ? "enemy"
          : null;
      if (dominant) {
        const frontierBonus = region.neighbors.some((id) => this.regions.find((candidate) => candidate.id === id)?.owner === dominant) ? 1.25 : 1;
        const elevationResistance = 1 / (1 + region.elevation * 0.12);
        if (region.owner === dominant) {
          region.captureFaction = dominant;
          region.captureProgress = Math.min(100, region.captureProgress + scores[dominant] * TICK_SECONDS * 2.2);
        } else {
          if (region.captureFaction !== dominant) {
            region.captureFaction = dominant;
            region.captureProgress = 0;
          }
          region.captureProgress += Math.min(4.5, scores[dominant]) * TICK_SECONDS * 6.8 * frontierBonus * elevationResistance;
          if (region.captureProgress >= 100) {
            const previous = region.owner;
            region.owner = dominant;
            region.captureProgress = 100;
            if (dominant === "player" || previous === "player") {
              this.notify(dominant === "player" ? "success" : "warning", `${region.name.toUpperCase()} — ${dominant === "player" ? "ASSIMILÉE" : "PERDUE"}`);
            }
          }
        }
      } else if (region.owner !== "neutral") {
        const stabilizer = this.buildings.some((building) =>
          building.regionId === region.id && building.faction === region.owner &&
          (building.type === "relay" || building.type === "core") && building.construction >= 1,
        );
        if (!stabilizer && scores[region.owner] <= 0.1) {
          region.captureProgress = Math.max(0, region.captureProgress - 0.35 * TICK_SECONDS);
          if (region.captureProgress <= 0) {
            region.owner = "neutral";
            region.captureFaction = "neutral";
          }
        }
      }
    }
    const playerTerritory = this.regions.filter((region) => region.owner === "player").length;
    this.stats.territoryPeak = Math.max(this.stats.territoryPeak, playerTerritory);
  }

  private updateVision(): void {
    for (const faction of FACTIONS) {
      const observers: Array<{ position: Vec2; range: number }> = [];
      for (const unit of this.units) {
        if (unit.faction === faction && unit.embarkedIn === null) observers.push({ position: unit.position, range: this.unitVision(unit) });
      }
      for (const building of this.buildings) {
        if (building.faction === faction && building.construction >= 0.5) {
          observers.push({ position: building.position, range: BUILDINGS[building.type].vision });
        }
      }
      for (const region of this.regions) {
        const radius = region.vertices.reduce((maximum, vertex) => Math.max(maximum, distance(vertex, region.center)), 0) * 0.45;
        if (observers.some((observer) => distance(observer.position, region.center) <= observer.range + radius)) {
          this.discoveredBy[faction].add(region.id);
        }
      }
    }
    for (const region of this.regions) {
      region.visible = this.isVisibleTo(region.center, "player", 7);
      region.discovered = this.discoveredBy.player.has(region.id);
    }
    const playerCore = this.buildings.find((building) => building.faction === "player" && building.type === "core");
    if (playerCore && this.isVisibleTo(playerCore.position, "enemy")) this.ai.knownPlayerCore = { ...playerCore.position };
  }

  private isVisibleTo(position: Vec2, faction: FactionId, padding = 0): boolean {
    for (const unit of this.units) {
      if (unit.faction === faction && unit.embarkedIn === null && distance(unit.position, position) <= this.unitVision(unit) + padding) return true;
    }
    for (const building of this.buildings) {
      if (
        building.faction === faction && building.construction >= 0.5 &&
        distance(building.position, position) <= BUILDINGS[building.type].vision + padding
      ) return true;
    }
    return false;
  }

  private updateResearch(): void {
    for (const faction of FACTIONS) {
      const activeLabs = this.buildings.filter((building) => building.faction === faction && building.type === "lab" && building.active).length;
      this.resources[faction].research += (0.08 + activeLabs * 2.25) * TICK_SECONDS;
    }
  }

  private checkMutations(): void {
    for (const faction of FACTIONS) {
      const level = this.mutationLevel[faction];
      const threshold = MUTATION_THRESHOLDS[level];
      if (threshold === undefined || this.resources[faction].research < threshold) continue;
      const eligible = (Object.keys(MUTATIONS) as MutationId[]).filter((id) => !this.mutations[faction].includes(id));
      if (faction === "enemy") {
        const choice = this.random.pick(eligible);
        this.mutations.enemy.push(choice);
        this.mutationLevel.enemy += 1;
      } else if (this.mutationChoices.length === 0) {
        this.mutationChoices = this.random.shuffle(eligible).slice(0, 3);
        this.phase = "mutation";
        this.notify("info", "PALIER ADN — SÉLECTION REQUISE");
      }
    }
  }

  private checkVictory(): void {
    if (!this.winner) return;
    this.phase = this.winner === "player" ? "victory" : "defeat";
    this.paused = false;
  }

  private runAi(): void {
    if (this.phase !== "playing") return;
    const faction: FactionId = "enemy";
    const ownBuildings = this.buildings.filter((building) => building.faction === faction);
    const ownUnits = this.units.filter((unit) => unit.faction === faction);
    const workers = ownUnits.filter((unit) => unit.type === "worker");
    const cores = ownBuildings.filter((building) => building.type === "core" && building.hp > 0);
    if (cores.length === 0) return;

    const vats = ownBuildings.filter((building) => building.type === "vat" && building.construction >= 1);
    for (const vat of vats) {
      if (vat.queue.length >= 3) continue;
      const cycle: UnitType[] = ["scout", "assault", "assault", "worker", "breaker", "assault"];
      const type = cycle[(ownUnits.length + vat.queue.length) % cycle.length]!;
      this.applyCommand(faction, { type: "queueClone", buildingId: vat.id, unitType: type });
    }

    for (const core of cores) this.runAiBase(core, ownBuildings);

    for (const region of this.regions) {
      if (region.owner !== "enemy" || cores.some((core) => core.regionId === region.id)) continue;
      const hasRelay = ownBuildings.some((building) => building.regionId === region.id && building.type === "relay");
      const workerNearby = workers.some((worker) => distance(worker.position, region.center) < 16);
      if (!hasRelay && workerNearby) {
        this.applyCommand(faction, { type: "placeBuilding", buildingType: "relay", position: region.center });
      }
    }

    const squads = new Map<number, Unit[]>();
    const baseWorkerIds = new Set<number>();
    for (const core of cores) {
      workers
        .filter((worker) => distance(worker.position, core.position) < 24)
        .sort((first, second) => distance(first.position, core.position) - distance(second.position, core.position))
        .slice(0, 3)
        .forEach((worker) => baseWorkerIds.add(worker.id));
    }
    for (const unit of ownUnits) {
      if (baseWorkerIds.has(unit.id)) continue;
      const members = squads.get(unit.squadId) ?? [];
      members.push(unit);
      squads.set(unit.squadId, members);
    }
    for (const members of squads.values()) {
      if (members.length === 0) continue;
      const center = {
        x: members.reduce((sum, unit) => sum + unit.position.x, 0) / members.length,
        z: members.reduce((sum, unit) => sum + unit.position.z, 0) / members.length,
      };
      const allIdle = members.every((unit) => unit.order.type === "idle") ||
        members.some((unit) => unit.order.type !== "attack" && "target" in unit.order && distance(unit.position, unit.order.target) < 4);
      if (!allIdle && this.tickCount % (TICK_RATE * 8) !== 0) continue;
      let target: Vec2 | null = null;
      if (this.ai.knownPlayerCore && this.elapsedSeconds > 150) {
        target = this.ai.knownPlayerCore;
      } else {
        const ownedIds = new Set(this.regions.filter((region) => region.owner === "enemy").map((region) => region.id));
        const frontier = this.regions.filter((region) =>
          region.biome !== "water" && region.owner !== "enemy" && region.neighbors.some((neighbor) => ownedIds.has(neighbor)),
        );
        const candidates = frontier.length > 0
          ? frontier
          : this.regions.filter((region) => region.biome !== "water" && this.discoveredBy.enemy.has(region.id) && region.owner !== "enemy");
        candidates.sort((first, second) => distance(center, first.center) - distance(center, second.center));
        target = candidates[0]?.center ?? this.regions[(this.ai.scoutRegionCursor++) % this.regions.length]!.center;
      }
      this.applyCommand(faction, {
        type: "setOrder",
        unitIds: members.map((unit) => unit.id),
        order: { type: "attackMove", target: { ...target } },
      });
    }
  }

  private runAiBase(core: Building, ownBuildings: Building[]): void {
    const startRegion = this.regions.find((region) => region.id === core.regionId);
    if (!startRegion) return;
    const baseBuildings = ownBuildings.filter((building) => building.regionId === core.regionId);
    const storage = baseBuildings.find((building) => building.type === "storage");
    if (!storage) return;

    if (!baseBuildings.some((building) => building.type === "bioExtractor")) {
      const target = this.findFreePoint(startRegion, { x: storage.position.x + 11, z: storage.position.z }, BUILDINGS.bioExtractor.size);
      this.applyCommand("enemy", { type: "placeBuilding", buildingType: "bioExtractor", position: target });
    } else if (!baseBuildings.some((building) => building.type === "oreExtractor")) {
      const target = this.findFreePoint(startRegion, { x: storage.position.x - 11, z: storage.position.z + 2.5 }, BUILDINGS.oreExtractor.size);
      this.applyCommand("enemy", { type: "placeBuilding", buildingType: "oreExtractor", position: target });
    }

    const extractors = baseBuildings.filter((building) => building.type === "bioExtractor" || building.type === "oreExtractor");
    for (const extractor of extractors) this.extendAiConveyor(extractor, storage);

    const localEnergy = baseBuildings.reduce((sum, building) => sum + (building.powered ? BUILDINGS[building.type].energyProduction - BUILDINGS[building.type].energyUse : 0), 0);
    if (localEnergy < 8 && baseBuildings.filter((building) => building.type === "generator").length < 3) {
      const target = this.findFreePoint(startRegion, { x: core.position.x - 10, z: core.position.z + 8 }, BUILDINGS.generator.size);
      this.applyCommand("enemy", { type: "placeBuilding", buildingType: "generator", position: target });
    }
    if (this.elapsedSeconds > 55 && !baseBuildings.some((building) => building.type === "lab")) {
      const target = this.findFreePoint(startRegion, { x: core.position.x + 10, z: core.position.z + 9 }, BUILDINGS.lab.size);
      this.applyCommand("enemy", { type: "placeBuilding", buildingType: "lab", position: target });
    }
    if (this.elapsedSeconds > 75 && baseBuildings.filter((building) => building.type === "turret").length < 2) {
      const angle = baseBuildings.filter((building) => building.type === "turret").length * Math.PI + 0.4;
      const target = this.findFreePoint(startRegion, {
        x: core.position.x + Math.cos(angle) * 12,
        z: core.position.z + Math.sin(angle) * 12,
      }, BUILDINGS.turret.size);
      this.applyCommand("enemy", { type: "placeBuilding", buildingType: "turret", position: target });
    }
  }

  private extendAiConveyor(extractor: Building, storage: Building): void {
    if (this.findCargoPath(extractor)) return;
    const gap = distance(extractor.position, storage.position);
    const steps = Math.max(1, Math.round(gap / BUILD_GRID));
    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      const position = {
        x: snap(extractor.position.x + (storage.position.x - extractor.position.x) * ratio),
        z: snap(extractor.position.z + (storage.position.z - extractor.position.z) * ratio),
      };
      if (distance(position, extractor.position) < 3.5 || distance(position, storage.position) < 3.5) continue;
      const exists = this.buildings.some((building) => building.faction === "enemy" && building.type === "conveyor" && distance(building.position, position) < 0.5);
      if (!exists && this.applyCommand("enemy", { type: "placeBuilding", buildingType: "conveyor", position })) return;
    }
  }

  getSnapshot(): GameSnapshot {
    const revealAll = this.phase === "deployment" || this.phase === "victory" || this.phase === "defeat";
    const regionCopies = this.regions.map((region) => ({
      ...region,
      center: { ...region.center },
      vertices: region.vertices.map((vertex) => ({ ...vertex })),
      neighbors: [...region.neighbors],
      yields: { ...region.yields },
      discovered: true,
      visible: true,
    }));
    const visibleBuildings = this.buildings
      .map((building) => ({ ...building, position: { ...building.position }, queue: [...building.queue], boatQueue: [...building.boatQueue] }));
    const visibleUnits = this.units
      .filter((unit) => unit.embarkedIn === null && (revealAll || unit.faction === "player" || this.isAdjacentToPlayerTerritory(unit.position)))
      .map((unit) => ({
        ...unit,
        position: { ...unit.position },
        velocity: { ...unit.velocity },
        order: cloneOrder(unit.order),
        visible: true,
      }));
    const visibleBoats = this.boats
      .filter((boat) => revealAll || boat.faction === "player" || this.isAdjacentToPlayerTerritory(boat.position))
      .map((boat) => ({
        ...boat,
        position: { ...boat.position },
        velocity: { ...boat.velocity },
        passengerIds: [...boat.passengerIds],
        target: boat.target ? { ...boat.target } : null,
      }));
    const visibleTradeShips = this.tradeShips
      .filter((ship) => revealAll || ship.faction === "player" || this.isAdjacentToPlayerTerritory(ship.position))
      .map((ship) => ({ ...ship, position: { ...ship.position }, velocity: { ...ship.velocity } }));
    const visibleCargo = this.cargo
      .filter((packet) => revealAll || packet.faction === "player" || this.isVisibleTo(packet.position, "player"))
      .map((packet) => ({
        ...packet,
        position: { ...packet.position },
        path: packet.path.map((point) => ({ ...point })),
      }));
    const visibleProjectiles = this.projectiles
      .filter((projectile) => revealAll || projectile.faction === "player" || this.isVisibleTo(projectile.position, "player"))
      .map((projectile) => ({
        ...projectile,
        from: { ...projectile.from }, position: { ...projectile.position }, target: { ...projectile.target },
      }));

    return {
      seed: this.seed,
      mapPreset: this.mapPreset,
      aiCount: this.aiCount,
      tick: this.tickCount,
      elapsedSeconds: this.elapsedSeconds,
      phase: this.phase,
      paused: this.paused,
      shieldSeconds: Math.max(0, CORE_SHIELD_SECONDS - this.elapsedSeconds),
      regions: regionCopies,
      buildings: visibleBuildings,
      units: visibleUnits,
      boats: visibleBoats,
      tradeShips: visibleTradeShips,
      cargo: visibleCargo,
      projectiles: visibleProjectiles,
      resources: {
        player: { ...this.resources.player },
        enemy: { ...this.resources.enemy },
      },
      mutations: { player: [...this.mutations.player], enemy: [...this.mutations.enemy] },
      mutationChoices: this.mutationChoices.map((id) => ({ ...MUTATIONS[id] })),
      stats: { ...this.stats },
      notifications: this.notifications.map((entry) => ({ ...entry })),
      winner: this.winner,
    };
  }
}
