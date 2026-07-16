import { useMemo, useState } from "react";
import { BIOMES, BUILDINGS, FRONTLINE_MAX_EXTRACTORS, FRONTLINE_MAX_GARRISON, FRONTLINE_MAX_MILITARY_BUILDINGS, FRONTLINE_MAX_TURRETS, FRONTLINE_TERRAIN_PROFILES } from "../game/config";
import { gameSession, type SessionState } from "../game/session";
import type { FrontlineAttackMode, GameSnapshot, Region } from "../game/types";

interface FrontlineHudProps {
  state: SessionState;
  snapshot: GameSnapshot;
}

const BUILD_ORDER = ["extractor", "vat", "wall", "turret", "relay", "port"] as const;
const ATTACK_MODES: Array<{ id: FrontlineAttackMode; label: string; detail: string }> = [
  { id: "invasion", label: "INVASION", detail: "Équilibrée" },
  { id: "rush", label: "RUÉE", detail: "Capture rapide" },
  { id: "siege", label: "SIÈGE", detail: "Brise les structures" },
];
const PERCENTAGES = [10, 25, 50, 75] as const;

function formatNumber(value: number): string {
  return Math.round(value).toString().padStart(3, "0");
}

function landReachable(regions: Region[], fromId: number, targetId: number): boolean {
  if (fromId === targetId) return true;
  const visited = new Set<number>([fromId]);
  const queue = [fromId];
  for (let index = 0; index < queue.length; index += 1) {
    const region = regions.find((candidate) => candidate.id === queue[index]);
    if (!region) continue;
    for (const neighborId of region.neighbors) {
      if (visited.has(neighborId)) continue;
      const neighbor = regions.find((candidate) => candidate.id === neighborId);
      if (!neighbor || neighbor.biome === "water") continue;
      if (neighborId === targetId) return true;
      visited.add(neighborId);
      queue.push(neighborId);
    }
  }
  return false;
}

function alliedLandReachable(regions: Region[], fromId: number, targetId: number): boolean {
  if (fromId === targetId) return true;
  const visited = new Set<number>([fromId]);
  const queue = [fromId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = regions.find((candidate) => candidate.id === queue[index]);
    if (!current) continue;
    for (const neighborId of current.neighbors) {
      if (visited.has(neighborId)) continue;
      const neighbor = regions.find((candidate) => candidate.id === neighborId);
      if (!neighbor || neighbor.biome === "water" || neighbor.owner !== "player") continue;
      if (neighbor.id === targetId) return true;
      visited.add(neighbor.id);
      queue.push(neighbor.id);
    }
  }
  return false;
}

function isCoastal(regions: Region[], region: Region): boolean {
  return region.neighbors.some((id) => regions.find((candidate) => candidate.id === id)?.biome === "water");
}

