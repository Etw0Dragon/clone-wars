import { useMemo } from "react";
import { BIOMES, BOATS, BUILDINGS, MUTATION_THRESHOLDS, UNITS } from "../game/config";
import { gameSession, type SessionState } from "../game/session";
import { loadSettings } from "../game/persistence";
import type { Boat, BoatType, BuildingType, GameSnapshot, UnitType } from "../game/types";
import { MiniMap } from "./MiniMap";

interface HudProps {
  state: SessionState;
  snapshot: GameSnapshot;
}

const BUILD_ORDER: BuildingType[] = [
  "core", "bioExtractor", "oreExtractor", "conveyor", "generator", "storage",
  "waterExtractor", "port", "vat", "relay", "turret", "lab", "wall",
];
const UNIT_ORDER: UnitType[] = ["worker", "scout", "assault", "breaker"];

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function ResourceReadout({ code, value, rate }: { code: string; value: number; rate?: string }) {
  return (
    <div className="resource-readout">
      <span className={`resource-glyph glyph-${code.toLowerCase()}`} />
      <div><span>{code}</span><strong>{Math.floor(value).toString().padStart(3, "0")}</strong></div>
      {rate ? <small>{rate}</small> : null}
    </div>
  );
}

function TutorialProtocol({ snapshot, visible }: { snapshot: GameSnapshot; visible: boolean }) {
  if (!visible) return null;
  const playerBuildings = snapshot.buildings.filter((building) => building.faction === "player");
  const playerUnits = snapshot.units.filter((unit) => unit.faction === "player");
  const steps = [
    { label: "IMPLANTER LE NOYAU", done: playerBuildings.some((building) => building.type === "core") },
    { label: "EXTRAIRE ET STOCKER", done: playerBuildings.some((building) => building.type === "storage") && playerBuildings.some((building) => building.type === "bioExtractor" || building.type === "oreExtractor") },
    { label: "PRODUIRE UN CLONE", done: snapshot.stats.clonesProduced > 0 || playerUnits.length > 4 },
    { label: "ASSIMILER UN SECTEUR", done: snapshot.regions.filter((region) => region.owner === "player").length > 1 },
    { label: "DÉTRUIRE LE NOYAU RIVAL", done: snapshot.phase === "victory" },
  ];
  const current = Math.max(0, steps.findIndex((step) => !step.done));
  return (
    <section className="protocol-panel">
      <div className="protocol-title"><span>PROTOCOLE ACTIF</span><b>{String(current + 1).padStart(2, "0")}/05</b></div>
      {steps.map((step, index) => (
        <div key={step.label} className={`protocol-step ${step.done ? "done" : ""} ${index === current ? "current" : ""}`}>
          <i>{step.done ? "✓" : String(index + 1).padStart(2, "0")}</i><span>{step.label}</span>
        </div>
      ))}
    </section>
  );
}

