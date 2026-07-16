import * as THREE from "three";
import { BIOMES, BOATS, BUILDINGS, BUILD_GRID, FACTION_COLORS, MAP_HALF_SIZE } from "../game/config";
import { pointInPolygon } from "../game/map";
import { gameSession } from "../game/session";
import { loadSettings } from "../game/persistence";
import type {
  Building,
  BuildingType,
  Boat,
  FactionId,
  GameSnapshot,
  Region,
  Unit,
  UnitType,
} from "../game/types";

interface UnitVisual {
  id: number;
  faction: FactionId;
  type: UnitType;
  squadId: number;
  current: THREE.Vector3;
  target: THREE.Vector3;
  heading: number;
}

interface BuildingVisual {
  group: THREE.Group;
  building: Building;
}

interface BoatVisual {
  group: THREE.Group;
  boat: Boat;
}

interface SquadBlobVisual {
  group: THREE.Group;
  faction: FactionId;
  count: number;
}

const BUILD_SHORTCUTS: Partial<Record<string, BuildingType>> = {
  n: "core", g: "generator", x: "storage", v: "vat", b: "extractor",
  c: "conveyor", r: "relay", t: "turret", f: "wall", u: "waterExtractor", j: "port",
};

const UNIT_GEOMETRIES: Record<UnitType, () => THREE.BufferGeometry> = {
  worker: () => new THREE.OctahedronGeometry(0.55, 0),
  scout: () => new THREE.ConeGeometry(0.48, 1.45, 5),
  assault: () => new THREE.CapsuleGeometry(0.36, 0.65, 3, 6),
  breaker: () => new THREE.DodecahedronGeometry(0.78, 0),
};

function factionMaterial(faction: FactionId, roughness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: FACTION_COLORS[faction],
    emissive: FACTION_COLORS[faction],
    emissiveIntensity: 0.13,
    roughness,
    metalness: 0.18,
  });
}

