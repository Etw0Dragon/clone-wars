import { BIOMES, MAP_HALF_SIZE } from "./config";
import { SeededRandom } from "./random";
import type { BiomeId, MapPreset, Region, RegionAnchor, Vec2 } from "./types";

interface Site extends Vec2 {
  id: number;
  row: number;
  column: number;
}

const REGION_NAMES = [
  "Cendre", "Mue", "Racine", "Vertèbre", "Sillon", "Matrice", "Nerf",
  "Moelle", "Spore", "Faille", "Lobe", "Écorce", "Nodule", "Sève",
  "Fibre", "Crête", "Synapse", "Cicatrice", "Germe", "Veine", "Pore",
  "Canal", "Membrane", "Strate", "Chambre",
];

function clipPolygon(
  polygon: Vec2[],
  normalX: number,
  normalZ: number,
  constant: number,
): Vec2[] {
  const output: Vec2[] = [];
  if (polygon.length === 0) return output;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const currentDistance = current.x * normalX + current.z * normalZ - constant;
    const previousDistance = previous.x * normalX + previous.z * normalZ - constant;
    const currentInside = currentDistance <= 0.0001;
    const previousInside = previousDistance <= 0.0001;

    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      const ratio = Math.abs(denominator) < 1e-8 ? 0 : previousDistance / denominator;
      output.push({
        x: previous.x + (current.x - previous.x) * ratio,
        z: previous.z + (current.z - previous.z) * ratio,
      });
    }
    if (currentInside) output.push(current);
  }
  return output;
}

function createCell(site: Site, sites: Site[]): Vec2[] {
  let polygon: Vec2[] = [
    { x: -MAP_HALF_SIZE, z: -MAP_HALF_SIZE },
    { x: MAP_HALF_SIZE, z: -MAP_HALF_SIZE },
    { x: MAP_HALF_SIZE, z: MAP_HALF_SIZE },
    { x: -MAP_HALF_SIZE, z: MAP_HALF_SIZE },
  ];

  for (const other of sites) {
    if (other.id === site.id) continue;
    const normalX = other.x - site.x;
    const normalZ = other.z - site.z;
    const midpointX = (site.x + other.x) / 2;
    const midpointZ = (site.z + other.z) / 2;
    polygon = clipPolygon(
      polygon,
      normalX,
      normalZ,
      midpointX * normalX + midpointZ * normalZ,
    );
    if (polygon.length === 0) break;
  }
  return polygon;
}

function polygonCentroid(vertices: Vec2[]): Vec2 {
  let area = 0;
  let x = 0;
  let z = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const cross = current.x * next.z - next.x * current.z;
    area += cross;
    x += (current.x + next.x) * cross;
    z += (current.z + next.z) * cross;
  }
  if (Math.abs(area) < 1e-6) return vertices[0] ?? { x: 0, z: 0 };
  return { x: x / (3 * area), z: z / (3 * area) };
}

function shareEdge(first: Vec2[], second: Vec2[]): boolean {
  let matches = 0;
  for (const a of first) {
    for (const b of second) {
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.08) {
        matches += 1;
        if (matches >= 2) return true;
      }
    }
  }
  return false;
}

export function pointInPolygon(point: Vec2, vertices: Vec2[]): boolean {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const a = vertices[index]!;
    const b = vertices[previous]!;
    const intersects =
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z || 1e-9) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function findRegionAt(regions: Region[], point: Vec2): Region | undefined {
  return regions.find((region) => pointInPolygon(point, region.vertices));
}

function createAnchors(center: Vec2, vertices: Vec2[], random: SeededRandom, regionId: number): RegionAnchor[] {
  const anchors: RegionAnchor[] = [];
  const rotation = random.between(0, Math.PI * 2);
  for (let index = 0; index < 3; index += 1) {
    const angle = rotation + (index / 3) * Math.PI * 2;
    let radius = random.between(4.2, 5.7);
    let position = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
    while (!pointInPolygon(position, vertices) && radius > 1.5) {
      radius -= 0.65;
      position = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
    }
    anchors.push({ id: regionId * 10 + index, position, owner: "neutral", captureFaction: "neutral", captureProgress: 0 });
  }
  return anchors;
}

const GRID_SIZES: Record<MapPreset, number> = { compact: 4, standard: 5, frontier: 6 };