function BuildDock({ state, snapshot }: HudProps) {
  const stock = snapshot.resources.player;
  return (
    <section className="build-dock">
      <div className="dock-label"><span>CONSTRUCTION</span><small>ÉCHAP POUR ANNULER</small></div>
      <div className="build-options">
        {BUILD_ORDER.map((type, index) => {
          const definition = BUILDINGS[type];
          const affordable = (definition.cost.biomass ?? 0) <= stock.biomass && (definition.cost.ore ?? 0) <= stock.ore;
          const coreAlreadyPlaced = type === "core" && snapshot.buildings.some((building) => building.faction === "player" && building.type === "core");
          const active = state.selectedBuildType === type;
          return (
            <button
              type="button"
              key={type}
              className={active ? "active" : ""}
              disabled={!affordable || coreAlreadyPlaced}
              onClick={() => gameSession.setBuildType(active ? null : type)}
              title={`${definition.name} — ${definition.description}`}
            >
              <span className="build-key">{definition.shortcut ?? index + 1}</span>
              <b>{definition.shortName}</b>
              <span className="build-cost">
                {(definition.cost.biomass ?? 0) > 0 ? <i>B{definition.cost.biomass}</i> : null}
                {(definition.cost.ore ?? 0) > 0 ? <i>M{definition.cost.ore}</i> : null}
                {(definition.cost.water ?? 0) > 0 ? <i>A{definition.cost.water}</i> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BoatPanel({ boat, snapshot, selectedUnitIds }: { boat: Boat; snapshot: GameSnapshot; selectedUnitIds: number[] }) {
  const definition = BOATS[boat.type];
  const freeSlots = boat.capacity - boat.passengerIds.length;
  const candidates = snapshot.units.filter((unit) =>
    unit.faction === "player" && Math.hypot(unit.position.x - boat.position.x, unit.position.z - boat.position.z) <= 13,
  );
  const selected = candidates.filter((unit) => selectedUnitIds.includes(unit.id));
  const loadingCount = Math.min(freeSlots, selected.length);
  const maxCount = Math.min(freeSlots, candidates.length);
  return (
    <section className="selection-panel boat-selection-panel">
      <div className="selection-code">COQUE/{boat.id.toString().padStart(4, "0")}</div>
      <p className="micro-label">TRANSPORT AMPHIBIE</p>
      <h3>{definition.name}</h3>
      <div className="health-row"><span>INTÉGRITÉ</span><div><i style={{ width: `${boat.hp / boat.maxHp * 100}%` }} /></div><b>{Math.ceil(boat.hp)}</b></div>
      <div className="boat-status"><span>CALE</span><strong>{boat.passengerIds.length}/{boat.capacity}</strong><small>{boat.state === "sailing" ? "EN TRAVERSÉE" : "À QUAI"}</small></div>
      <p className="boat-description">{definition.description}</p>
      <div className="boat-manifest-header"><span>MANIFESTE À PORTÉE</span><b>{candidates.length} DISP.</b></div>
      <div className="boat-manifest">
        {candidates.map((unit) => (
          <button type="button" key={unit.id} className={selectedUnitIds.includes(unit.id) ? "is-selected" : ""} onClick={() => gameSession.toggleBoatPassengerCandidate(unit.id)} disabled={boat.state !== "moored"}>
            <span>{UNITS[unit.type].code}</span><small>#{unit.id.toString().padStart(3, "0")}</small>
          </button>
        ))}
        {candidates.length === 0 ? <p>Aucun clone n’est assez proche du quai.</p> : null}
      </div>
      <div className="boat-load-actions">
        <button type="button" className="boat-max-button" disabled={boat.state !== "moored" || maxCount === 0} onClick={() => gameSession.boardBoatMaximum()}>MAX <span>+{maxCount}</span></button>
        <button type="button" className="boat-board-button" disabled={boat.state !== "moored" || loadingCount === 0} onClick={() => gameSession.boardSelectedBoat()}>EMBARQUER {loadingCount}</button>
      </div>
      <div className="order-reminder"><b>CLIC DROIT SUR UNE TERRE</b><br />TRAVERSER PUIS DÉBARQUER</div>
    </section>
  );
}

function SelectionPanel({ state, snapshot, bindings }: HudProps & { bindings: ReturnType<typeof loadSettings>["keybindings"] }) {
  const selectedBuilding = snapshot.buildings.find((building) => building.id === state.selectedBuildingId);
  const selectedUnits = snapshot.units.filter((unit) => state.selectedUnitIds.includes(unit.id));
  const selectedBoat = snapshot.boats.find((boat) => boat.id === state.selectedBoatId);
  if (selectedBoat) return <BoatPanel boat={selectedBoat} snapshot={snapshot} selectedUnitIds={state.selectedUnitIds} />;
  if (selectedBuilding) {
    const definition = BUILDINGS[selectedBuilding.type];
    return (
      <section className="selection-panel">
        <div className="selection-code">OBJ/{selectedBuilding.id.toString().padStart(4, "0")}</div>
        <p className="micro-label">STRUCTURE SÉLECTIONNÉE</p>
        <h3>{definition.name}</h3>
        <div className="health-row"><span>INTÉGRITÉ</span><div><i style={{ width: `${selectedBuilding.hp / selectedBuilding.maxHp * 100}%` }} /></div><b>{Math.ceil(selectedBuilding.hp)}</b></div>
        <div className="status-grid">
          <span><i className={selectedBuilding.powered ? "status-on" : "status-off"} />{selectedBuilding.powered ? "SOUS TENSION" : "HORS RÉSEAU"}</span>
          <span>{selectedBuilding.construction >= 1 ? "OPÉRATIONNEL" : `CHANTIER ${Math.floor(selectedBuilding.construction * 100)}%`}</span>
        </div>
        {selectedBuilding.type === "core" ? (
          <div className="core-autonomy"><span>RACINES AUTONOMES</span><b>+0,20 BIO/s</b><b>+0,10 MIN/s</b><small>La perte du noyau entraîne les structures de sa colonie.</small></div>
        ) : null}
        {selectedBuilding.type === "vat" ? (
          <>
            <div className="queue-line"><span>FILE DE GESTATION</span><b>{selectedBuilding.queue.length}/12</b></div>
            <div className="clone-buttons">
              {UNIT_ORDER.map((type) => {
                const unit = UNITS[type];
                return <button type="button" key={type} onClick={() => gameSession.queueClone(type, selectedBuilding.id)} title={unit.description}><span>{unit.code}</span><b>B{unit.biomassCost} M{unit.oreCost}</b></button>;
              })}
            </div>
          </>
        ) : null}
        {selectedBuilding.type === "port" ? (
          <>
            <div className="queue-line"><span>FLOTTE DU PORT</span><b>{selectedBuilding.boatQueue.length}/3</b></div>
            <div className="boat-buttons">
              {(Object.keys(BOATS) as BoatType[]).map((type) => {
                const boat = BOATS[type];
                return <button type="button" key={type} onClick={() => gameSession.queueBoat(type, selectedBuilding.id)} title={boat.description}><span>{boat.code}</span><b>B{boat.cost.biomass} M{boat.cost.ore} A{boat.cost.water}</b><small>{boat.capacity} PLACES</small></button>;
              })}
            </div>
            <div className="fleet-list">
              {snapshot.boats.filter((boat) => boat.faction === "player" && boat.portId === selectedBuilding.id).map((boat) => (
                <button type="button" key={boat.id} onClick={() => gameSession.selectBoat(boat.id)}><span>{BOATS[boat.type].code}</span><b>{boat.passengerIds.length}/{boat.capacity}</b><small>{boat.state === "sailing" ? "MER" : "QUAI"}</small></button>
              ))}
              {snapshot.boats.filter((boat) => boat.faction === "player" && boat.portId === selectedBuilding.id).length === 0 ? <p>Pas encore de coque prête.</p> : null}
            </div>
            <div className="trade-line"><span>ÉCHANGES ACTIFS</span><b>{snapshot.tradeShips.filter((ship) => ship.originPortId === selectedBuilding.id || ship.destinationPortId === selectedBuilding.id).length}</b><small>routes entre terres séparées</small></div>
          </>
        ) : null}
        <div className="selection-actions">
          <button type="button" onClick={() => gameSession.repairSelected()} disabled={selectedBuilding.hp >= selectedBuilding.maxHp}>RÉPARER</button>
          {selectedBuilding.type !== "core" ? <button type="button" onClick={() => gameSession.sellSelected()}>RECYCLER</button> : null}
        </div>
      </section>
    );
  }
  if (selectedUnits.length > 0) {
    const counts = UNIT_ORDER.map((type) => ({ type, count: selectedUnits.filter((unit) => unit.type === type).length })).filter((entry) => entry.count > 0);
    const hp = selectedUnits.reduce((sum, unit) => sum + unit.hp, 0);
    const maxHp = selectedUnits.reduce((sum, unit) => sum + unit.maxHp, 0);
    return (
      <section className="selection-panel unit-selection-panel">
        <div className="selection-code">ESSAIM/{selectedUnits.length.toString().padStart(3, "0")}</div>
        <p className="micro-label">ESCOUADES SÉLECTIONNÉES</p>
        <h3>{selectedUnits.length} CLONES ACTIFS</h3>
        <div className="health-row"><span>COHÉSION</span><div><i style={{ width: `${hp / Math.max(1, maxHp) * 100}%` }} /></div><b>{Math.round(hp / Math.max(1, maxHp) * 100)}%</b></div>
        <div className="unit-composition">
          {counts.map(({ type, count }) => <span key={type}><i>{UNITS[type].code}</i><b>{count}</b></span>)}
        </div>
        <div className="order-reminder"><b>CLIC DROIT</b> DÉPLACER<br /><b>{bindings.attackModifier.toUpperCase()} + CLIC DROIT</b> ATTAQUE-MOUVEMENT</div>
      </section>
    );
  }
  return (
    <section className="selection-panel empty-selection">
      <p className="micro-label">AUCUN SIGNAL SÉLECTIONNÉ</p>
      <div className="reticle" aria-hidden="true"><i /><i /></div>
      <p>Tracez un rectangle sur vos clones ou cliquez une structure pour ouvrir ses commandes.</p>
    </section>
  );
}

export function Hud({ state, snapshot }: HudProps) {
  const settings = useMemo(() => loadSettings(), []);
  const bindings = settings.keybindings;
  const stock = snapshot.resources.player;
  const owned = snapshot.regions.filter((region) => region.owner === "player").length;
  const researchLevel = snapshot.mutations.player.length;
  const nextResearch = MUTATION_THRESHOLDS[researchLevel] ?? MUTATION_THRESHOLDS.at(-1)!;
  const focusRegion = snapshot.regions.find((region) => region.id === state.hoveredRegionId);
  const latestNotifications = snapshot.notifications.slice(-4).reverse();

  return (
    <div className="hud">
      <header className="hud-topbar">
        <div className="game-brand"><span>CW//01</span><b>CLONE WAR</b></div>
        <div className="resource-cluster">
          <ResourceReadout code="BIO" value={stock.biomass} />
          <ResourceReadout code="MIN" value={stock.ore} />
          <ResourceReadout code="EAU" value={stock.water} />
          <ResourceReadout code="NRJ" value={stock.energyProduced - stock.energyUsed} rate={`${Math.ceil(stock.energyUsed)}/${Math.floor(stock.energyProduced)}`} />
          <div className="research-readout"><span>ADN</span><div><i style={{ width: `${Math.min(100, stock.research / nextResearch * 100)}%` }} /></div><b>{Math.floor(stock.research)}/{nextResearch}</b></div>
        </div>
        <div className="time-cluster">
          <span className="micro-label">DURÉE EXP.</span>
          <strong>{formatTime(snapshot.elapsedSeconds)}</strong>
          <button type="button" onClick={() => gameSession.togglePause()}>{snapshot.paused ? "REPRENDRE" : "PAUSE"}</button>
          <button type="button" className="exit-button" onClick={() => gameSession.returnToMenu()} aria-label="Quitter la partie">×</button>
        </div>
      </header>

      <div className="hud-left">
        <TutorialProtocol snapshot={snapshot} visible={settings.tutorialVisible} />
        {snapshot.shieldSeconds > 0 ? (
          <div className="shield-notice"><span>BOUCLIER DE NOYAU</span><b>{Math.ceil(snapshot.shieldSeconds)}s</b><i style={{ width: `${snapshot.shieldSeconds / 75 * 100}%` }} /></div>
        ) : null}
        {focusRegion ? (
          <div className="hover-region">
            <span>{BIOMES[focusRegion.biome].code}/{focusRegion.id + 1}</span>
            <b>{focusRegion.name}</b>
            <small>B {focusRegion.yields.biomass.toFixed(1)} · M {focusRegion.yields.ore.toFixed(1)} · E {focusRegion.yields.energy.toFixed(1)}</small>
          </div>
        ) : null}
      </div>

      <div className="notification-stack" aria-live="polite">
        {latestNotifications.map((notification) => <div key={notification.id} className={`notification ${notification.tone}`}><i />{notification.text}</div>)}
      </div>
      {state.combatFocus ? (
        <div className="combat-focus-panel">
          <span>ENGAGEMENT DÉTECTÉ</span>
          <button type="button" onClick={() => gameSession.cancelCombatFocus()}>ANNULER LE FOCUS</button>
        </div>
      ) : null}

      <div className="hud-right"><SelectionPanel state={state} snapshot={snapshot} bindings={bindings} /></div>
      <div className="hud-bottom-left"><MiniMap snapshot={snapshot} /><div className="territory-count"><span>SECTEURS</span><b>{owned.toString().padStart(2, "0")}<small>/{snapshot.regions.length}</small></b></div></div>
      <BuildDock state={state} snapshot={snapshot} />

      <div className="control-strip">
        <span><b>{bindings.cameraUp.toUpperCase()}/{bindings.cameraLeft.toUpperCase()}/{bindings.cameraDown.toUpperCase()}/{bindings.cameraRight.toUpperCase()}</b> CAMÉRA</span><span><b>{bindings.rotateLeft.toUpperCase()}/{bindings.rotateRight.toUpperCase()}</b> ROTATION</span><span><b>MOLETTE</b> ZOOM</span><span><b>CTRL+1…9</b> GROUPES</span><span><b>{bindings.pause.toUpperCase()}</b> PAUSE</span>
      </div>
      {snapshot.paused ? <div className="pause-stamp"><span>SIMULATION</span><strong>SUSPENDUE</strong><small>{bindings.pause.toUpperCase()} / ESPACE POUR REPRENDRE</small></div> : null}
    </div>
  );
}