function darkMaterial(color = "#252a24"): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.35 });
}

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  scale?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeBuildingModel(building: Building): THREE.Group {
  const group = new THREE.Group();
  const team = factionMaterial(building.faction);
  const shell = darkMaterial(building.faction === "player" ? "#28301f" : "#34211f");
  const bone = darkMaterial("#aaa991");

  switch (building.type) {
    case "core": {
      // The core is a tiny self-sustaining colony: its roots mine while its pods
      // cultivate a trickle of biomass before dedicated extractors are online.
      addMesh(group, new THREE.CylinderGeometry(2.45, 2.95, 0.82, 8), shell, [0, 0.41, 0]);
      addMesh(group, new THREE.CylinderGeometry(1.65, 2.05, 1.5, 8), darkMaterial("#1a2118"), [0, 1.13, 0]);
      addMesh(group, new THREE.IcosahedronGeometry(1.12, 1), team, [0, 2.32, 0]);
      for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
        const root = addMesh(group, new THREE.BoxGeometry(0.4, 0.26, 2.7), bone, [Math.cos(angle) * 1.85, 0.32, Math.sin(angle) * 1.85]);
        root.rotation.y = -angle;
      }
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2 + 0.25;
        addMesh(group, new THREE.SphereGeometry(0.44, 7, 6), team, [Math.cos(angle) * 1.68, 1.35, Math.sin(angle) * 1.68]);
        addMesh(group, new THREE.CylinderGeometry(0.1, 0.15, 1.15, 5), bone, [Math.cos(angle) * 1.42, 0.83, Math.sin(angle) * 1.42]);
      }
      const drill = addMesh(group, new THREE.ConeGeometry(0.48, 1.35, 6), bone, [0, 0.05, 0]);
      drill.rotation.x = Math.PI;
      const ring = addMesh(group, new THREE.TorusGeometry(2.15, 0.13, 6, 24), team, [0, 2.32, 0]);
      ring.rotation.x = Math.PI / 2;
      ring.userData.spin = 0.28;
      break;
    }
    case "generator": {
      // Energy: a tall, hot reactor with its three unmistakable exhaust stacks.
      addMesh(group, new THREE.CylinderGeometry(1.85, 2.15, 0.62, 8), shell, [0, 0.31, 0]);
      addMesh(group, new THREE.CylinderGeometry(1.32, 1.5, 2.25, 8), darkMaterial("#1e2820"), [0, 1.38, 0]);
      const coil = addMesh(group, new THREE.TorusGeometry(1.18, 0.16, 6, 18), team, [0, 1.55, 0]);
      coil.rotation.x = Math.PI / 2;
      coil.userData.spin = 0.7;
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2 + 0.2;
        addMesh(group, new THREE.CylinderGeometry(0.23, 0.34, 3.45, 6), bone, [Math.cos(angle) * 1.3, 1.9, Math.sin(angle) * 1.3]);
        addMesh(group, new THREE.ConeGeometry(0.34, 0.52, 6), team, [Math.cos(angle) * 1.3, 3.86, Math.sin(angle) * 1.3]);
      }
      break;
    }
    case "storage": {
      // Storage: stacked containers around two large, low silos.
      addMesh(group, new THREE.BoxGeometry(4.1, 0.34, 3.7), shell, [0, 0.17, 0]);
      for (const x of [-1.08, 1.08]) {
        addMesh(group, new THREE.CylinderGeometry(0.78, 0.9, 2.15, 8), darkMaterial("#30352c"), [x, 1.25, 0.15]);
        addMesh(group, new THREE.ConeGeometry(0.78, 0.55, 8), bone, [x, 2.6, 0.15]);
        addMesh(group, new THREE.TorusGeometry(0.72, 0.08, 5, 14), team, [x, 1.65, 0.15]).rotation.x = Math.PI / 2;
      }
      for (const [x, z] of [[-1.55, -1.35], [1.55, -1.35], [0, 1.35]] as const) {
        addMesh(group, new THREE.BoxGeometry(0.78, 0.68, 0.78), bone, [x, 0.58, z]);
      }
      break;
    }
    case "vat": {
      // A single organ grows from clone vat into an active mutation chamber.
      addMesh(group, new THREE.BoxGeometry(4.15, 0.48, 2.55), shell, [0, 0.24, 0]);
      const glass = new THREE.MeshStandardMaterial({
        color: FACTION_COLORS[building.faction], transparent: true, opacity: 0.48,
        emissive: FACTION_COLORS[building.faction], emissiveIntensity: 0.25, roughness: 0.2,
      });
      for (const x of [-1.28, 0, 1.28]) {
        addMesh(group, new THREE.CylinderGeometry(0.58, 0.58, 2.25, 8, 1, true), glass, [x, 1.5, 0]);
        addMesh(group, new THREE.CapsuleGeometry(0.18, 0.55, 3, 5), bone, [x, 1.5, 0]);
        addMesh(group, new THREE.TorusGeometry(0.59, 0.07, 5, 14), team, [x, 0.68, 0]).rotation.x = Math.PI / 2;
      }
      const manifold = addMesh(group, new THREE.CylinderGeometry(0.14, 0.14, 3.4, 6), team, [0, 2.75, 0]);
      manifold.rotation.z = Math.PI / 2;
      if (building.level >= 2) {
        const halo = addMesh(group, new THREE.TorusKnotGeometry(0.92, 0.09, 46, 7, 2, 3), team, [0, 3.28, 0]);
        halo.userData.spin = 0.62;
        for (const x of [-1.7, 1.7]) {
          addMesh(group, new THREE.CylinderGeometry(0.12, 0.16, 2.1, 5), bone, [x, 1.42, 0]);
          addMesh(group, new THREE.SphereGeometry(0.28, 7, 6), team, [x, 2.57, 0]);
        }
      }
      break;
    }
    case "extractor": {
      // One hybrid organ alternates fungal harvest and deep mineral drilling.
      addMesh(group, new THREE.CylinderGeometry(1.9, 2.15, 0.46, 8), shell, [0, 0.23, 0]);
      for (const [x, z] of [[-1.15, -1.05], [1.15, -1.05], [-1.15, 1.05], [1.15, 1.05]] as const) {
        const leg = addMesh(group, new THREE.CylinderGeometry(0.1, 0.17, 2.75, 5), bone, [x, 1.42, z]);
        leg.rotation.z = x * -0.12;
      }
      for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
        addMesh(group, new THREE.SphereGeometry(0.58, 8, 6), team, [Math.cos(angle) * 1.02, 1.02, Math.sin(angle) * 1.02]);
      }
      addMesh(group, new THREE.CylinderGeometry(0.31, 0.42, 3.45, 7), darkMaterial("#1a1d1a"), [0, 1.78, 0]);
      const drill = addMesh(group, new THREE.ConeGeometry(0.52, 1.35, 7), team, [0, 0.02, 0]);
      drill.rotation.x = Math.PI;
      drill.userData.spin = 1.4;
      addMesh(group, new THREE.TorusGeometry(1.3, 0.12, 6, 18), bone, [0, 1.06, 0]).rotation.x = Math.PI / 2;
      break;
    }
    case "conveyor": {
      // Conveyor: exposed rollers and a bright moving capsule channel.
      addMesh(group, new THREE.BoxGeometry(2.15, 0.2, 2.15), darkMaterial("#1b201b"), [0, 0.1, 0]);
      addMesh(group, new THREE.BoxGeometry(0.72, 0.16, 2.05), shell, [0, 0.28, 0]);
      for (const z of [-0.76, -0.38, 0, 0.38, 0.76]) {
        const roller = addMesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), bone, [0, 0.42, z]);
        roller.rotation.z = Math.PI / 2;
      }
      addMesh(group, new THREE.BoxGeometry(0.26, 0.12, 0.44), team, [0, 0.55, 0]);
      break;
    }
    case "relay": {
      // Relay: a tall beacon mast with a floating signal halo.
      addMesh(group, new THREE.CylinderGeometry(1.9, 2.2, 0.45, 6), shell, [0, 0.23, 0]);
      addMesh(group, new THREE.CylinderGeometry(0.23, 0.38, 4.2, 6), bone, [0, 2.25, 0]);
      for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
        const brace = addMesh(group, new THREE.CylinderGeometry(0.08, 0.1, 2.25, 4), darkMaterial("#6a705f"), [Math.cos(angle) * 0.95, 1.15, Math.sin(angle) * 0.95]);
        brace.rotation.z = Math.cos(angle) * 0.62;
      }
      const ring = addMesh(group, new THREE.TorusGeometry(1.4, 0.11, 5, 20), team, [0, 3.65, 0]);
      ring.rotation.x = Math.PI / 2;
      ring.userData.spin = -0.45;
      addMesh(group, new THREE.SphereGeometry(0.28, 6, 5), team, [0, 4.55, 0]);
      break;
    }
    case "turret": {
      // Defence: an armoured turret ring with a clearly visible twin barrel.
      addMesh(group, new THREE.CylinderGeometry(1.55, 1.9, 0.62, 9), shell, [0, 0.31, 0]);
      addMesh(group, new THREE.CylinderGeometry(1.05, 1.24, 0.62, 8), darkMaterial("#20241e"), [0, 0.85, 0]);
      addMesh(group, new THREE.SphereGeometry(0.74, 8, 6), team, [0, 1.36, 0]);
      for (const x of [-0.27, 0.27]) {
        const barrel = addMesh(group, new THREE.CylinderGeometry(0.13, 0.17, 2.75, 6), bone, [x, 1.48, -1.22]);
        barrel.rotation.x = Math.PI / 2 - 0.13;
      }
      addMesh(group, new THREE.TorusGeometry(1.2, 0.09, 6, 16), team, [0, 0.92, 0]).rotation.x = Math.PI / 2;
      break;
    }
    case "wall": {
      // Wall: thick segmented teeth, visually distinct from a normal building.
      addMesh(group, new THREE.BoxGeometry(2.45, 1.42, 0.7), shell, [0, 0.71, 0]);
      for (const x of [-0.86, 0, 0.86]) {
        addMesh(group, new THREE.ConeGeometry(0.3, 0.75, 4), bone, [x, 1.75, 0]);
        addMesh(group, new THREE.BoxGeometry(0.18, 0.18, 0.95), team, [x, 1.12, 0]);
      }
      break;
    }
    case "waterExtractor": {
      // Water: an elevated pump station with two obvious intake pipes.
      addMesh(group, new THREE.BoxGeometry(3.3, 0.5, 2.65), shell, [0, 0.25, 0]);
      addMesh(group, new THREE.CylinderGeometry(0.92, 1.08, 2.15, 8), darkMaterial("#203239"), [0, 1.33, 0]);
      const cap = addMesh(group, new THREE.ConeGeometry(1.08, 0.62, 8), team, [0, 2.72, 0]);
      cap.userData.spin = -0.38;
      for (const x of [-1.05, 1.05]) {
        const pipe = addMesh(group, new THREE.TorusGeometry(0.72, 0.16, 6, 12, Math.PI), bone, [x, 0.86, -0.58]);
        pipe.rotation.y = Math.PI / 2;
        addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 1.35, 6), team, [x, 0.35, -1.24]);
      }
      break;
    }
    case "port": {
      // Port: warehouse at the back, two finger piers, ramp, bollards and crane.
      addMesh(group, new THREE.BoxGeometry(5.7, 0.48, 4.65), shell, [0, 0.24, 0.35]);
      addMesh(group, new THREE.BoxGeometry(3.65, 1.45, 1.45), darkMaterial("#26302c"), [0, 1.08, 1.28]);
      addMesh(group, new THREE.BoxGeometry(3.84, 0.18, 1.62), team, [0, 1.89, 1.28]);
      for (const x of [-2.05, 2.05]) {
        addMesh(group, new THREE.BoxGeometry(0.72, 0.24, 4.85), bone, [x, 0.62, -1.25]);
        for (const z of [-3.15, -1.55, 0.02]) {
          addMesh(group, new THREE.CylinderGeometry(0.13, 0.16, 1.18, 6), darkMaterial("#151a18"), [x + (x < 0 ? -0.22 : 0.22), 0.59, z]);
        }
      }
      const ramp = addMesh(group, new THREE.BoxGeometry(2.15, 0.22, 2.6), team, [0, 0.53, -1.7]);
      ramp.rotation.x = -0.16;
      addMesh(group, new THREE.BoxGeometry(0.32, 3.8, 0.32), bone, [-1.42, 2.2, 0.72]);
      const craneArm = addMesh(group, new THREE.BoxGeometry(3.55, 0.26, 0.26), bone, [0.18, 3.82, 0.72]);
      craneArm.rotation.z = -0.08;
      addMesh(group, new THREE.CylinderGeometry(0.045, 0.045, 2.15, 5), team, [1.5, 2.72, 0.72]);
      addMesh(group, new THREE.BoxGeometry(0.34, 0.34, 0.34), team, [1.5, 1.68, 0.72]);
      for (const x of [-0.82, 0.82]) addMesh(group, new THREE.CylinderGeometry(0.17, 0.21, 0.46, 6), darkMaterial("#121714"), [x, 0.62, -2.7]);
      break;
    }
  }
  group.userData.buildingId = building.id;
  group.userData.buildingType = building.type;
  group.rotation.y = building.orientation;
  return group;
}

