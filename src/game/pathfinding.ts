import { BUILD_GRID, MAP_HALF_SIZE } from "./config";
import type { Building, Vec2 } from "./types";

interface GridNode {
  x: number;
  z: number;
  key: string;
  g: number;
  f: number;
  parent: GridNode | null;
}

const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

function toGrid(value: number): number {
  return Math.round((value + MAP_HALF_SIZE) / BUILD_GRID);
}

function toWorld(value: number): number {
  return value * BUILD_GRID - MAP_HALF_SIZE;
}

function key(x: number, z: number): string {
  return `${x}:${z}`;
}

function isBlocked(x: number, z: number, buildings: Building[], ignoredBuildingId?: number): boolean {
  const worldX = toWorld(x);
  const worldZ = toWorld(z);
  for (const building of buildings) {
    if (building.id === ignoredBuildingId || building.construction < 0.25) continue;
    if (building.type === "conveyor" || building.type === "storage") continue;
    const radius = building.type === "wall" ? 1.5 : 2.1;
    if (Math.hypot(worldX - building.position.x, worldZ - building.position.z) < radius) return true;
  }
  return false;
}

export function findPath(
  start: Vec2,
  target: Vec2,
  buildings: Building[],
  ignoredBuildingId?: number,
): Vec2[] {
  const maxIndex = Math.round((MAP_HALF_SIZE * 2) / BUILD_GRID);
  const startX = Math.max(0, Math.min(maxIndex, toGrid(start.x)));
  const startZ = Math.max(0, Math.min(maxIndex, toGrid(start.z)));
  const targetX = Math.max(0, Math.min(maxIndex, toGrid(target.x)));
  const targetZ = Math.max(0, Math.min(maxIndex, toGrid(target.z)));
  const startNode: GridNode = {
    x: startX,
    z: startZ,
    key: key(startX, startZ),
    g: 0,
    f: Math.hypot(targetX - startX, targetZ - startZ),
    parent: null,
  };
  const open = new Map<string, GridNode>([[startNode.key, startNode]]);
  const closed = new Set<string>();

  while (open.size > 0) {
    let current: GridNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;
    open.delete(current.key);
    closed.add(current.key);

    if (current.x === targetX && current.z === targetZ) {
      const reversed: Vec2[] = [{ x: target.x, z: target.z }];
      let cursor: GridNode | null = current;
      while (cursor?.parent) {
        reversed.push({ x: toWorld(cursor.x), z: toWorld(cursor.z) });
        cursor = cursor.parent;
      }
      return reversed.reverse().filter((point, index, points) => {
        if (index === 0 || index === points.length - 1) return true;
        const previous = points[index - 1]!;
        const next = points[index + 1]!;
        const firstDx = Math.sign(point.x - previous.x);
        const firstDz = Math.sign(point.z - previous.z);
        const secondDx = Math.sign(next.x - point.x);
        const secondDz = Math.sign(next.z - point.z);
        return firstDx !== secondDx || firstDz !== secondDz;
      });
    }

    for (const [dx, dz] of DIRECTIONS) {
      const nextX = current.x + dx;
      const nextZ = current.z + dz;
      const nextKey = key(nextX, nextZ);
      if (
        nextX < 0 || nextZ < 0 || nextX > maxIndex || nextZ > maxIndex ||
        closed.has(nextKey) ||
        (isBlocked(nextX, nextZ, buildings, ignoredBuildingId) && !(nextX === targetX && nextZ === targetZ))
      ) continue;

      if (dx !== 0 && dz !== 0) {
        if (
          isBlocked(current.x + dx, current.z, buildings, ignoredBuildingId) ||
          isBlocked(current.x, current.z + dz, buildings, ignoredBuildingId)
        ) continue;
      }

      const movementCost = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1;
      const tentativeG = current.g + movementCost;
      const existing = open.get(nextKey);
      if (existing && tentativeG >= existing.g) continue;
      open.set(nextKey, {
        x: nextX,
        z: nextZ,
        key: nextKey,
        g: tentativeG,
        f: tentativeG + Math.hypot(targetX - nextX, targetZ - nextZ),
        parent: current,
      });
    }
  }
  return [{ x: target.x, z: target.z }];
}
