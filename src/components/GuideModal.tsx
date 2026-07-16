import { useState } from "react";
import { BIOMES, BOATS, BUILDINGS, UNITS } from "../game/config";

type GuideTab = "start" | "economy" | "arsenal" | "controls";

interface GuideModalProps {
  onClose: () => void;
}

const TABS: Array<{ id: GuideTab; label: string; index: string }> = [
  { id: "start", label: "PREMIÈRE PARTIE", index: "01" },
  { id: "economy", label: "BASE & RESSOURCES", index: "02" },
  { id: "arsenal", label: "CLONES & MUTATIONS", index: "03" },
  { id: "controls", label: "CONTRÔLES", index: "04" },
];

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="guide-section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function StartTab() {
  return (
    <div className="guide-content">
      <SectionHeading
        eyebrow="PROTOCOLE DE SURVIE"
        title="Votre mission est simple. Votre front ne l’est pas."
        text="Le mode Frontline transforme la carte en réseau de secteurs. Développez vos tissus, engagez une partie de vos garnisons, ouvrez plusieurs fronts puis réduisez le noyau rouge ou contrôlez 70 % du territoire."
      />
      <div className="guide-callout">
        <span className="guide-callout-code">OBJECTIF // 01</span>
        <strong>CONTRÔLER LE FRONT OU LE NOYAU</strong>
        <p>Le noyau reste protégé pendant les 75 premières secondes. Profitez de ce délai pour renforcer votre garnison, poser un implant et choisir votre premier secteur cible.</p>
      </div>
      <div className="guide-steps">
        <article><span>01</span><div><h3>Choisir un tissu</h3><p>Cliquez une région cerclée sur la carte. La forêt produit beaucoup de biomasse, la carrière beaucoup de minerai, la faille beaucoup d’énergie. Une plaine est équilibrée.</p></div></article>
        <article><span>02</span><div><h3>Lire la garnison</h3><p>Cliquez un secteur pour voir ses clones, sa défense et son emplacement biomécanique. Une région alliée peut lancer une attaque vers ses frontières.</p></div></article>
        <article><span>03</span><div><h3>Choisir une doctrine</h3><p>Invasion pour l’équilibre, Ruée pour capturer vite, Siège pour faire tomber les bâtiments. Engagez 10, 25, 50 ou 75 % de la garnison.</p></div></article>
        <article><span>04</span><div><h3>Implanter le territoire</h3><p>Chaque secteur possède un seul emplacement. Une Cuve ADN augmente la croissance, une Tourelle ou une Paroi renforce la défense, un Extracteur augmente les revenus.</p></div></article>
        <article><span>05</span><div><h3>Prendre l’initiative</h3><p>Les ports côtiers ouvrent des fronts distants. Les mutations ADN apparaissent pendant la partie et changent les règles de votre colonie.</p></div></article>
      </div>
      <div className="guide-tip"><b>CONSEIL DE DÉPART</b><span>Ne construisez pas toute la base d’un coup. Une seule ligne biomasse → stockage → cuve qui fonctionne vaut mieux que dix bâtiments hors tension.</span></div>
    </div>
  );
}