function makeBoatModel(boat: Boat): THREE.Group {
  const group = new THREE.Group();
  const team = factionMaterial(boat.faction, 0.5);
  const hull = darkMaterial(boat.faction === "player" ? "#253b37" : "#44302d");
  const size = boat.type === "skiff" ? 0.78 : boat.type === "landingCraft" ? 1.1 : 1.42;
  addMesh(group, new THREE.BoxGeometry(size * 2.4, 0.48, size * 1.15), hull, [0, 0.38, 0]);
  addMesh(group, new THREE.ConeGeometry(size * 0.6, size * 1.3, 4), team, [0, 0.8, -size * 0.18]);
  const rail = addMesh(group, new THREE.TorusGeometry(size * 0.62, 0.07, 4, 12), team, [0, 0.68, 0]);
  rail.rotation.x = Math.PI / 2;
  group.userData.boatId = boat.id;
  return group;
}

export class GameScene {
  private readonly container: HTMLElement;
  private readonly settings = loadSettings();
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cameraTarget = new THREE.Vector3(0, 0, 0);
  private readonly regionGroup = new THREE.Group();
  private readonly buildingGroup = new THREE.Group();
  private readonly cargoGroup = new THREE.Group();
  private readonly projectileGroup = new THREE.Group();
  private readonly selectionGroup = new THREE.Group();
  private readonly squadMarkerGroup = new THREE.Group();
  private readonly anchorGroup = new THREE.Group();
  private readonly squadBlobGroup = new THREE.Group();
  private readonly ground: THREE.Mesh;
  private regionMeshes = new Map<number, THREE.Mesh>();
  private startRings = new Map<number, THREE.Mesh>();
  private buildingVisuals = new Map<number, BuildingVisual>();
  private boatVisuals = new Map<number, BoatVisual>();
  private unitVisuals = new Map<number, UnitVisual>();
  private unitMeshes = new Map<string, THREE.InstancedMesh>();
  private unitIdsByMesh = new Map<THREE.InstancedMesh, number[]>();
  private squadMarkers = new Map<string, THREE.Sprite>();
  private anchorVisuals = new Map<number, THREE.Group>();
  private squadBlobs = new Map<string, SquadBlobVisual>();
  private selectionRings = new Map<string, THREE.Mesh>();
  private snapshot: GameSnapshot | null = null;
  private snapshotUnsubscribe: (() => void) | null = null;
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private clock = new THREE.Clock();
  private zoom = 1;
  private cameraAngle = Math.PI / 4;
  private keyState = new Set<string>();
  private controlGroups = new Map<number, number[]>();
  private dragStart: { x: number; y: number } | null = null;
  private dragCurrent: { x: number; y: number } | null = null;
  private middleDrag: { x: number; y: number } | null = null;
  private pointerMoved = false;
  private ghost: THREE.Group | null = null;
  private ghostType: BuildingType | null = null;
  private combatSequenceActive = false;
  private combatSignalExpiresAtTick = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene.background = new THREE.Color("#10120f");
    this.scene.fog = null;
    const aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    this.camera = new THREE.OrthographicCamera(-35 * aspect, 35 * aspect, 35, -35, 0.1, 300);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const pixelRatioCap = this.settings.renderQuality === "eco" ? 0.9 : this.settings.renderQuality === "high" ? 2 : 1.35;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.HemisphereLight("#d9dfc0", "#171a16", 1.35);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight("#f2efda", 3.2);
    sun.position.set(-35, 65, 25);
    sun.castShadow = this.settings.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    this.scene.add(sun);

