import { describe, expect, it } from "vitest";
import { TICK_RATE, UNITS, VAT_LEVEL_TWO } from "./config";
import { GameSimulation } from "./simulation";
import type { Boat, Building, GameSnapshot, Region } from "./types";

function deploy(simulation: GameSimulation): number {
  const region = simulation.regions.find((candidate) => candidate.startCandidate);
  if (!region) throw new Error("No start region generated");
  expect(simulation.applyPlayerCommand({ type: "deploy", regionId: region.id })).toBe(true);
  return region.id;
}

function deterministicProjection(snapshot: GameSnapshot) {
  return {
    tick: snapshot.tick,
    phase: snapshot.phase,
    resources: snapshot.resources,
    regions: snapshot.regions.map(({ id, owner, captureProgress }) => ({ id, owner, captureProgress })),
    buildings: snapshot.buildings,
    units: snapshot.units,
    cargo: snapshot.cargo,
    boats: snapshot.boats,
    mutations: snapshot.mutations,
  };
}

function landReachable(regions: Region[], fromId: number, targetId: number): boolean {
  const seen = new Set<number>([fromId]);
  const queue = [fromId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const region = regions.find((candidate) => candidate.id === queue[cursor]);
    if (!region) continue;
    for (const id of region.neighbors) {
      if (seen.has(id) || regions.find((candidate) => candidate.id === id)?.biome === "water") continue;
      if (id === targetId) return true;
      seen.add(id);
      queue.push(id);
    }
  }
  return false;
}

function activePort(id: number, region: Region): Building {
  return {
    id, faction: "player", type: "port", position: { ...region.center }, regionId: region.id,
    hp: 720, maxHp: 720, construction: 1, level: 1, upgradeProgress: 0, upgrading: false, active: true, powered: true, orientation: 0,
    queue: [], boatQueue: [], productionProgress: 0, boatProductionProgress: 0, cooldown: 0,
  };
}

function activeCore(id: number, region: Region): Building {
  return {
    id, faction: "player", type: "core", position: { ...region.center }, regionId: region.id,
    hp: 2600, maxHp: 2600, construction: 1, level: 1, upgradeProgress: 0, upgrading: false, active: true, powered: true, orientation: 0,
    queue: [], boatQueue: [], productionProgress: 0, boatProductionProgress: 0, cooldown: 0,
  };
}