function EconomyTab() {
  const biomes = Object.entries(BIOMES) as Array<[keyof typeof BIOMES, typeof BIOMES[keyof typeof BIOMES]]>;
  const buildings = ["extractor", "waterExtractor", "conveyor", "generator", "storage", "port", "vat", "relay", "turret", "wall"] as const;
  return (
    <div className="guide-content">
      <SectionHeading
        eyebrow="INFRASTRUCTURE // 02"
        title="Une base est un circuit, pas une collection de bâtiments."
        text="En Frontline, les territoires produisent automatiquement. Les choix importants sont le biome, l’implant construit et la part de garnison que vous exposez sur chaque front."
      />
      <div className="guide-resource-grid">
        <article><span className="guide-resource-symbol symbol-bio">B</span><div><h3>BIOMASSE</h3><p>Produit les clones et les structures biologiques. Le noyau en fournit lentement, mais les régions forestières sont bien plus efficaces.</p></div></article>
        <article><span className="guide-resource-symbol symbol-ore">M</span><div><h3>MINERAI</h3><p>Construit convoyeurs, défenses et blindages. Les carrières ferriques sont les meilleures sources.</p></div></article>
        <article><span className="guide-resource-symbol symbol-water">A</span><div><h3>EAU</h3><p>Pompez-la depuis une terre qui borde un canal. Elle alimente les ports, les échanges et les transports amphibies.</p></div></article>
        <article><span className="guide-resource-symbol symbol-energy">D</span><div><h3>DÉFENSE</h3><p>Chaque garnison possède un pourcentage de défense. Les Bastions calcifiés, tourelles et défenses territoriales ralentissent les offensives.</p></div></article>
        <article><span className="guide-resource-symbol symbol-bio">G</span><div><h3>GARNISON</h3><p>Les clones grandissent automatiquement dans les secteurs possédés. Engager une garnison accélère la conquête mais fragilise immédiatement son territoire d’origine.</p></div></article>
      </div>
      <div className="guide-subheading"><span>RENDEMENTS DES RÉGIONS</span><small>BASE 1.00×</small></div>
      <div className="guide-biome-grid">
        {biomes.map(([id, biome]) => (
          <article key={id} style={{ "--biome-color": biome.color } as React.CSSProperties}>
            <div className="biome-swatch" /><div><h3>{biome.name}</h3><p>{biome.description}</p><span>B {biome.yields.biomass.toFixed(2)} · M {biome.yields.ore.toFixed(2)} · A {biome.yields.water.toFixed(2)} · E {biome.yields.energy.toFixed(2)}</span></div>
          </article>
        ))}
      </div>
      <div className="guide-subheading"><span>PLAN DE CONSTRUCTION</span><small>CLIQUEZ LE DOCK OU UTILISEZ LE RACCOURCI</small></div>
      <div className="guide-building-table">
        {buildings.map((id) => {
          const building = BUILDINGS[id];
          return <div key={id}><kbd>{building.shortcut ?? "—"}</kbd><strong>{building.name}</strong><span>{building.description}</span><em>{building.cost.biomass ? `B${building.cost.biomass} ` : ""}{building.cost.ore ? `M${building.cost.ore} ` : ""}{building.cost.water ? `A${building.cost.water}` : ""}</em></div>;
        })}
      </div>
    </div>
  );
}

function ArsenalTab() {
  const units = Object.entries(UNITS) as Array<[keyof typeof UNITS, typeof UNITS[keyof typeof UNITS]]>;
  return (
    <div className="guide-content">
      <SectionHeading
        eyebrow="BIOLOGIE DE COMBAT // 03"
        title="Chaque clone est une décision de production."
        text="Les cuves produisent des unités en continu. Mélangez les rôles : la vitesse capture, la portée nettoie, le blindage ouvre les structures."
      />
      <div className="guide-unit-grid">
        {units.map(([id, unit]) => (
          <article key={id} className={`unit-card unit-${id}`}>
            <div className="unit-card-top"><span>{unit.code}</span><b>{unit.name}</b></div>
            <p>{unit.description}</p>
            <div className="unit-stat-row"><span>PV <b>{unit.hp}</b></span><span>DÉGÂTS <b>{unit.damage}</b></span><span>VITESSE <b>{unit.speed.toFixed(1)}</b></span></div>
            <footer><span>B{unit.biomassCost} · M{unit.oreCost}</span><span>{unit.productionTime}s</span></footer>
          </article>
        ))}
      </div>
      <div className="guide-subheading"><span>TRANSPORTS &amp; ÉCHANGES</span><small>EAU + PORT</small></div>
      <div className="guide-mutation-list">
        {Object.values(BOATS).map((boat) => <div key={boat.code}><b>{boat.name}</b><span>{boat.capacity} places · {boat.speed.toFixed(1)} vitesse</span><em>A{boat.cost.water ?? 0} · {boat.description}</em></div>)}
      </div>
      <div className="guide-tip"><b>ROUTES PORTUAIRES</b><span>Deux ports actifs placés sur des terres séparées expédient automatiquement des navires d’échange. Plus la traversée est longue, plus le convoi rapporte de matériaux aux deux extrémités.</span></div>
      <div className="guide-subheading"><span>MUTATIONS ADN</span><small>LA CUVE ADN NIVEAU 2 OUVRE LES CHOIX À CHAQUE PALIER</small></div>
      <div className="guide-mutation-list">
        <div><b>GESTATION FLASH</b><span>+40 % vitesse de production</span><em>−10 % PV clones</em></div>
        <div><b>TISSU RENFORCÉ</b><span>+28 % PV clones</span><em>−10 % vitesse</em></div>
        <div><b>MÉTABOLISME SEC</b><span>−25 % biomasse par clone</span><em>+4 énergie par cuve</em></div>
        <div><b>SANG HYPERVELOCE</b><span>+65 % vitesse convoyeurs</span><em>×2 énergie convoyeurs</em></div>
        <div><b>BOUCLE NÉCROTIQUE</b><span>+4 biomasse par ennemi détruit</span><em>−12 % vision</em></div>
        <div><b>RÉTINE COLLECTIVE</b><span>+30 % vision</span><em>−8 % dégâts</em></div>
      </div>
    </div>
  );
}