function RegionPanel({ state, snapshot }: FrontlineHudProps) {
  const [mode, setMode] = useState<FrontlineAttackMode>("invasion");
  const [percentage, setPercentage] = useState<10 | 25 | 50 | 75>(25);
  const [attackSourceId, setAttackSourceId] = useState<number | null>(null);
  const [transferPercentage, setTransferPercentage] = useState<10 | 25 | 50 | 75>(25);
  const [transferSourceId, setTransferSourceId] = useState<number | null>(null);
  const region = snapshot.regions.find((candidate) => candidate.id === state.selectedRegionId);
  const selectedBuilding = snapshot.buildings.find((building) => building.id === state.selectedBuildingId);
  const sourceCandidates = useMemo(() => {
    if (!region || region.owner === "player") return [];
    const directSources = region.neighbors
      .map((id) => snapshot.regions.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Region => !!candidate && candidate.owner === "player");
    const maritimeSources = snapshot.regions.filter((candidate) =>
      candidate.owner === "player" &&
      candidate.id !== region.id &&
      isCoastal(snapshot.regions, region) &&
      !landReachable(snapshot.regions, candidate.id, region.id) &&
      snapshot.buildings.some((building) => building.faction === "player" && building.type === "port" && building.regionId === candidate.id),
    );
    return [...new Map([...directSources, ...maritimeSources].map((candidate) => [candidate.id, candidate])).values()];
  }, [region, snapshot.buildings, snapshot.regions]);
  const selectedSourceId = sourceCandidates.some((candidate) => candidate.id === attackSourceId)
    ? attackSourceId
    : sourceCandidates[0]?.id ?? null;
  const selectedSource = sourceCandidates.find((candidate) => candidate.id === selectedSourceId);
  const transferSourceCandidates = useMemo(() => {
    if (!region || region.owner !== "player") return [];
    return snapshot.regions.filter((candidate) => {
      if (candidate.id === region.id || candidate.owner !== "player" || candidate.garrison.player < 2) return false;
      const landRoute = alliedLandReachable(snapshot.regions, candidate.id, region.id);
      const portRoute = !landRoute && isCoastal(snapshot.regions, candidate) && isCoastal(snapshot.regions, region) &&
        snapshot.buildings.some((building) => building.faction === "player" && building.type === "port" && building.regionId === candidate.id);
      return landRoute || portRoute;
    });
  }, [region, snapshot.buildings, snapshot.regions]);
  const selectedTransferSourceId = transferSourceCandidates.some((candidate) => candidate.id === transferSourceId)
    ? transferSourceId
    : transferSourceCandidates[0]?.id ?? null;
  const selectedTransferSource = transferSourceCandidates.find((candidate) => candidate.id === selectedTransferSourceId);
  const availableClones = snapshot.regions.reduce((total, candidate) => total + (candidate.owner === "player" ? candidate.garrison.player : 0), 0);
  if (!region) {
    if (selectedBuilding) {
      const definition = BUILDINGS[selectedBuilding.type];
      return <section className="selection-panel frontline-region-panel"><div className="selection-code">IMPLANT/{String(selectedBuilding.id).padStart(4, "0")}</div><p className="micro-label">STRUCTURE FRONTLINE</p><h3>{definition.name}</h3><div className="health-row"><span>INTÉGRITÉ</span><div><i style={{ width: `${selectedBuilding.hp / selectedBuilding.maxHp * 100}%` }} /></div><b>{Math.ceil(selectedBuilding.hp)}</b></div><div className="frontline-slot"><span>SECTEUR</span><b>{snapshot.regions.find((candidate) => candidate.id === selectedBuilding.regionId)?.name ?? "INCONNU"}</b></div><div className="order-reminder"><b>IMPLANT TERRITORIAL</b><br />LA STRUCTURE MODIFIE DIRECTEMENT LA GARNISON OU LE RENDEMENT DU SECTEUR.</div></section>;
    }
    return <section className="selection-panel empty-selection frontline-empty-selection"><p className="micro-label">FRONT // AUCUN SECTEUR</p><div className="reticle" aria-hidden="true"><i /><i /></div><p>Sélectionnez une région pour lire sa garnison et ouvrir un front.</p></section>;
  }
  const faction = region.owner === "enemy" ? "enemy" : "player";
  const isOwned = region.owner === "player";
  const canAttack = !isOwned && selectedSourceId !== null;
  const terrainProfile = FRONTLINE_TERRAIN_PROFILES[region.biome];
  const transferAmount = selectedTransferSource
    ? Math.min(Math.floor(selectedTransferSource.garrison.player * transferPercentage / 100), Math.max(0, FRONTLINE_MAX_GARRISON - region.garrison.player))
    : 0;
  const sectorBuildings = snapshot.buildings.filter((candidate) => candidate.regionId === region.id && candidate.faction === region.owner && candidate.type !== "core");
  const extractorCount = sectorBuildings.filter((candidate) => candidate.type === "extractor").length;
  const militaryCount = sectorBuildings.filter((candidate) => candidate.type === "turret" || candidate.type === "wall").length;
  const turretCount = sectorBuildings.filter((candidate) => candidate.type === "turret").length;
  const activeAttack = snapshot.frontlineAttacks.find((attack) => attack.sourceRegionId === region.id || attack.targetRegionId === region.id);
  return (
    <section className="selection-panel frontline-region-panel">
      <div className="selection-code">FRONT/{String(region.id + 1).padStart(2, "0")}</div>
      <p className="micro-label">SECTEUR {region.owner === "player" ? "ALLIÉ" : region.owner === "enemy" ? "HOSTILE" : "NEUTRE"}</p>
      <h3>{region.name}</h3>
      <div className="frontline-biome-line"><span>{BIOMES[region.biome].code}</span><small>{BIOMES[region.biome].name}</small>{region.owner === "neutral" ? <em className={`frontline-difficulty ${terrainProfile.difficulty}`}>{terrainProfile.difficulty === "low" ? "PRISE FACILE" : terrainProfile.difficulty === "high" ? "PRISE ARDUE" : "PRISE MOYENNE"}</em> : null}</div>
      <div className={`frontline-readouts ${region.owner === "enemy" ? "is-enemy" : region.owner === "neutral" ? "is-neutral" : ""}`}>
        <div><span>GARNISON</span><b>{region.owner === "neutral" ? formatNumber(region.neutralStrength) : formatNumber(region.garrison[faction])}</b></div>
        <div><span>DÉFENSE</span><b>{region.owner === "neutral" ? "NEUTRE" : `${Math.round(region.defense[faction])}%`}</b></div>
        <div><span>RENDEMENT</span><b>B{region.yields.biomass.toFixed(1)} · M{region.yields.ore.toFixed(1)}</b></div>
      </div>
      <div className="frontline-defense-bar"><i style={{ width: `${Math.min(100, region.defense[faction])}%` }} /></div>
      <div className="frontline-slot"><span>IMPLANTS BIOMÉCANIQUES</span><b>EXTRACTION {extractorCount}/{FRONTLINE_MAX_EXTRACTORS} · MILITAIRE {militaryCount}/{FRONTLINE_MAX_MILITARY_BUILDINGS}</b><small>{sectorBuildings.filter((building) => building.type !== "extractor").map((building) => BUILDINGS[building.type].shortName).join(" · ") || `TOURELLE ${turretCount}/${FRONTLINE_MAX_TURRETS} DISPONIBLE`}</small></div>
      {activeAttack ? <div className="frontline-operation"><span>OPÉRATION ACTIVE</span><b>{activeAttack.mode.toUpperCase()} · {Math.round(activeAttack.remaining)} CLONES</b><i style={{ width: `${activeAttack.progress * 100}%` }} /></div> : null}
      {isOwned ? (
        <div className="frontline-transfer-panel">
          <div className="frontline-control-label"><span>TRANSFERT DE GARNISON</span><small>RAPATRIER DES CLONES DEPUIS UN SECTEUR ALLIÉ CONNECTÉ</small></div>
          {selectedTransferSource ? <>
            <div className="frontline-source-list"><span>SOURCE DE RAPATRIEMENT</span>{transferSourceCandidates.map((source) => <button type="button" key={source.id} className={source.id === selectedTransferSourceId ? "is-selected" : ""} onClick={() => setTransferSourceId(source.id)}>{source.name}<small>{formatNumber(source.garrison.player)} CLONES</small></button>)}</div>
            <div className="frontline-percent-row">{PERCENTAGES.map((value) => <button type="button" key={value} className={transferPercentage === value ? "is-selected" : ""} onClick={() => setTransferPercentage(value)}>{value}%</button>)}</div>
            <button type="button" className="frontline-transfer-button" disabled={transferAmount < 1} onClick={() => selectedTransferSourceId !== null && gameSession.transferFrontlineGarrison(region.id, selectedTransferSourceId, transferPercentage)}><span>RAPATRIER LES CLONES</span><b>{formatNumber(transferAmount)}</b></button>
          </> : <div className="order-reminder"><b>AUCUNE SOURCE ALLIÉE</b><br />LES SECTEURS DOIVENT ÊTRE RELIÉS PAR UNE TERRE CONTRÔLÉE OU UN PORT.</div>}
        </div>
      ) : canAttack ? (
        <>
          <div className="frontline-target-banner"><span>CIBLE D’ASSAUT</span><b>{region.owner === "enemy" ? "HOSTILE" : "NEUTRE"}</b><small>{selectedSource && !region.neighbors.includes(selectedSource.id) ? "DÉBARQUEMENT MARITIME" : "FRONT TERRESTRE"} · FORCE GLOBALE {formatNumber(availableClones)} CLONES</small></div>
          {sourceCandidates.length > 1 ? <div className="frontline-source-list"><span>SECTEUR DE DÉPART</span>{sourceCandidates.map((source) => <button type="button" key={source.id} className={source.id === selectedSourceId ? "is-selected" : ""} onClick={() => setAttackSourceId(source.id)}>{source.name}<small>{formatNumber(source.garrison.player)} CLONES{snapshot.buildings.some((building) => building.faction === "player" && building.type === "port" && building.regionId === source.id) ? " · PORT" : ""}</small></button>)}</div> : null}
          <div className="frontline-control-label"><span>DOCTRINE D’ENGAGEMENT</span><small>LA GARNISON EST LA FORCE ET LE RISQUE</small></div>
          <div className="frontline-mode-grid">
            {ATTACK_MODES.map((attackMode) => <button type="button" key={attackMode.id} className={mode === attackMode.id ? "is-selected" : ""} onClick={() => setMode(attackMode.id)}><b>{attackMode.label}</b><small>{attackMode.detail}</small></button>)}
          </div>
          <div className="frontline-percent-row">{PERCENTAGES.map((value) => <button type="button" key={value} className={percentage === value ? "is-selected" : ""} onClick={() => setPercentage(value)}>{value}%</button>)}</div>
          <button type="button" className="frontline-launch-button" onClick={() => gameSession.launchFrontlineAttack(region.id, mode, percentage, selectedSourceId)}><span>LANCER L’OFFENSIVE</span><b>{percentage}% · {formatNumber(Math.floor(availableClones * percentage / 100))}</b></button>
        </>
      ) : <div className="order-reminder"><b>AUCUNE SOURCE DISPONIBLE</b><br />CAPTUREZ UNE FRONTIÈRE OU CONSTRUISEZ UN PORT CÔTIER.</div>}
    </section>
  );
}

