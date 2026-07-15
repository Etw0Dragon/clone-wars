import { FACTION_COLORS, MAP_HALF_SIZE } from "../game/config";
import type { GameSnapshot } from "../game/types";

interface MiniMapProps {
  snapshot: GameSnapshot;
}

function coordinate(value: number): number {
  return ((value + MAP_HALF_SIZE) / (MAP_HALF_SIZE * 2)) * 100;
}

export function MiniMap({ snapshot }: MiniMapProps) {
  return (
    <div className="minimap-shell">
      <div className="micro-label minimap-label">SIGNAL TERRITORIAL</div>
      <svg className="minimap" viewBox="0 0 100 100" role="img" aria-label="Mini-carte tactique">
        <rect width="100" height="100" fill="#111510" />
        {snapshot.regions.map((region) => {
          const points = region.vertices.map((vertex) => `${coordinate(vertex.x)},${coordinate(vertex.z)}`).join(" ");
          const fill = !region.discovered
            ? "#171a16"
            : region.biome === "water"
              ? "#275568"
            : region.owner === "player"
              ? "#5f7b32"
              : region.owner === "enemy"
                ? "#71372f"
                : "#393c32";
          return (
            <polygon
              key={region.id}
              points={points}
              fill={fill}
              stroke={region.visible ? "#8e9677" : "#30342c"}
              strokeWidth="0.35"
              opacity={region.discovered ? 1 : 0.58}
            />
          );
        })}
        {snapshot.buildings.filter((building) => building.type === "core").map((building) => (
          <rect
            key={building.id}
            x={coordinate(building.position.x) - 1.2}
            y={coordinate(building.position.z) - 1.2}
            width="2.4"
            height="2.4"
            fill={FACTION_COLORS[building.faction]}
            transform={`rotate(45 ${coordinate(building.position.x)} ${coordinate(building.position.z)})`}
          />
        ))}
        {snapshot.units.map((unit) => (
          <circle
            key={unit.id}
            cx={coordinate(unit.position.x)}
            cy={coordinate(unit.position.z)}
            r={unit.type === "breaker" ? 0.75 : 0.42}
            fill={FACTION_COLORS[unit.faction]}
            opacity="0.88"
          />
        ))}
        {snapshot.boats.map((boat) => (
          <path
            key={boat.id}
            d={`M ${coordinate(boat.position.x)} ${coordinate(boat.position.z) - 1.2} l 1.2 2.1 h -2.4 z`}
            fill={FACTION_COLORS[boat.faction]}
            opacity="0.95"
          />
        ))}
        {snapshot.tradeShips.map((ship) => (
          <rect
            key={ship.id}
            x={coordinate(ship.position.x) - 0.45}
            y={coordinate(ship.position.z) - 0.45}
            width="0.9"
            height="0.9"
            fill={ship.faction === "player" ? "#a9e9ff" : "#ffb36b"}
          />
        ))}
      </svg>
      <span className="minimap-corner corner-a" />
      <span className="minimap-corner corner-b" />
    </div>
  );
}
