import type {
  BiomeId,
  BuildingType,
  BoatType,
  MutationChoice,
  MutationId,
  ResourceType,
  UnitType,
} from "./types";

export const TICK_RATE = 20;
export const TICK_SECONDS = 1 / TICK_RATE;
export const MAP_HALF_SIZE = 50;
export const BUILD_GRID = 2.5;
export const CORE_SHIELD_SECONDS = 75;
export const MAX_UNITS_PER_FACTION = 200;
export const PLAYER_STARTING_RESOURCES = { biomass: 180, ore: 220, water: 0 };

export interface BiomeDefinition {
  name: string;
  code: string;
  color: string;
  darkColor: string;
  description: string;
  yields: Record<"biomass" | "ore" | "water" | "energy", number>;
}

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  forest: {
    name: "Forêt mycélienne",
    code: "MYC",
    color: "#667c45",
    darkColor: "#293321",
    description: "Biomasse abondante, minerai rare.",
    yields: { biomass: 1.75, ore: 0.55, water: 0, energy: 0.75 },
  },
  quarry: {
    name: "Carrière ferrique",
    code: "FER",
    color: "#8a6550",
    darkColor: "#382a23",
    description: "Minerai dense, faible croissance organique.",
    yields: { biomass: 0.55, ore: 1.8, water: 0, energy: 0.72 },
  },
  geothermal: {
    name: "Faille thermique",
    code: "THR",
    color: "#9a7650",
    darkColor: "#3a2c20",
    description: "Production énergétique supérieure.",
    yields: { biomass: 0.72, ore: 0.82, water: 0, energy: 1.85 },
  },
  plains: {
    name: "Plaine stérile",
    code: "PLN",
    color: "#858267",
    darkColor: "#333329",
    description: "Terrain équilibré et facile à défendre.",
    yields: { biomass: 1.05, ore: 1.05, water: 0, energy: 1.05 },
  },
  water: {
    name: "Canal nutritif",
    code: "AQU",
    color: "#315f72",
    darkColor: "#102c37",
    description: "Eau industrielle. Elle sépare les terres et nourrit les ports synaptiques.",
    yields: { biomass: 0, ore: 0, water: 2.1, energy: 0 },
  },
};