function ControlsTab() {
  return (
    <div className="guide-content">
      <SectionHeading
        eyebrow="INTERFACE // 04"
        title="Les commandes qui comptent."
        text="Le prototype est pensé pour une souris et un clavier. Toutes les commandes importantes sont aussi visibles dans le bandeau inférieur pendant la partie."
      />
      <div className="guide-controls-grid">
        <div><kbd>CLIC GAUCHE</kbd><strong>Lire un secteur</strong><span>Ouvre sa garnison, sa défense, ses implants et ses fronts accessibles.</span></div>
        <div><kbd>10 / 25 / 50 / 75%</kbd><strong>Engager</strong><span>Choisit la part de garnison envoyée depuis le secteur sélectionné.</span></div>
        <div><kbd>INVASION / RUÉE / SIÈGE</kbd><strong>Doctrine</strong><span>Équilibre, vitesse de capture ou destruction des bâtiments.</span></div>
        <div><kbd>CLIC SUR UNE CÔTE</kbd><strong>Porter le front</strong><span>Un port autorise les offensives vers les autres territoires côtiers.</span></div>
        <div><kbd>CLIC + CONSTRUCTION</kbd><strong>Implanter</strong><span>Pose un bâtiment sur l’unique emplacement du secteur sélectionné.</span></div>
        <div><kbd>CLIC DROIT</kbd><strong>Commande classique</strong><span>Dans le ruleset Classique, conserve le déplacement et l’attaque-mouvement des escouades.</span></div>
        <div><kbd>W A S D</kbd><strong>Caméra</strong><span>Déplace la vue tactique. Les flèches fonctionnent aussi.</span></div>
        <div><kbd>MOLETTE</kbd><strong>Zoom</strong><span>Prend de la hauteur pour lire la carte ou se rapprocher d’une base.</span></div>
        <div><kbd>Q / E</kbd><strong>Rotation</strong><span>Tourne la vue isométrique par quart de tour.</span></div>
        <div><kbd>CTRL + 1…9</kbd><strong>Groupes</strong><span>Enregistre une escouade. Appuyez ensuite sur son numéro pour la rappeler.</span></div>
        <div><kbd>P / ESPACE</kbd><strong>Pause</strong><span>Suspend la simulation en solo pour réfléchir.</span></div>
        <div><kbd>ÉCHAP</kbd><strong>Annuler</strong><span>Quitte le mode construction ou efface le mode de sélection.</span></div>
      </div>
      <div className="guide-tip guide-tip-alarm"><b>SI VOUS ÊTES BLOQUÉ</b><span>Regardez le protocole à gauche de l’écran : il indique toujours la prochaine étape utile. Un chantier rouge signifie généralement qu’aucun ouvrier n’est à portée ou que la zone n’est pas à vous.</span></div>
    </div>
  );
}

export function GuideModal({ onClose }: GuideModalProps) {
  const [tab, setTab] = useState<GuideTab>("start");
  return (
    <div className="guide-scrim" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <section className="guide-modal">
        <header className="guide-header">
          <div><p className="eyebrow">MANUEL D’OPÉRATION // CF-01</p><h2 id="guide-title">CENTRE DE BRIEFING</h2></div>
          <div className="guide-header-meta"><span>VERSION PROTOTYPE</span><button type="button" onClick={onClose} aria-label="Fermer le guide">FERMER <b>×</b></button></div>
        </header>
        <div className="guide-layout">
          <nav className="guide-nav" aria-label="Sections du guide">
            <span className="guide-nav-label">INDEX</span>
            {TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><i>{item.index}</i><span>{item.label}</span><b>↗</b></button>)}
            <div className="guide-nav-note"><b>À RETENIR</b><span>Développez une ligne de production avant de chercher le combat.</span></div>
          </nav>
          <div className="guide-page">
            {tab === "start" ? <StartTab /> : null}
            {tab === "economy" ? <EconomyTab /> : null}
            {tab === "arsenal" ? <ArsenalTab /> : null}
            {tab === "controls" ? <ControlsTab /> : null}
          </div>
        </div>
        <footer className="guide-footer"><span>CW//01 — ARCHIVE D’APPRENTISSAGE</span><span>Les textures sont provisoires, les règles sont actives.</span></footer>
      </section>
    </div>
  );
}