export function createMap(seed: number, preset: MapPreset = "standard"): Region[] {
  const random = new SeededRandom(seed ^ 0xabc123);
  const sites: Site[] = [];
  const gridSize = GRID_SIZES[preset];
  const cellSize = (MAP_HALF_SIZE * 2) / gridSize;

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const edgePadding = 2.5;
      const baseX = -MAP_HALF_SIZE + cellSize * (column + 0.5);
      const baseZ = -MAP_HALF_SIZE + cellSize * (row + 0.5);
      sites.push({
        id: row * gridSize + column,
        row,
        column,
        x: Math.max(-MAP_HALF_SIZE + edgePadding, Math.min(MAP_HALF_SIZE - edgePadding, baseX + random.between(-5.5, 5.5))),
        z: Math.max(-MAP_HALF_SIZE + edgePadding, Math.min(MAP_HALF_SIZE - edgePadding, baseZ + random.between(-5.5, 5.5))),
      });
    }
  }

  const guaranteedBiomes: BiomeId[] = ["forest", "quarry", "geothermal", "plains"];
  const biomePool: BiomeId[] = ["forest", "forest", "quarry", "quarry", "geothermal", "plains", "plains"];
  const cells = sites.map((site) => createCell(site, sites));
  const channelVertical = random.next() > 0.5;
  const channelIndex = random.int(1, gridSize - 2);
  const waterSiteIds = new Set<number>();
  for (let index = 0; index < gridSize; index += 1) {
    const row = channelVertical ? index : channelIndex;
    const column = channelVertical ? channelIndex : index;
    waterSiteIds.add(row * gridSize + column);
  }
  // A secondary inlet makes every seed feel different without breaking the land bridge logic.
  const inletAxis = random.int(0, gridSize - 1);
  const inletRow = channelVertical ? inletAxis : (channelIndex === 1 ? 0 : gridSize - 1);
  const inletColumn = channelVertical ? (channelIndex === 1 ? 0 : gridSize - 1) : inletAxis;
  waterSiteIds.add(inletRow * gridSize + inletColumn);
  const regions: Region[] = sites.map((site, index) => {
    const vertices = cells[index]!;
    const biome: BiomeId = waterSiteIds.has(site.id)
      ? "water"
      : index < guaranteedBiomes.length
      ? guaranteedBiomes[index]!
      : random.pick(biomePool);
    const definition = BIOMES[biome];
    const center = polygonCentroid(vertices);
    const distanceFromCenter = Math.hypot(center.x, center.z);
    return {
      id: site.id,
      name: `${REGION_NAMES[index] ?? "Secteur"} ${String(index + 1).padStart(2, "0")}`,
      biome,
      center,
      vertices,
      neighbors: [],
      yields: { ...definition.yields },
      owner: "neutral",
      captureFaction: "neutral",
      captureProgress: 0,
      anchors: biome === "water" ? [] : createAnchors(center, vertices, random, site.id),
      workers: { player: 0, enemy: 0 },
      discovered: false,
      visible: false,
      startCandidate: biome !== "water" && distanceFromCenter >= 14,
      elevation: biome === "water" ? 0 : Math.round((0.35 + random.between(0, 1.35) + Math.max(0, 1 - distanceFromCenter / MAP_HALF_SIZE) * 0.35) * 10) / 10,
    };
  });

  for (let first = 0; first < regions.length; first += 1) {
    for (let second = first + 1; second < regions.length; second += 1) {
      if (shareEdge(regions[first]!.vertices, regions[second]!.vertices)) {
        regions[first]!.neighbors.push(regions[second]!.id);
        regions[second]!.neighbors.push(regions[first]!.id);
      }
    }
  }

  if (regions.filter((region) => region.startCandidate).length < 6) {
    for (const region of regions) {
      if (region.biome !== "water" && Math.hypot(region.center.x, region.center.z) > 18) region.startCandidate = true;
    }
  }
  return regions;
}

export function chooseEnemyStart(regions: Region[], playerRegionId: number): number {
  const player = regions.find((region) => region.id === playerRegionId);
  if (!player) return regions.find((region) => region.startCandidate)?.id ?? 0;
  const candidates = regions.filter((region) => region.startCandidate && region.biome !== "water" && region.id !== playerRegionId);
  candidates.sort((first, second) => {
    const firstDistance = Math.hypot(first.center.x - player.center.x, first.center.z - player.center.z);
    const secondDistance = Math.hypot(second.center.x - player.center.x, second.center.z - player.center.z);
    const firstBalance = Math.abs(first.yields.biomass - player.yields.biomass) + Math.abs(first.yields.ore - player.yields.ore);
    const secondBalance = Math.abs(second.yields.biomass - player.yields.biomass) + Math.abs(second.yields.ore - player.yields.ore);
    return (secondDistance - secondBalance * 5) - (firstDistance - firstBalance * 5);
  });
  return candidates[0]?.id ?? regions.at(-1)?.id ?? 0;
}