export interface BuildingDefinition {
  name: string;
  shortName: string;
  description: string;
  cost: Partial<Record<ResourceType, number>>;
  hp: number;
  buildTime: number;
  size: number;
  energyUse: number;
  energyProduction: number;
  vision: number;
  buildable: boolean;
  shortcut?: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  core: {
    name: "Noyau de réplication",
    shortName: "NOYAU",
    description: "Le cœur de la colonie. Ses racines cultivent lentement biomasse et minerai ; sa destruction fait s'effondrer la colonie.",
    cost: {}, hp: 2600, buildTime: 4, size: 5, energyUse: 0,
    energyProduction: 12, vision: 19, buildable: true, shortcut: "N",
  },
  generator: {
    name: "Réacteur organique", shortName: "ÉNERGIE",
    description: "Alimente les machines reliées au réseau territorial.",
    cost: { biomass: 18, ore: 28 }, hp: 520, buildTime: 6, size: 3.6,
    energyUse: 0, energyProduction: 36, vision: 9, buildable: true, shortcut: "G",
  },
  storage: {
    name: "Réservoir synaptique", shortName: "STOCK",
    description: "Reçoit les capsules transportées par convoyeur.",
    cost: { biomass: 8, ore: 22 }, hp: 420, buildTime: 5, size: 3.5,
    energyUse: 1, energyProduction: 0, vision: 8, buildable: true, shortcut: "X",
  },
  vat: {
    name: "Cuve de clonage", shortName: "CUVE",
    description: "Produit les escouades à partir de biomasse et de minerai.",
    cost: { biomass: 24, ore: 42 }, hp: 650, buildTime: 9, size: 4.25,
    energyUse: 10, energyProduction: 0, vision: 9, buildable: true, shortcut: "V",
  },
  bioExtractor: {
    name: "Moissonneuse cellulaire", shortName: "BIO",
    description: "Conditionne la biomasse locale en capsules.",
    cost: { biomass: 5, ore: 24 }, hp: 360, buildTime: 6, size: 3.3,
    energyUse: 4, energyProduction: 0, vision: 7, buildable: true, shortcut: "B",
  },
  oreExtractor: {
    name: "Foreuse ostéale", shortName: "MINERAI",
    description: "Extrait le minerai de la région.",
    cost: { biomass: 14, ore: 18 }, hp: 390, buildTime: 7, size: 3.3,
    energyUse: 5, energyProduction: 0, vision: 7, buildable: true, shortcut: "O",
  },
  waterExtractor: {
    name: "Pompe osmotique", shortName: "EAU",
    description: "Pompe l’eau d’un canal adjacent pour alimenter les coques et les machines navales.",
    cost: { biomass: 10, ore: 18 }, hp: 340, buildTime: 6.5, size: 3.25,
    energyUse: 4, energyProduction: 0, vision: 7, buildable: true, shortcut: "U",
  },
  conveyor: {
    name: "Convoyeur vasculaire", shortName: "LIGNE",
    description: "Transporte physiquement les capsules vers un stockage.",
    cost: { ore: 1 }, hp: 90, buildTime: 0.45, size: 2.1,
    energyUse: 0.08, energyProduction: 0, vision: 3, buildable: true, shortcut: "C",
  },
  relay: {
    name: "Relais territorial", shortName: "RELAIS",
    description: "Stabilise une région conquise et étend le réseau d'énergie.",
    cost: { biomass: 18, ore: 34 }, hp: 720, buildTime: 10, size: 3.8,
    energyUse: 4, energyProduction: 0, vision: 15, buildable: true, shortcut: "R",
  },
  turret: {
    name: "Tourelle mitotique", shortName: "DÉFENSE",
    description: "Défense automatique à moyenne portée.",
    cost: { biomass: 18, ore: 48 }, hp: 580, buildTime: 8, size: 3,
    energyUse: 7, energyProduction: 0, vision: 17, buildable: true, shortcut: "T",
  },
  lab: {
    name: "Laboratoire ADN", shortName: "MUTATION",
    description: "Accélère la recherche et déclenche des mutations adaptatives.",
    cost: { biomass: 48, ore: 38 }, hp: 480, buildTime: 9, size: 3.8,
    energyUse: 8, energyProduction: 0, vision: 8, buildable: true, shortcut: "L",
  },
  wall: {
    name: "Paroi calcifiée", shortName: "MUR",
    description: "Obstacle dense qui protège les lignes vitales.",
    cost: { ore: 5 }, hp: 800, buildTime: 2, size: 2.25,
    energyUse: 0, energyProduction: 0, vision: 2, buildable: true, shortcut: "F",
  },
  port: {
    name: "Port synaptique", shortName: "PORT",
    description: "Construit des transports amphibies et envoie automatiquement des navires d’échange entre les terres.",
    cost: { biomass: 32, ore: 48, water: 20 }, hp: 720, buildTime: 11, size: 4.5,
    energyUse: 9, energyProduction: 0, vision: 12, buildable: true, shortcut: "J",
  },
};

export interface BoatDefinition {
  name: string;
  code: string;
  description: string;
  cost: Partial<Record<ResourceType, number>>;
  productionTime: number;
  hp: number;
  speed: number;
  capacity: number;
}

export const BOATS: Record<BoatType, BoatDefinition> = {
  skiff: {
    name: "Esciffe de transit", code: "SKI", description: "Rapide et léger. Idéal pour les éclaireurs.",
    cost: { biomass: 10, ore: 12, water: 8 }, productionTime: 6, hp: 180, speed: 10.5, capacity: 4,
  },
  landingCraft: {
    name: "Péniche d’assaut", code: "PEN", description: "Transport polyvalent pour un escadron complet.",
    cost: { biomass: 22, ore: 28, water: 16 }, productionTime: 10, hp: 390, speed: 7.6, capacity: 10,
  },
  armoredBarge: {
    name: "Barge blindée", code: "BAR", description: "Lente, résistante et capable de projeter une force lourde.",
    cost: { biomass: 38, ore: 58, water: 25 }, productionTime: 16, hp: 760, speed: 5.2, capacity: 18,
  },
};

