export type FactionId = "player" | "enemy";
export type RegionOwner = FactionId | "neutral";
export type MapPreset = "compact" | "standard" | "frontier";
export interface MatchConfig {
  mapPreset: MapPreset;
  aiCount: number;
}
export type GamePhase =
  | "deployment"
  | "playing"
  | "mutation"
  | "victory"
  | "defeat";

export type BiomeId = "forest" | "quarry" | "geothermal" | "plains" | "water";
export type ResourceType = "biomass" | "ore" | "water";
export type BuildingType =
  | "core"
  | "generator"
  | "storage"
  | "vat"
  | "extractor"
  | "waterExtractor"
  | "conveyor"
  | "relay"
  | "turret"
  | "wall"
  | "port";
export type UnitType = "worker" | "scout" | "assault" | "breaker";
export type BoatType = "skiff" | "landingCraft" | "armoredBarge";
export type MutationId =
  | "rapidGestation"
  | "reinforcedTissue"
  | "leanMetabolism"
  | "hyperConveyors"
  | "corpseRecycling"
  | "collectiveSight";

export interface Vec2 {
  x: number;
  z: number;
}

export interface RegionAnchor {
  id: number;
  position: Vec2;
  owner: RegionOwner;
  captureFaction: RegionOwner;
  captureProgress: number;
}

export interface Region {
  id: number;
  name: string;
  biome: BiomeId;
  center: Vec2;
  vertices: Vec2[];
  neighbors: number[];
  yields: Record<"biomass" | "ore" | "water" | "energy", number>;
  owner: RegionOwner;
  captureFaction: RegionOwner;
  captureProgress: number;
  anchors: RegionAnchor[];
  workers: Record<FactionId, number>;
  discovered: boolean;
  visible: boolean;
  startCandidate: boolean;
  elevation: number;
}

export interface ResourceStock {
  biomass: number;
  ore: number;
  water: number;
  energyProduced: number;
  energyUsed: number;
  research: number;
  workers: number;
}

export interface Building {
  id: number;
  faction: FactionId;
  type: BuildingType;
  position: Vec2;
  regionId: number;
  hp: number;
  maxHp: number;
  construction: number;
  level: number;
  upgradeProgress: number;
  upgrading: boolean;
  active: boolean;
  powered: boolean;
  orientation: number;
  queue: UnitType[];
  boatQueue: BoatType[];
  productionProgress: number;
  boatProductionProgress: number;
  cooldown: number;
}

export type UnitOrder =
  | { type: "idle" }
  | { type: "move"; target: Vec2 }
  | { type: "attackMove"; target: Vec2 }
  | { type: "attack"; targetId: number; targetKind: "unit" | "building" }
  | { type: "patrol"; target: Vec2; origin: Vec2 };

export interface Unit {
  id: number;
  faction: FactionId;
  type: UnitType;
  squadId: number;
  position: Vec2;
  velocity: Vec2;
  hp: number;
  maxHp: number;
  cooldown: number;
  order: UnitOrder;
  visible: boolean;
  embarkedIn: number | null;
  kills: number;
}

export interface Boat {
  id: number;
  faction: FactionId;
  type: BoatType;
  position: Vec2;
  velocity: Vec2;
  hp: number;
  maxHp: number;
  capacity: number;
  passengerIds: number[];
  portId: number;
  target: Vec2 | null;
  state: "moored" | "sailing";
}

export interface TradeShip {
  id: number;
  faction: FactionId;
  originPortId: number;
  destinationPortId: number;
  position: Vec2;
  velocity: Vec2;
  reward: number;
}

export interface CargoPacket {
  id: number;
  faction: FactionId;
  resource: ResourceType;
  amount: number;
  path: Vec2[];
  segment: number;
  progress: number;
  position: Vec2;
}

export interface Projectile {
  id: number;
  faction: FactionId;
  from: Vec2;
  position: Vec2;
  target: Vec2;
  targetId: number;
  targetKind: "unit" | "building";
  damage: number;
  speed: number;
  color: string;
}

export interface MutationChoice {
  id: MutationId;
  name: string;
  description: string;
  drawback: string;
}

export interface MatchStats {
  clonesProduced: number;
  clonesLost: number;
  enemiesDestroyed: number;
  buildingsBuilt: number;
  territoryPeak: number;
  cargoDelivered: number;
  portTradesCompleted: number;
}

export interface Notification {
  id: number;
  tone: "info" | "warning" | "success";
  text: string;
  tick: number;
}

export interface GameSnapshot {
  seed: number;
  mapPreset: MapPreset;
  aiCount: number;
  tick: number;
  elapsedSeconds: number;
  phase: GamePhase;
  paused: boolean;
  shieldSeconds: number;
  regions: Region[];
  buildings: Building[];
  units: Unit[];
  boats: Boat[];
  tradeShips: TradeShip[];
  cargo: CargoPacket[];
  projectiles: Projectile[];
  resources: Record<FactionId, ResourceStock>;
  mutations: Record<FactionId, MutationId[]>;
  mutationChoices: MutationChoice[];
  stats: MatchStats;
  notifications: Notification[];
  winner: FactionId | null;
}

export type PlayerCommand =
  | { type: "deploy"; regionId: number }
  | { type: "placeBuilding"; buildingType: BuildingType; position: Vec2 }
  | { type: "queueClone"; buildingId: number; unitType: UnitType }
  | { type: "assignWorker"; regionId: number; amount: 1 | -1 }
  | { type: "upgradeBuilding"; buildingId: number }
  | { type: "queueBoat"; buildingId: number; boatType: BoatType }
  | { type: "boardBoat"; boatId: number; unitIds: number[] }
  | { type: "setBoatOrder"; boatId: number; target: Vec2 }
  | { type: "setOrder"; unitIds: number[]; order: UnitOrder }
  | { type: "chooseMutation"; mutationId: MutationId }
  | { type: "repair"; buildingId: number }
  | { type: "sell"; buildingId: number };

export interface WorkerInitMessage {
  type: "init";
  seed: number;
  config?: MatchConfig;
}

export type WorkerInboundMessage =
  | WorkerInitMessage
  | { type: "command"; command: PlayerCommand }
  | { type: "pause"; paused: boolean }
  | { type: "restart"; seed: number };

export type WorkerOutboundMessage =
  | { type: "snapshot"; snapshot: GameSnapshot }
  | { type: "error"; message: string };