describe("GameSimulation", () => {
  it("deploys an unbuilt player colony with enough resources to establish it", () => {
    const simulation = new GameSimulation(123456);
    const regionId = deploy(simulation);

    expect(simulation.phase).toBe("playing");
    expect(simulation.regions.find((region) => region.id === regionId)?.owner).toBe("player");
    expect(simulation.buildings.filter((building) => building.faction === "player")).toHaveLength(0);
    expect(simulation.buildings.filter((building) => building.faction === "enemy")).toHaveLength(4);
    expect(simulation.units.filter((unit) => unit.faction === "player")).toHaveLength(0);
    expect(simulation.regions.find((candidate) => candidate.id === regionId)?.workers.player).toBe(2);
    expect(simulation.resources.player).toMatchObject({ biomass: 180, ore: 220, water: 0 });

    const region = simulation.regions.find((candidate) => candidate.id === regionId)!;
    expect(simulation.applyPlayerCommand({ type: "placeBuilding", buildingType: "core", position: region.center })).toBe(true);
    expect(simulation.buildings.filter((building) => building.faction === "player" && building.type === "core")).toHaveLength(1);
    expect(simulation.applyPlayerCommand({ type: "placeBuilding", buildingType: "core", position: { x: region.center.x + 10, z: region.center.z } })).toBe(false);

    for (let index = 0; index < TICK_RATE * 4; index += 1) simulation.tick();
    expect(simulation.resources.player.energyProduced).toBeGreaterThan(0);
    expect(simulation.resources.player.biomass).toBeGreaterThan(180);
    expect(simulation.resources.player.ore).toBeGreaterThan(220);
  });

  it("spawns the configured number of rival colonies", () => {
    const simulation = new GameSimulation(123457, { mapPreset: "frontier", aiCount: 3 });
    deploy(simulation);
    expect(simulation.getSnapshot().aiCount).toBe(3);
    expect(simulation.buildings.filter((building) => building.faction === "enemy" && building.type === "core")).toHaveLength(3);
  });

  it("automatically turns ports toward their adjacent water channel", () => {
    const simulation = new GameSimulation(123459, { mapPreset: "frontier", aiCount: 1 });
    const shore = simulation.regions.find((region) => region.biome !== "water" && region.neighbors.some((id) =>
      simulation.regions.find((candidate) => candidate.id === id)?.biome === "water",
    ))!;
    const port = (simulation as unknown as {
      addBuilding: (faction: "player", type: "port", position: { x: number; z: number }, regionId: number, complete: boolean) => Building;
    }).addBuilding("player", "port", shore.center, shore.id, true);
    const water = simulation.regions
      .filter((region) => shore.neighbors.includes(region.id) && region.biome === "water")
      .sort((first, second) => Math.hypot(port.position.x - first.center.x, port.position.z - first.center.z) - Math.hypot(port.position.x - second.center.x, port.position.z - second.center.z))[0]!;

    expect(port.orientation).toBeCloseTo(Math.atan2(port.position.x - water.center.x, port.position.z - water.center.z));
  });

  it("collapses only the destroyed rival colony when several cores are active", () => {
    const simulation = new GameSimulation(123458, { mapPreset: "frontier", aiCount: 2 });
    deploy(simulation);
    simulation.tickCount = TICK_RATE * 76;
    const targetCore = simulation.buildings.find((building) => building.faction === "enemy" && building.type === "core")!;
    const targetRegionId = targetCore.regionId;
    const otherCore = simulation.buildings.find((building) =>
      building.faction === "enemy" && building.type === "core" && building.id !== targetCore.id,
    )!;
    targetCore.hp = 1;
    (simulation as unknown as { damageEntity: (target: Building, kind: "building", amount: number, attacker: "player") => void })
      .damageEntity(targetCore, "building", 10, "player");
    simulation.tick();

    expect(simulation.phase).toBe("playing");
    expect(simulation.buildings.some((building) => building.faction === "enemy" && building.regionId === targetRegionId)).toBe(false);
    expect(simulation.buildings.some((building) => building.id === otherCore.id)).toBe(true);
  });

  it("gives every configured rival colony its own construction cycle", () => {
    const simulation = new GameSimulation(654321, { mapPreset: "frontier", aiCount: 2 });
    deploy(simulation);
    for (let index = 0; index < TICK_RATE * 42; index += 1) simulation.tick();
    const coreRegions = simulation.buildings.filter((building) => building.faction === "enemy" && building.type === "core").map((building) => building.regionId);
    expect(coreRegions.every((regionId) => simulation.buildings.some((building) =>
      building.faction === "enemy" && building.regionId === regionId && building.type === "extractor",
    ))).toBe(true);
  });

  it("replays identical commands tick for tick", () => {
    const first = new GameSimulation(0xabcdef01);
    const second = new GameSimulation(0xabcdef01);
    const regionId = first.regions.find((region) => region.startCandidate)!.id;
    expect(second.regions.find((region) => region.id === regionId)?.startCandidate).toBe(true);
    first.applyPlayerCommand({ type: "deploy", regionId });
    second.applyPlayerCommand({ type: "deploy", regionId });
    const position = first.regions.find((candidate) => candidate.id === regionId)!.center;
    first.applyPlayerCommand({ type: "placeBuilding", buildingType: "core", position });
    second.applyPlayerCommand({ type: "placeBuilding", buildingType: "core", position });

    for (let index = 0; index < TICK_RATE * 12; index += 1) {
      first.tick();
      second.tick();
    }
    expect(deterministicProjection(first.getSnapshot())).toEqual(deterministicProjection(second.getSnapshot()));
  });

  it("unlocks mutations after evolving a Cuve ADN to level 2", () => {
    const simulation = new GameSimulation(5566);
    const regionId = deploy(simulation);
    const region = simulation.regions.find((candidate) => candidate.id === regionId)!;
    const addBuilding = simulation as unknown as {
      addBuilding: (faction: "player", type: "core" | "vat", position: { x: number; z: number }, regionId: number, complete: boolean) => Building;
    };
    addBuilding.addBuilding("player", "core", { x: region.center.x - 7.5, z: region.center.z }, region.id, true);
    const vat = addBuilding.addBuilding("player", "vat", region.center, region.id, true);
    expect(simulation.applyPlayerCommand({ type: "upgradeBuilding", buildingId: vat.id })).toBe(true);
    for (let index = 0; index < TICK_RATE * 12 && vat.level < 2; index += 1) simulation.tick();
    expect(vat.level).toBe(2);
    vat.queue.push("scout");
    simulation.tick();
    expect(vat.productionProgress).toBeCloseTo(TICK_RATE ** -1 * VAT_LEVEL_TWO.productionMultiplier / UNITS.scout.productionTime);
    simulation.resources.player.research = 50;
    simulation.tick();
    expect(simulation.phase).toBe("mutation");
    const choice = simulation.getSnapshot().mutationChoices[0];
    expect(choice).toBeDefined();
    expect(simulation.applyPlayerCommand({ type: "chooseMutation", mutationId: choice!.id })).toBe(true);
    expect(simulation.phase).toBe("playing");
    expect(simulation.mutations.player).toContain(choice!.id);
  });

  it("requires a majority of regional nodes and a relay to conquer a neutral region", () => {
    const simulation = new GameSimulation(9988);
    const startId = deploy(simulation);
    const start = simulation.regions.find((region) => region.id === startId)!;
    const target = simulation.regions.find((region) => start.neighbors.includes(region.id) && region.owner === "neutral")!;
    const spawnUnit = simulation as unknown as {
      spawnUnit: (faction: "player", type: "scout", position: { x: number; z: number }) => void;
    };
    const nodeCountRequired = Math.ceil(target.anchors.length / 2);
    for (let nodeIndex = 0; nodeIndex < nodeCountRequired; nodeIndex += 1) {
      for (let unitIndex = 0; unitIndex < 4; unitIndex += 1) spawnUnit.spawnUnit("player", "scout", target.anchors[nodeIndex]!.position);
      for (let index = 0; index < TICK_RATE * 12 && target.anchors[nodeIndex]!.owner !== "player"; index += 1) simulation.tick();
    }

    expect(target.captureFaction).toBe("player");
    expect(target.owner).toBe("neutral");
    const addBuilding = simulation as unknown as {
      addBuilding: (faction: "player", type: "relay", position: { x: number; z: number }, regionId: number, complete: boolean) => Building;
    };
    addBuilding.addBuilding("player", "relay", target.center, target.id, true);
    simulation.tick();
    expect(target.owner).toBe("player");
  });

  it("keeps workers off the map and completes construction instantly with four local workers", () => {
    const simulation = new GameSimulation(0x51515151);
    const regionId = deploy(simulation);
    const region = simulation.regions.find((candidate) => candidate.id === regionId)!;
    expect(region.workers.player).toBe(2);
    expect(simulation.units.some((unit) => unit.type === "worker")).toBe(false);

    simulation.resources.player.workers = 2;
    expect(simulation.applyPlayerCommand({ type: "assignWorker", regionId, amount: 1 })).toBe(true);
    expect(simulation.applyPlayerCommand({ type: "assignWorker", regionId, amount: 1 })).toBe(true);
    expect(region.workers.player).toBe(4);
    expect(simulation.applyPlayerCommand({ type: "placeBuilding", buildingType: "core", position: region.center })).toBe(true);
    expect(simulation.buildings.find((building) => building.faction === "player" && building.type === "core")?.construction).toBe(1);
  });

  it("delivers extracted material only after a conveyor route is built", () => {
    const simulation = new GameSimulation(0x10203040);
    const regionId = deploy(simulation);
    simulation.resources.player.biomass = 500;
    simulation.resources.player.ore = 500;
    const region = simulation.regions.find((candidate) => candidate.id === regionId)!;
    const addBuilding = simulation as unknown as {
      addBuilding: (faction: "player", type: "core" | "storage", position: { x: number; z: number }, regionId: number, complete: boolean) => Building;
    };
    addBuilding.addBuilding("player", "core", { x: region.center.x - 7.5, z: region.center.z }, region.id, true);
    const storage = addBuilding.addBuilding("player", "storage", { x: region.center.x + 7.5, z: region.center.z }, region.id, true);
    let placed = false;
    for (let dx = -12.5; dx <= 12.5 && !placed; dx += 2.5) {
      for (let dz = -12.5; dz <= 12.5 && !placed; dz += 2.5) {
        if (Math.hypot(dx, dz) < 7 || Math.hypot(dx, dz) > 11) continue;
        placed = simulation.applyPlayerCommand({
          type: "placeBuilding",
          buildingType: "extractor",
          position: { x: storage.position.x + dx, z: storage.position.z + dz },
        });
      }
    }
    expect(placed).toBe(true);
    const extractor = simulation.buildings.find((building) => building.faction === "player" && building.type === "extractor")!;
    const gap = Math.hypot(storage.position.x - extractor.position.x, storage.position.z - extractor.position.z);
    const steps = Math.max(2, Math.round(gap / 2.5));
    let conveyorsPlaced = 0;
    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      if (simulation.applyPlayerCommand({
        type: "placeBuilding",
        buildingType: "conveyor",
        position: {
          x: extractor.position.x + (storage.position.x - extractor.position.x) * ratio,
          z: extractor.position.z + (storage.position.z - extractor.position.z) * ratio,
        },
      })) conveyorsPlaced += 1;
    }
    expect(conveyorsPlaced).toBeGreaterThan(0);
    for (let index = 0; index < TICK_RATE * 35; index += 1) simulation.tick();
    expect(extractor.construction).toBe(1);
    expect(extractor.active).toBe(true);
    expect(simulation.stats.cargoDelivered).toBeGreaterThan(0);
  });

  it("embarks a squad, crosses the canal, then disembarks on another shore", () => {
    const simulation = new GameSimulation(0x1a2b3c4d);
    deploy(simulation);
    const origin = simulation.regions.find((region) => region.owner === "player")!;
    const spawnUnit = simulation as unknown as {
      spawnUnit: (faction: "player", type: "scout", position: { x: number; z: number }) => void;
    };
    spawnUnit.spawnUnit("player", "scout", origin.center);
    spawnUnit.spawnUnit("player", "scout", origin.center);
    const passengers = simulation.units.filter((unit) => unit.faction === "player").slice(0, 2);
    const target = simulation.regions.find((region) => region.biome !== "water" && region.id !== origin.id && Math.hypot(region.center.x - origin.center.x, region.center.z - origin.center.z) > 42)!;
    const boat: Boat = {
      id: 9001, faction: "player", type: "skiff", position: { ...origin.center }, velocity: { x: 0, z: 0 },
      hp: 180, maxHp: 180, capacity: 4, passengerIds: [], portId: 0, target: null, state: "moored",
    };
    simulation.boats.push(boat);
    for (const unit of passengers) unit.position = { ...origin.center };

    expect(simulation.applyPlayerCommand({ type: "boardBoat", boatId: boat.id, unitIds: passengers.map((unit) => unit.id) })).toBe(true);
    expect(boat.passengerIds).toHaveLength(2);
    expect(simulation.applyPlayerCommand({ type: "setBoatOrder", boatId: boat.id, target: { ...target.center } })).toBe(true);
    for (let index = 0; index < TICK_RATE * 25 && boat.state === "sailing"; index += 1) simulation.tick();

    expect(boat.state).toBe("moored");
    expect(boat.passengerIds).toHaveLength(0);
    expect(passengers.every((unit) => unit.embarkedIn === null)).toBe(true);
    expect(passengers.every((unit) => Math.hypot(unit.position.x - target.center.x, unit.position.z - target.center.z) < 4)).toBe(true);
  });

  it("automatically exchanges materials between ports on separate lands", () => {
    const simulation = new GameSimulation(0x5eac0de);
    deploy(simulation);
    const origin = simulation.regions.find((region) => region.owner === "player")!;
    const destination = simulation.regions.find((region) =>
      region.biome !== "water" && region.id !== origin.id && !landReachable(simulation.regions, origin.id, region.id),
    )!;
    simulation.buildings.push(activeCore(8100, origin), activePort(8101, origin), activeCore(8102, destination), activePort(8103, destination));
    const initialOre = simulation.resources.player.ore;
    for (let index = 0; index < TICK_RATE * 40; index += 1) simulation.tick();

    expect(simulation.resources.player.ore).toBeGreaterThan(initialOre + 3);
    expect(simulation.stats.portTradesCompleted).toBeGreaterThan(0);
  });

  it("lets the AI produce, build and leave its initial territory", () => {
    const simulation = new GameSimulation(0xcafef00d);
    deploy(simulation);
    for (let index = 0; index < TICK_RATE * 220 && simulation.phase === "playing"; index += 1) simulation.tick();
    expect(simulation.units.filter((unit) => unit.faction === "enemy").length).toBeGreaterThanOrEqual(4);
    expect(simulation.buildings.filter((building) => building.faction === "enemy").length).toBeGreaterThan(4);
    expect(simulation.regions.filter((region) => region.owner === "enemy").length).toBeGreaterThan(1);
  });
});