export interface UnitDefinition {
  name: string;
  code: string;
  description: string;
  biomassCost: number;
  oreCost: number;
  productionTime: number;
  hp: number;
  speed: number;
  damage: number;
  attackRange: number;
  aggroRange: number;
  attackCooldown: number;
  vision: number;
  capture: number;
  structureMultiplier: number;
}

export const UNITS: Record<UnitType, UnitDefinition> = {
  worker: {
    name: "Ouvrier", code: "OVR", description: "Construit, répare et maintient la colonie.",
    biomassCost: 8, oreCost: 0, productionTime: 3.5, hp: 72, speed: 5.5,
    damage: 5, attackRange: 1.5, aggroRange: 6, attackCooldown: 1.2,
    vision: 12, capture: 0.55, structureMultiplier: 0.5,
  },
  scout: {
    name: "Éclaireur", code: "ECL", description: "Rapide, fragile et excellent pour capturer.",
    biomassCost: 10, oreCost: 3, productionTime: 4, hp: 58, speed: 8.3,
    damage: 7, attackRange: 6.5, aggroRange: 10, attackCooldown: 0.9,
    vision: 20, capture: 1.5, structureMultiplier: 0.45,
  },
  assault: {
    name: "Assaut", code: "AST", description: "Clone de combat polyvalent à distance.",
    biomassCost: 14, oreCost: 7, productionTime: 5.5, hp: 125, speed: 5.8,
    damage: 14, attackRange: 8, aggroRange: 12, attackCooldown: 0.8,
    vision: 15, capture: 1, structureMultiplier: 0.8,
  },
  breaker: {
    name: "Briseur", code: "BRS", description: "Lent et blindé, conçu pour éventrer les structures.",
    biomassCost: 24, oreCost: 16, productionTime: 9, hp: 310, speed: 3.5,
    damage: 32, attackRange: 2, aggroRange: 9, attackCooldown: 1.35,
    vision: 11, capture: 0.7, structureMultiplier: 2.3,
  },
};

export const MUTATIONS: Record<MutationId, MutationChoice> = {
  rapidGestation: {
    id: "rapidGestation", name: "GESTATION FLASH",
    description: "Les cuves produisent 40 % plus vite.", drawback: "Les clones ont 10 % de points de vie en moins.",
  },
  reinforcedTissue: {
    id: "reinforcedTissue", name: "TISSU RENFORCÉ",
    description: "Les clones gagnent 28 % de points de vie.", drawback: "Leur vitesse baisse de 10 %.",
  },
  leanMetabolism: {
    id: "leanMetabolism", name: "MÉTABOLISME SEC",
    description: "Le coût en biomasse des clones baisse de 25 %.", drawback: "Les cuves consomment 4 énergie supplémentaires.",
  },
  hyperConveyors: {
    id: "hyperConveyors", name: "SANG HYPERVELOCE",
    description: "Les capsules circulent 65 % plus vite.", drawback: "Chaque convoyeur consomme deux fois plus d'énergie.",
  },
  corpseRecycling: {
    id: "corpseRecycling", name: "BOUCLE NÉCROTIQUE",
    description: "Chaque ennemi détruit restitue 4 biomasse.", drawback: "La vision de toutes les unités baisse de 12 %.",
  },
  collectiveSight: {
    id: "collectiveSight", name: "RÉTINE COLLECTIVE",
    description: "Vision et portée d'alerte augmentées de 30 %.", drawback: "Les dégâts baissent de 8 %.",
  },
};

export const MUTATION_THRESHOLDS = [45, 120, 230];

export const FACTION_COLORS = {
  player: "#c8ff45",
  enemy: "#ff5b49",
} as const;