function FrontlineBuildDock({ state, snapshot }: FrontlineHudProps) {
  const stock = snapshot.resources.player;
    return <section className="build-dock frontline-build-dock"><div className="dock-label"><span>IMPLANTS TERRITORIAUX</span><small>3 EXTRACTIONS · 1 MILITAIRE · PORT DIRECTEMENT CÔTIER</small></div><div className="build-options">{BUILD_ORDER.map((type) => {
    const definition = BUILDINGS[type];
    const affordable = (definition.cost.biomass ?? 0) <= stock.biomass && (definition.cost.ore ?? 0) <= stock.ore;
    const active = state.selectedBuildType === type;
    return <button type="button" key={type} className={active ? "active" : ""} disabled={!affordable} onClick={() => gameSession.setBuildType(active ? null : type)} title={definition.description}><span className="build-key">{definition.shortcut}</span><b>{definition.shortName}</b><span className="build-cost">{definition.cost.biomass ? <i>B{definition.cost.biomass}</i> : null}{definition.cost.ore ? <i>M{definition.cost.ore}</i> : null}</span></button>;
  })}</div></section>;
}

export function FrontlineHud({ state, snapshot }: FrontlineHudProps) {
  const stock = snapshot.resources.player;
  const owned = snapshot.regions.filter((region) => region.owner === "player").length;
  const land = snapshot.regions.filter((region) => region.biome !== "water").length;
  const operations = snapshot.frontlineAttacks.filter((attack) => attack.faction === "player");
  const garrisonedClones = snapshot.regions.reduce((total, region) => total + (region.owner === "player" ? region.garrison.player : 0), 0);
  const engagedClones = operations.reduce((total, operation) => total + operation.remaining, 0);
  const totalClones = Math.max(0, Math.round(garrisonedClones + engagedClones));
  return <div className="hud frontline-hud">
    <header className="hud-topbar"><div className="game-brand"><span>CW//FR</span><b>CLONE WAR</b></div><div className="resource-cluster"><div className="resource-readout"><span className="resource-glyph glyph-bio" /><div><span>BIO</span><strong>{formatNumber(stock.biomass)}</strong></div><small>+{stock.biomass.toFixed(1)}/s</small></div><div className="resource-readout"><span className="resource-glyph glyph-ore" /><div><span>MIN</span><strong>{formatNumber(stock.ore)}</strong></div><small>+{stock.ore.toFixed(1)}/s</small></div><div className="resource-readout clones-readout" title="Total de clones actuellement disponibles ou engagés"><span className="resource-glyph glyph-cln" /><div><span>CLN</span><strong>{formatNumber(totalClones)}</strong></div><small>CLONES</small></div><div className="resource-readout"><span>ADN</span><strong>{formatNumber(stock.research)}</strong></div><div className="resource-readout frontline-territory-readout"><span>FRONT</span><strong>{owned.toString().padStart(2, "0")}<small>/{land}</small></strong></div></div><div className="time-cluster"><span className="micro-label">FRONTLINE</span><strong>{Math.floor(snapshot.elapsedSeconds / 60).toString().padStart(2, "0")}:{Math.floor(snapshot.elapsedSeconds % 60).toString().padStart(2, "0")}</strong><button type="button" onClick={() => gameSession.togglePause()}>{snapshot.paused ? "REPRENDRE" : "PAUSE"}</button><button type="button" className="exit-button" onClick={() => gameSession.returnToMenu()} aria-label="Quitter la partie">×</button></div></header>
    <div className="hud-left"><div className="frontline-objective"><span>OBJECTIF DE FRONT</span><b>CONTRÔLER 70% DES TISSUS</b><i style={{ width: `${Math.min(100, owned / Math.max(1, land) * 100)}%` }} /></div></div>
    <div className="notification-stack" aria-live="polite">{snapshot.notifications.slice(-4).reverse().map((notification) => <div key={notification.id} className={`notification ${notification.tone}`}><i />{notification.text}</div>)}</div>
    <div className="hud-right"><RegionPanel state={state} snapshot={snapshot} /></div>
    <div className="frontline-operation-strip"><span>OPÉRATIONS</span>{operations.length === 0 ? <b>AUCUN FRONT ACTIF</b> : operations.map((operation) => <b key={operation.id}>{operation.mode.toUpperCase()} · {Math.round(operation.remaining)} CLONES · {Math.round(operation.progress * 100)}%</b>)}</div>
    <FrontlineBuildDock state={state} snapshot={snapshot} />
    <div className="control-strip"><span><b>CLIC GAUCHE</b> SECTEUR</span><span><b>10/25/50/75%</b> FORCE ENGAGÉE</span><span><b>PORT</b> ATTAQUE DISTANTE</span><span><b>P / ESPACE</b> PAUSE</span></div>
    {snapshot.paused ? <div className="pause-stamp"><span>FRONTLINE</span><strong>SUSPENDU</strong><small>P / ESPACE POUR REPRENDRE</small></div> : null}
  </div>;
}