    const groundMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF_SIZE * 2, MAP_HALF_SIZE * 2), groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.08;
    this.ground.name = "command-ground";
    this.scene.add(this.ground);
    this.scene.add(this.regionGroup, this.anchorGroup, this.buildingGroup, this.cargoGroup, this.projectileGroup, this.selectionGroup, this.squadBlobGroup, this.squadMarkerGroup);

    const grid = new THREE.GridHelper(MAP_HALF_SIZE * 2, 40, "#89906c", "#394037");
    grid.position.y = 0.09;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.17;
    this.scene.add(grid);

    this.addAtmosphere();
    this.updateCamera();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.snapshotUnsubscribe = gameSession.subscribeSnapshots(this.handleSnapshot);
    this.animate();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.snapshotUnsubscribe?.();
    this.clearSquadMarkers();
    this.clearSquadBlobs();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose();
    });
    this.renderer.dispose();
    canvas.remove();
  }

  private addAtmosphere(): void {
    const geometry = new THREE.BufferGeometry();
    const count = 180;
    const positions = new Float32Array(count * 3);
    const random = (index: number) => {
      const value = Math.sin(index * 91.731 + 13.17) * 43758.5453;
      return value - Math.floor(value);
    };
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (random(index) - 0.5) * 130;
      positions[index * 3 + 1] = random(index + 1000) * 18 + 1;
      positions[index * 3 + 2] = (random(index + 2000) - 0.5) * 130;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: "#d7ddaa", size: 0.18, transparent: true, opacity: 0.32 }),
    );
    points.userData.drift = true;
    this.scene.add(points);
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private handleSnapshot = (snapshot: GameSnapshot): void => {
    const firstMap = !this.snapshot || this.snapshot.seed !== snapshot.seed;
    this.snapshot = snapshot;
    if (firstMap) this.buildRegions(snapshot.regions);
    this.updateRegions(snapshot.regions);
    this.updateBuildings(snapshot.buildings);
    this.updateBoats(snapshot.boats);
    this.updateUnitTargets(snapshot.units);
    this.updateTransientObjects();
    this.syncCombatFocus(snapshot);
  };

  private syncCombatFocus(snapshot: GameSnapshot): void {
    const state = gameSession.getState();
    if (snapshot.projectiles.length > 0) {
      this.combatSignalExpiresAtTick = snapshot.tick + 80;
      if (!this.combatSequenceActive) {
        this.combatSequenceActive = true;
        gameSession.focusCombat(snapshot.projectiles.at(-1)!.target);
      }
      return;
    }
    if (!this.combatSequenceActive) return;
    if (snapshot.tick <= this.combatSignalExpiresAtTick) return;
    this.combatSequenceActive = false;
    if (state.combatFocus) {
      gameSession.cancelCombatFocus();
    }
  }

  private buildRegions(regions: Region[]): void {
    for (const child of [...this.regionGroup.children]) this.disposeObject(child);
    this.regionGroup.clear();
    for (const child of [...this.anchorGroup.children]) this.disposeObject(child);
    this.anchorGroup.clear();
    this.regionMeshes.clear();
    this.startRings.clear();
    this.anchorVisuals.clear();
    for (const region of regions) {
      const shape = new THREE.Shape();
      const first = region.vertices[0];
      if (!first) continue;
      shape.moveTo(first.x, first.z);
      for (const vertex of region.vertices.slice(1)) shape.lineTo(vertex.x, vertex.z);
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({
        color: BIOMES[region.biome].darkColor,
        roughness: 0.94,
        metalness: 0.02,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = region.biome === "water" ? -0.13 : region.elevation * 0.16 - 0.05;
      mesh.receiveShadow = true;
      mesh.userData.regionId = region.id;
      this.regionGroup.add(mesh);
      this.regionMeshes.set(region.id, mesh);

      const terrainY = region.biome === "water" ? 0.02 : region.elevation * 0.16 + 0.02;
      const outlinePoints = [...region.vertices, region.vertices[0]!].map((vertex) => new THREE.Vector3(vertex.x, terrainY, vertex.z));
      const outline = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(outlinePoints),
        new THREE.LineBasicMaterial({ color: "#a7ad88", transparent: true, opacity: 0.28 }),
      );
      this.regionGroup.add(outline);

      if (region.biome !== "water" && region.elevation >= 1) {
        const contour = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(region.vertices.map((vertex) => new THREE.Vector3(
            region.center.x + (vertex.x - region.center.x) * 0.72,
            terrainY + 0.025,
            region.center.z + (vertex.z - region.center.z) * 0.72,
          ))),
          new THREE.LineBasicMaterial({ color: "#bbc08e", transparent: true, opacity: 0.16 }),
        );
        this.regionGroup.add(contour);
      }

      if (region.startCandidate) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(2.8, 3.15, 32),
          new THREE.MeshBasicMaterial({ color: "#d9e4b2", transparent: true, opacity: 0.52, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(region.center.x, terrainY + 0.16, region.center.z);
        ring.userData.regionId = region.id;
        this.regionGroup.add(ring);
        this.startRings.set(region.id, ring);
      }

      for (const anchor of region.anchors) {
        const group = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.3, 0.18, 7),
          new THREE.MeshStandardMaterial({ color: "#22261f", emissive: "#11140f", roughness: 0.7, metalness: 0.16 }),
        );
        base.position.y = terrainY + 0.13;
        const pulse = new THREE.Mesh(
          new THREE.RingGeometry(0.72, 1.08, 20),
          new THREE.MeshBasicMaterial({ color: "#c4c99e", transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
        );
        pulse.rotation.x = -Math.PI / 2;
        pulse.position.y = terrainY + 0.24;
        const spire = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.42, 0),
          new THREE.MeshStandardMaterial({ color: "#c4c99e", emissive: "#53613e", emissiveIntensity: 0.35, roughness: 0.38 }),
        );
        spire.position.y = terrainY + 0.52;
        group.add(base, pulse, spire);
        group.userData.anchorId = anchor.id;
        group.userData.regionId = region.id;
        group.userData.pulse = pulse;
        group.userData.spire = spire;
        group.position.set(anchor.position.x, 0, anchor.position.z);
        this.anchorGroup.add(group);
        this.anchorVisuals.set(anchor.id, group);
      }
    }
  }

  private updateRegions(regions: Region[]): void {
    const state = gameSession.getState();
    for (const region of regions) {
      const mesh = this.regionMeshes.get(region.id);
      if (!mesh) continue;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const base = new THREE.Color(region.discovered ? BIOMES[region.biome].color : "#171a16");
      if (region.owner === "player") base.lerp(new THREE.Color(FACTION_COLORS.player), 0.29);
      if (region.owner === "enemy") base.lerp(new THREE.Color(FACTION_COLORS.enemy), 0.26);
      if (!region.visible && region.discovered) base.multiplyScalar(0.5);
      if (state.selectedStartRegionId === region.id || state.hoveredRegionId === region.id) base.offsetHSL(0, 0.08, 0.12);
      material.color.copy(base);
      material.opacity = region.biome === "water" ? (region.discovered ? 0.88 : 0.62) : (region.discovered ? 0.96 : 0.72);
      const ring = this.startRings.get(region.id);
      if (ring) {
        ring.visible = this.snapshot?.phase === "deployment";
        const ringMaterial = ring.material as THREE.MeshBasicMaterial;
        ringMaterial.color.set(state.selectedStartRegionId === region.id ? "#c8ff45" : "#d9e4b2");
        ringMaterial.opacity = state.selectedStartRegionId === region.id ? 0.95 : 0.42;
      }
      for (const anchor of region.anchors) {
        const visual = this.anchorVisuals.get(anchor.id);
        if (!visual) continue;
        visual.visible = region.discovered;
        const pulse = visual.userData.pulse as THREE.Mesh;
        const spire = visual.userData.spire as THREE.Mesh;
        const claimant = anchor.captureFaction === "neutral" ? anchor.owner : anchor.captureFaction;
        const color = claimant === "neutral" ? "#c4c99e" : FACTION_COLORS[claimant];
        (pulse.material as THREE.MeshBasicMaterial).color.set(color);
        (pulse.material as THREE.MeshBasicMaterial).opacity = anchor.owner === "neutral" ? 0.66 : 0.92;
        const spireMaterial = spire.material as THREE.MeshStandardMaterial;
        spireMaterial.color.set(color);
        spireMaterial.emissive.set(color);
        spireMaterial.emissiveIntensity = anchor.captureProgress < 100 ? 0.9 : 0.35;
        const captureRatio = Math.max(0.4, anchor.captureProgress / 100);
        pulse.scale.setScalar(0.84 + captureRatio * 0.34);
      }
    }
  }

  private updateBuildings(buildings: Building[]): void {
    const ids = new Set(buildings.map((building) => building.id));
    for (const [id, visual] of this.buildingVisuals) {
      if (!ids.has(id)) {
        this.buildingGroup.remove(visual.group);
        this.disposeObject(visual.group);
        this.buildingVisuals.delete(id);
      }
    }
    for (const building of buildings) {
      let visual = this.buildingVisuals.get(building.id);
      if (visual && visual.building.level !== building.level) {
        this.buildingGroup.remove(visual.group);
        this.disposeObject(visual.group);
        this.buildingVisuals.delete(building.id);
        visual = undefined;
      }
      if (!visual) {
        const group = makeBuildingModel(building);
        group.position.set(building.position.x, this.terrainHeight(building.regionId) + 0.1, building.position.z);
        this.buildingGroup.add(group);
        visual = { group, building };
        this.buildingVisuals.set(building.id, visual);
      }
      visual.building = building;
      visual.group.position.set(building.position.x, this.terrainHeight(building.regionId) + 0.1, building.position.z);
      const constructionScale = Math.max(0.08, building.construction);
      visual.group.scale.set(1, constructionScale, 1);
      visual.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.MeshStandardMaterial;
        if ("emissiveIntensity" in material) material.emissiveIntensity = building.active ? 0.16 : 0.02;
      });
    }
  }

  private terrainHeight(regionId: number): number {
    const region = this.snapshot?.regions.find((candidate) => candidate.id === regionId);
    return region?.biome === "water" ? 0 : (region?.elevation ?? 0) * 0.16;
  }

  private terrainHeightAt(position: { x: number; z: number }): number {
    const region = this.snapshot?.regions.find((candidate) => pointInPolygon(position, candidate.vertices));
    return region?.biome === "water" ? 0 : (region?.elevation ?? 0) * 0.16;
  }

  private updateBoats(boats: Boat[]): void {
    const ids = new Set(boats.map((boat) => boat.id));
    for (const [id, visual] of this.boatVisuals) {
      if (ids.has(id)) continue;
      this.buildingGroup.remove(visual.group);
      this.disposeObject(visual.group);
      this.boatVisuals.delete(id);
    }
    for (const boat of boats) {
      let visual = this.boatVisuals.get(boat.id);
      if (!visual) {
        const group = makeBoatModel(boat);
        this.buildingGroup.add(group);
        visual = { group, boat };
        this.boatVisuals.set(boat.id, visual);
      }
      visual.boat = boat;
      visual.group.position.set(boat.position.x, 0.18, boat.position.z);
      if (Math.hypot(boat.velocity.x, boat.velocity.z) > 0.1) visual.group.rotation.y = Math.atan2(boat.velocity.x, boat.velocity.z);
    }
  }

  private updateUnitTargets(units: Unit[]): void {
    const ids = new Set(units.map((unit) => unit.id));
    for (const id of this.unitVisuals.keys()) {
      if (!ids.has(id)) this.unitVisuals.delete(id);
    }
    for (const unit of units) {
      const target = new THREE.Vector3(unit.position.x, this.terrainHeightAt(unit.position) + (unit.type === "breaker" ? 0.82 : 0.72), unit.position.z);
      const existing = this.unitVisuals.get(unit.id);
      if (existing) {
        existing.squadId = unit.squadId;
        existing.target.copy(target);
        if (Math.hypot(unit.velocity.x, unit.velocity.z) > 0.1) existing.heading = Math.atan2(unit.velocity.x, unit.velocity.z);
      } else {
        this.unitVisuals.set(unit.id, {
          id: unit.id, faction: unit.faction, type: unit.type, squadId: unit.squadId,
          current: target.clone(), target, heading: 0,
        });
      }
    }
  }

  private ensureUnitMesh(faction: FactionId, type: UnitType): THREE.InstancedMesh {
    const key = `${faction}:${type}`;
    const existing = this.unitMeshes.get(key);
    if (existing) return existing;
    const mesh = new THREE.InstancedMesh(UNIT_GEOMETRIES[type](), factionMaterial(faction, 0.58), 220);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.unitMesh = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.unitMeshes.set(key, mesh);
    this.unitIdsByMesh.set(mesh, []);
    return mesh;
  }

  private updateUnitInstances(delta: number): void {
    const squads = new Map<string, UnitVisual[]>();
    for (const visual of this.unitVisuals.values()) {
      visual.current.lerp(visual.target, Math.min(1, delta * 11));
      const key = `${visual.faction}:${visual.type}:${visual.squadId}`;
      const list = squads.get(key) ?? [];
      list.push(visual);
      squads.set(key, list);
    }
    type RenderUnit = { id: number; current: THREE.Vector3; heading: number };
    const grouped = new Map<string, RenderUnit[]>();
    const markers: Array<{ key: string; faction: FactionId; count: number; position: THREE.Vector3 }> = [];
    const activeBlobs = new Set<string>();
    const focus = gameSession.getState().combatFocus;
    for (const [squadKey, members] of squads) {
      const faction = members[0]!.faction;
      const type = members[0]!.type;
      const renderKey = `${faction}:${type}`;
      const output = grouped.get(renderKey) ?? [];
      const showDetail = (focus !== null && members.some((member) => Math.hypot(member.current.x - focus.x, member.current.z - focus.z) <= 14)) ||
        this.squadIsMakingRegionalDecision(members);
      if (showDetail) {
        for (const member of members) output.push({ id: member.id, current: member.current, heading: member.heading });
      } else {
        const center = members.reduce((sum, member) => sum.add(member.current), new THREE.Vector3()).multiplyScalar(1 / members.length);
        this.updateSquadBlob(squadKey, faction, members[0]!.id, center, members.length, members[0]!.heading);
        activeBlobs.add(squadKey);
        markers.push({ key: squadKey, faction, count: members.length, position: center });
      }
      grouped.set(renderKey, output);
    }
    for (const key of [...this.squadBlobs.keys()]) {
      if (!activeBlobs.has(key)) this.removeSquadBlob(key);
    }
    this.updateSquadMarkers(markers);
    const dummy = new THREE.Object3D();
    for (const faction of ["player", "enemy"] as const) {
      for (const type of ["worker", "scout", "assault", "breaker"] as const) {
        const key = `${faction}:${type}`;
        const mesh = this.ensureUnitMesh(faction, type);
        const visuals = grouped.get(key) ?? [];
        const ids: number[] = [];
        for (let index = 0; index < visuals.length; index += 1) {
          const visual = visuals[index]!;
          dummy.position.copy(visual.current);
          dummy.rotation.set(type === "scout" ? Math.PI : 0, visual.heading, 0);
          const pulse = this.settings.reducedMotion ? 1 : 1 + Math.sin(this.clock.elapsedTime * 3 + visual.id) * 0.025;
          dummy.scale.setScalar(pulse);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
          ids.push(visual.id);
        }
        mesh.count = visuals.length;
        mesh.instanceMatrix.needsUpdate = true;
        this.unitIdsByMesh.set(mesh, ids);
      }
    }
  }

  private squadIsMakingRegionalDecision(members: UnitVisual[]): boolean {
    if (!this.snapshot) return false;
    const center = members.reduce((sum, member) => sum.add(member.current), new THREE.Vector3()).multiplyScalar(1 / members.length);
    const region = this.snapshot.regions.find((candidate) => pointInPolygon({ x: center.x, z: center.z }, candidate.vertices));
    if (!region) return false;
    return region.anchors.some((anchor) => {
      const unresolved = anchor.captureProgress < 100 || anchor.owner !== region.owner;
      return unresolved && Math.hypot(center.x - anchor.position.x, center.z - anchor.position.z) <= 7.5;
    });
  }

  private createSquadBlob(faction: FactionId): SquadBlobVisual {
    const group = new THREE.Group();
    const color = FACTION_COLORS[faction];
    const shadow = new THREE.MeshBasicMaterial({ color: "#080a08", transparent: true, opacity: 0.45, depthWrite: false });
    const ink = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, depthWrite: false });
    const rim = new THREE.MeshBasicMaterial({ color: "#edf4c6", transparent: true, opacity: 0.24, depthWrite: false });
    const lobes: Array<[number, number, number]> = [[0, 0, 1], [-0.58, 0.18, 0.62], [0.56, -0.16, 0.7]];
    for (const [x, z, scale] of lobes) {
      const cast = new THREE.Mesh(new THREE.CircleGeometry(1, 16), shadow);
      cast.rotation.x = -Math.PI / 2;
      cast.position.set(x + 0.13, 0.13, z + 0.18);
      cast.scale.set(scale * 1.22, scale, 1);
      group.add(cast);
      const lobe = new THREE.Mesh(new THREE.CircleGeometry(1, 16), ink);
      lobe.rotation.x = -Math.PI / 2;
      lobe.position.set(x, 0.17, z);
      lobe.scale.set(scale * 1.2, scale, 1);
      group.add(lobe);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.05, 20), rim);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.19;
    group.add(ring);
    return { group, faction, count: 0 };
  }

  private updateSquadBlob(key: string, faction: FactionId, unitId: number, position: THREE.Vector3, count: number, heading: number): void {
    let blob = this.squadBlobs.get(key);
    if (!blob) {
      blob = this.createSquadBlob(faction);
      blob.group.userData.representativeUnitId = unitId;
      this.squadBlobGroup.add(blob.group);
      this.squadBlobs.set(key, blob);
    }
    blob.count = count;
    blob.group.userData.representativeUnitId = unitId;
    blob.group.position.set(position.x, Math.max(0.14, position.y - 0.58), position.z);
    blob.group.rotation.y = heading;
    const pulse = this.settings.reducedMotion ? 1 : 1 + Math.sin(this.clock.elapsedTime * 3.4 + unitId) * 0.035;
    const size = (1 + Math.sqrt(count - 1) * 0.32) * pulse;
    blob.group.scale.set(size * 1.22, 1, size);
  }

  private removeSquadBlob(key: string): void {
    const blob = this.squadBlobs.get(key);
    if (!blob) return;
    this.squadBlobGroup.remove(blob.group);
    this.disposeObject(blob.group);
    this.squadBlobs.delete(key);
  }

  private clearSquadBlobs(): void {
    for (const key of [...this.squadBlobs.keys()]) this.removeSquadBlob(key);
  }

  private updateSquadMarkers(markers: Array<{ key: string; faction: FactionId; count: number; position: THREE.Vector3 }>): void {
    const retained = new Set<string>();
    for (const marker of markers) {
      retained.add(marker.key);
      let sprite = this.squadMarkers.get(marker.key);
      if (!sprite || sprite.userData.count !== marker.count) {
        if (sprite) this.removeSquadMarker(marker.key);
        sprite = this.createSquadMarker(marker.faction, marker.count);
        this.squadMarkerGroup.add(sprite);
        this.squadMarkers.set(marker.key, sprite);
      }
      sprite.position.set(marker.position.x, marker.position.y + 1.45, marker.position.z);
    }
    for (const key of [...this.squadMarkers.keys()]) {
      if (!retained.has(key)) this.removeSquadMarker(key);
    }
  }

  private createSquadMarker(faction: FactionId, count: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(11, 14, 11, 0.88)";
    context.fillRect(9, 9, 78, 30);
    context.strokeStyle = FACTION_COLORS[faction];
    context.lineWidth = 3;
    context.strokeRect(9, 9, 78, 30);
    context.fillStyle = "#f4f0d5";
    context.font = "bold 22px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`×${count}`, 48, 25);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.9, 1.45, 1);
    sprite.renderOrder = 12;
    sprite.userData.count = count;
    return sprite;
  }

  private removeSquadMarker(key: string): void {
    const sprite = this.squadMarkers.get(key);
    if (!sprite) return;
    this.squadMarkerGroup.remove(sprite);
    const material = sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
    this.squadMarkers.delete(key);
  }

  private clearSquadMarkers(): void {
    for (const key of [...this.squadMarkers.keys()]) this.removeSquadMarker(key);
  }

  private updateTransientObjects(): void {
    if (!this.snapshot) return;
    for (const child of [...this.cargoGroup.children]) this.disposeObject(child);
    this.cargoGroup.clear();
    for (const packet of this.snapshot.cargo) {
      const material = new THREE.MeshBasicMaterial({ color: packet.resource === "biomass" ? "#b9ff59" : packet.resource === "water" ? "#72d6ff" : "#efb26b" });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), material);
      mesh.position.set(packet.position.x, 0.64, packet.position.z);
      this.cargoGroup.add(mesh);
    }
    for (const ship of this.snapshot.tradeShips) {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.46, 1.2, 4),
        new THREE.MeshBasicMaterial({ color: ship.faction === "player" ? "#a9e9ff" : "#ffb36b" }),
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = Math.atan2(ship.velocity.z, ship.velocity.x) - Math.PI / 2;
      mesh.position.set(ship.position.x, 0.72, ship.position.z);
      this.cargoGroup.add(mesh);
    }
    for (const child of [...this.projectileGroup.children]) this.disposeObject(child);
    this.projectileGroup.clear();
    for (const projectile of this.snapshot.projectiles) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 5, 4),
        new THREE.MeshBasicMaterial({ color: projectile.color }),
      );
      mesh.position.set(projectile.position.x, 1.1, projectile.position.z);
      this.projectileGroup.add(mesh);
    }
  }

  private updateSelectionVisuals(): void {
    const state = gameSession.getState();
    const retained = new Set<string>();
    const selectedSquads = new Map<string, UnitVisual[]>();
    for (const id of state.selectedUnitIds) {
      const visual = this.unitVisuals.get(id);
      if (!visual) continue;
      const key = `${visual.faction}:${visual.type}:${visual.squadId}`;
      const members = selectedSquads.get(key) ?? [];
      members.push(visual);
      selectedSquads.set(key, members);
    }
    for (const [squadKey, members] of selectedSquads) {
      const key = `squad:${squadKey}`;
      retained.add(key);
      let ring = this.selectionRings.get(key);
      if (!ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(0.78, 0.92, 18),
          new THREE.MeshBasicMaterial({ color: "#eaffae", transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        this.selectionGroup.add(ring);
        this.selectionRings.set(key, ring);
      }
      const center = members.reduce((sum, member) => sum.add(member.current), new THREE.Vector3()).multiplyScalar(1 / members.length);
      ring.scale.setScalar(1 + (members.length - 1) * 0.12);
      ring.position.set(center.x, Math.max(0.17, center.y - 0.54), center.z);
    }
    if (state.selectedBuildingId !== null) {
      const building = this.buildingVisuals.get(state.selectedBuildingId)?.building;
      if (building) {
        const key = `building:${building.id}`;
        retained.add(key);
        const radius = BUILDINGS[building.type].size * 0.7;
        let ring = this.selectionRings.get(key);
        if (!ring) {
          ring = new THREE.Mesh(
            new THREE.RingGeometry(radius, radius + 0.16, 32),
            new THREE.MeshBasicMaterial({ color: "#eaffae", transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          this.selectionGroup.add(ring);
          this.selectionRings.set(key, ring);
        }
        ring.position.set(building.position.x, this.terrainHeight(building.regionId) + 0.18, building.position.z);
      }
    }
    if (state.selectedBoatId !== null) {
      const boat = this.boatVisuals.get(state.selectedBoatId)?.boat;
      if (boat) {
        const key = `boat:${boat.id}`;
        retained.add(key);
        let ring = this.selectionRings.get(key);
        if (!ring) {
          ring = new THREE.Mesh(
            new THREE.RingGeometry(1.35, 1.55, 24),
            new THREE.MeshBasicMaterial({ color: "#77dfff", transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          this.selectionGroup.add(ring);
          this.selectionRings.set(key, ring);
        }
        ring.position.set(boat.position.x, 0.19, boat.position.z);
      }
    }
    for (const [key, ring] of this.selectionRings) {
      if (retained.has(key)) continue;
      this.selectionGroup.remove(ring);
      this.disposeObject(ring);
      this.selectionRings.delete(key);
    }
  }

  private updateGhost(): void {
    const type = gameSession.getState().selectedBuildType;
    if (type !== this.ghostType) {
      if (this.ghost) {
        this.scene.remove(this.ghost);
        this.disposeObject(this.ghost);
      }
      this.ghost = null;
      this.ghostType = type;
      if (type) {
        const placeholder: Building = {
          id: -1, faction: "player", type, position: { x: 0, z: 0 }, regionId: -1,
          hp: 1, maxHp: 1, construction: 1, level: 1, upgradeProgress: 0, upgrading: false, active: true, powered: true,
          orientation: 0, queue: [], boatQueue: [], productionProgress: 0, boatProductionProgress: 0, cooldown: 0,
        };
        this.ghost = makeBuildingModel(placeholder);
        this.ghost.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const material = object.material.clone();
          material.transparent = true;
          material.opacity = 0.45;
          object.material = material;
        });
        this.scene.add(this.ghost);
      }
      this.renderer.domElement.style.cursor = type ? "cell" : "crosshair";
    }
    if (!this.ghost || !type) return;
    const point = this.groundPointFromPointer();
    if (!point) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    const position = {
      x: Math.round(point.x / BUILD_GRID) * BUILD_GRID,
      z: Math.round(point.z / BUILD_GRID) * BUILD_GRID,
    };
    this.ghost.position.set(position.x, this.terrainHeightAt(position) + 0.12, position.z);
    const snapshot = this.snapshot;
    const definition = BUILDINGS[type];
    const region = snapshot?.regions.find((candidate) => pointInPolygon(position, candidate.vertices));
    this.ghost.rotation.y = this.previewOrientation(type, position, region);
    const hasWorker = (region?.workers.player ?? 0) > 0;
    const clear = !snapshot?.buildings.some((building) => {
      const factor = type === "conveyor" || building.type === "conveyor" ? 0.39 : 0.57;
      const minimum = (definition.size + BUILDINGS[building.type].size) * factor;
      return Math.hypot(building.position.x - position.x, building.position.z - position.z) < minimum;
    });
    const affordable = !!snapshot &&
      (definition.cost.biomass ?? 0) <= snapshot.resources.player.biomass &&
      (definition.cost.ore ?? 0) <= snapshot.resources.player.ore &&
      (definition.cost.water ?? 0) <= snapshot.resources.player.water;
    const needsWater = type === "waterExtractor" || type === "port";
    const hasWaterAccess = !needsWater || !!region?.neighbors.some((id) => snapshot?.regions.find((candidate) => candidate.id === id)?.biome === "water");
    const controlsClaim = !!region && region.anchors.filter((anchor) => anchor.owner === "player").length >= Math.ceil(region.anchors.length / 2);
    const validTerritory = region?.owner === "player" || (type === "relay" && controlsClaim);
    const valid = !!region && validTerritory && region.biome !== "water" && hasWorker && clear && affordable && hasWaterAccess;
    this.ghost.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      object.material.color.set(valid ? "#c8ff45" : "#ff5b49");
      object.material.emissive.set(valid ? "#66871e" : "#7b1d17");
      object.material.emissiveIntensity = 0.4;
    });
  }

  private previewOrientation(type: BuildingType, position: { x: number; z: number }, region: Region | undefined): number {
    const face = (target: { x: number; z: number }): number => Math.atan2(position.x - target.x, position.z - target.z);
    const snapshot = this.snapshot;
    const water = region?.neighbors
      .map((id) => snapshot?.regions.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Region => candidate?.biome === "water")
      .sort((first, second) => Math.hypot(position.x - first.center.x, position.z - first.center.z) - Math.hypot(position.x - second.center.x, position.z - second.center.z))[0];
    if ((type === "port" || type === "waterExtractor") && water) return face(water.center);

    const hostileCore = snapshot?.buildings
      .filter((building) => building.faction === "enemy" && building.type === "core" && building.hp > 0)
      .sort((first, second) => Math.hypot(position.x - first.position.x, position.z - first.position.z) - Math.hypot(position.x - second.position.x, position.z - second.position.z))[0];
    if ((type === "turret" || type === "wall") && hostileCore) return face(hostileCore.position);

    const priority = type === "conveyor" ? ["storage", "conveyor", "core"] : ["core", "storage", "vat"];
    const anchor = snapshot?.buildings
      .filter((building) => building.faction === "player" && priority.includes(building.type) && building.hp > 0)
      .sort((first, second) => {
        const priorityDifference = priority.indexOf(first.type) - priority.indexOf(second.type);
        return priorityDifference !== 0 ? priorityDifference : Math.hypot(position.x - first.position.x, position.z - first.position.z) - Math.hypot(position.x - second.position.x, position.z - second.position.z);
      })[0];
    return anchor ? face(anchor.position) : region ? face(region.center) : 0;
  }

  private updateCamera(): void {
    const distance = 68;
    this.camera.position.set(
      this.cameraTarget.x + Math.cos(this.cameraAngle) * distance,
      62,
      this.cameraTarget.z + Math.sin(this.cameraAngle) * distance,
    );
    this.camera.lookAt(this.cameraTarget);
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(0.05, this.clock.getDelta());
    this.updateCameraMovement(delta);
    this.updateCombatFocus(delta);
    this.updateUnitInstances(delta);
    this.updateSelectionVisuals();
    this.updateGhost();
    this.updateRegions(this.snapshot?.regions ?? []);
    if (!this.settings.reducedMotion) {
      for (const object of this.scene.children) {
        if (object.userData.drift) object.rotation.y += delta * 0.01;
      }
      for (const visual of this.buildingVisuals.values()) {
        visual.group.traverse((object) => {
          if (typeof object.userData.spin === "number") object.rotation.z += object.userData.spin * delta;
        });
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updateCameraMovement(delta: number): void {
    let horizontal = 0;
    let vertical = 0;
    const bindings = this.settings.keybindings;
    if (this.keyState.has(bindings.cameraUp) || this.keyState.has("arrowup")) vertical -= 1;
    if (this.keyState.has(bindings.cameraDown) || this.keyState.has("arrowdown")) vertical += 1;
    if (this.keyState.has(bindings.cameraLeft) || this.keyState.has("arrowleft")) horizontal -= 1;
    if (this.keyState.has(bindings.cameraRight) || this.keyState.has("arrowright")) horizontal += 1;
    if (horizontal !== 0 || vertical !== 0) {
      const speed = 30 * delta * this.settings.cameraSpeed / this.zoom;
      const forward = new THREE.Vector3(-Math.cos(this.cameraAngle), 0, -Math.sin(this.cameraAngle));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      this.cameraTarget.addScaledVector(forward, -vertical * speed);
      this.cameraTarget.addScaledVector(right, horizontal * speed);
      this.cameraTarget.x = THREE.MathUtils.clamp(this.cameraTarget.x, -42, 42);
      this.cameraTarget.z = THREE.MathUtils.clamp(this.cameraTarget.z, -42, 42);
      this.updateCamera();
    }
  }

  private updateCombatFocus(delta: number): void {
    const focus = gameSession.getState().combatFocus;
    if (!focus) return;
    const target = new THREE.Vector3(focus.x, 0, focus.z);
    this.cameraTarget.lerp(target, Math.min(1, delta * 4.8));
    this.updateCamera();
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private groundPointFromPointer(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    return hit?.point ?? null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.updatePointer(event);
    if (event.button === 1) {
      this.middleDrag = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.dragCurrent = { ...this.dragStart };
    this.pointerMoved = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.updatePointer(event);
    if (this.middleDrag) {
      const dx = event.clientX - this.middleDrag.x;
      const dy = event.clientY - this.middleDrag.y;
      const scale = 0.095 / this.zoom;
      const forward = new THREE.Vector3(-Math.cos(this.cameraAngle), 0, -Math.sin(this.cameraAngle));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      this.cameraTarget.addScaledVector(right, -dx * scale);
      this.cameraTarget.addScaledVector(forward, dy * scale);
      this.middleDrag = { x: event.clientX, y: event.clientY };
      this.updateCamera();
      return;
    }
    this.updateHover();
    if (!this.dragStart || gameSession.getState().selectedBuildType) return;
    this.dragCurrent = { x: event.clientX, y: event.clientY };
    const dx = event.clientX - this.dragStart.x;
    const dy = event.clientY - this.dragStart.y;
    if (Math.hypot(dx, dy) > 6) {
      this.pointerMoved = true;
      gameSession.setSelectionBox({
        left: Math.min(this.dragStart.x, event.clientX),
        top: Math.min(this.dragStart.y, event.clientY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.button === 1) {
      this.middleDrag = null;
      return;
    }
    if (event.button !== 0) return;
    this.updatePointer(event);
    const snapshot = this.snapshot;
    if (!snapshot) return;

    if (gameSession.getState().selectedBuildType && snapshot.phase === "playing") {
      const point = this.groundPointFromPointer();
      if (point) gameSession.placeBuilding({ x: point.x, z: point.z });
    } else if (snapshot.phase === "deployment") {
      const regionId = this.pickRegion();
      const region = snapshot.regions.find((candidate) => candidate.id === regionId);
      if (region?.startCandidate) gameSession.selectStartRegion(region.id);
    } else if (this.pointerMoved && this.dragStart && this.dragCurrent) {
      this.selectUnitsInBox(this.dragStart, this.dragCurrent, event.shiftKey);
    } else {
      this.pickSelection(event.shiftKey);
    }
    this.dragStart = null;
    this.dragCurrent = null;
    this.pointerMoved = false;
    gameSession.setSelectionBox(null);
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.snapshot?.phase !== "playing") return;
    const pointerEvent = event as PointerEvent;
    this.updatePointer(pointerEvent);
    if (gameSession.getState().selectedBoatId !== null) {
      const point = this.groundPointFromPointer();
      if (point) gameSession.issueBoatOrder({ x: point.x, z: point.z });
      return;
    }
    const target = this.pickEnemyEntity();
    if (target) {
      gameSession.issueOrder({ type: "attack", targetId: target.id, targetKind: target.kind });
      return;
    }
    const point = this.groundPointFromPointer();
    if (point) {
      gameSession.issueOrder({
        type: this.isAttackModifier(event) ? "attackMove" : "move",
        target: { x: point.x, z: point.z },
      });
    }
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-event.deltaY * 0.001), 0.62, 2.25);
    this.updateCamera();
  };

  private isAttackModifier(event: MouseEvent): boolean {
    const binding = this.settings.keybindings.attackModifier;
    if (binding === "shift") return event.shiftKey;
    return event.getModifierState(binding) || event.getModifierState(binding.toUpperCase());
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
    const key = event.key === " " ? "space" : event.key.toLowerCase();
    const bindings = this.settings.keybindings;
    this.keyState.add(key);
    if (key === bindings.cancel || key === "escape") gameSession.cancelMode();
    if (key === bindings.pause || key === "space") {
      event.preventDefault();
      gameSession.togglePause();
    }
    if (key === bindings.rotateLeft) {
      this.cameraAngle -= Math.PI / 2;
      this.updateCamera();
    }
    if (key === bindings.rotateRight) {
      this.cameraAngle += Math.PI / 2;
      this.updateCamera();
    }
    if (/^[1-9]$/.test(key)) {
      const group = Number(key);
      if (event.ctrlKey || event.metaKey) this.controlGroups.set(group, [...gameSession.getState().selectedUnitIds]);
      else gameSession.selectUnits(this.controlGroups.get(group) ?? []);
    }
    const building = BUILD_SHORTCUTS[key];
    if (building && this.snapshot?.phase === "playing" && !event.ctrlKey && !event.metaKey) gameSession.setBuildType(building);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keyState.delete(event.key === " " ? "space" : event.key.toLowerCase());
  };

  private updateHover(): void {
    const regionId = this.pickRegion();
    gameSession.setHoveredRegion(regionId);
  }

  private pickRegion(): number | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.regionMeshes.values(), ...this.startRings.values()], false);
    return (hits[0]?.object.userData.regionId as number | undefined) ?? null;
  }

  private pickSelection(additive: boolean): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const boatHits = this.raycaster.intersectObjects([...this.boatVisuals.values()].map((visual) => visual.group), true);
    for (const hit of boatHits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object.userData.boatId === undefined) object = object.parent;
      const id = object?.userData.boatId as number | undefined;
      const boat = this.snapshot?.boats.find((candidate) => candidate.id === id && candidate.faction === "player");
      if (boat) {
        gameSession.selectBoat(boat.id);
        return;
      }
    }
    const blobHits = this.raycaster.intersectObjects([...this.squadBlobs.values()].map((blob) => blob.group), true);
    for (const hit of blobHits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object.userData.representativeUnitId === undefined) object = object.parent;
      const id = object?.userData.representativeUnitId as number | undefined;
      const unit = this.snapshot?.units.find((candidate) => candidate.id === id && candidate.faction === "player");
      if (unit) {
        gameSession.selectSquadFromUnit(unit.id, additive);
        return;
      }
    }
    const unitHits = this.raycaster.intersectObjects([...this.unitMeshes.values()], false);
    const unitHit = unitHits[0];
    if (unitHit?.object instanceof THREE.InstancedMesh && unitHit.instanceId !== undefined) {
      const id = this.unitIdsByMesh.get(unitHit.object)?.[unitHit.instanceId];
      const unit = this.snapshot?.units.find((candidate) => candidate.id === id && candidate.faction === "player");
      if (unit) {
        gameSession.selectSquadFromUnit(unit.id, additive);
        return;
      }
    }
    const buildingHits = this.raycaster.intersectObjects([...this.buildingVisuals.values()].map((visual) => visual.group), true);
    for (const hit of buildingHits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object.userData.buildingId === undefined) object = object.parent;
      const id = object?.userData.buildingId as number | undefined;
      const building = this.snapshot?.buildings.find((candidate) => candidate.id === id && candidate.faction === "player");
      if (building) {
        gameSession.selectBuilding(building.id);
        return;
      }
    }
    if (!additive) gameSession.selectRegion(this.pickRegion());
  }

  private pickEnemyEntity(): { id: number; kind: "unit" | "building" } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const blobHit = this.raycaster.intersectObjects([...this.squadBlobs.values()].map((blob) => blob.group), true)[0];
    if (blobHit) {
      let object: THREE.Object3D | null = blobHit.object;
      while (object && object.userData.representativeUnitId === undefined) object = object.parent;
      const id = object?.userData.representativeUnitId as number | undefined;
      const unit = this.snapshot?.units.find((candidate) => candidate.id === id && candidate.faction === "enemy");
      if (unit) return { id: unit.id, kind: "unit" };
    }
    const unitHit = this.raycaster.intersectObjects([...this.unitMeshes.values()], false)[0];
    if (unitHit?.object instanceof THREE.InstancedMesh && unitHit.instanceId !== undefined) {
      const id = this.unitIdsByMesh.get(unitHit.object)?.[unitHit.instanceId];
      const unit = this.snapshot?.units.find((candidate) => candidate.id === id && candidate.faction === "enemy");
      if (unit) return { id: unit.id, kind: "unit" };
    }
    const buildingHits = this.raycaster.intersectObjects([...this.buildingVisuals.values()].map((visual) => visual.group), true);
    for (const hit of buildingHits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object.userData.buildingId === undefined) object = object.parent;
      const id = object?.userData.buildingId as number | undefined;
      const building = this.snapshot?.buildings.find((candidate) => candidate.id === id && candidate.faction === "enemy");
      if (building) return { id: building.id, kind: "building" };
    }
    return null;
  }

  private selectUnitsInBox(
    start: { x: number; y: number },
    end: { x: number; y: number },
    additive: boolean,
  ): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    const selectedSquads = new Set<string>();
    for (const unit of this.snapshot?.units ?? []) {
      if (unit.faction !== "player") continue;
      const point = new THREE.Vector3(unit.position.x, 0.7, unit.position.z).project(this.camera);
      const screenX = rect.left + ((point.x + 1) / 2) * rect.width;
      const screenY = rect.top + ((1 - point.y) / 2) * rect.height;
      if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) selectedSquads.add(`${unit.type}:${unit.squadId}`);
    }
    const selected = (this.snapshot?.units ?? [])
      .filter((unit) => unit.faction === "player" && selectedSquads.has(`${unit.type}:${unit.squadId}`))
      .map((unit) => unit.id);
    gameSession.selectUnits(selected, additive);
  }

  private resize = (): void => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    this.camera.left = -35 * aspect;
    this.camera.right = 35 * aspect;
    this.camera.top = 35;
    this.camera.bottom = -35;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    });
  }
}
