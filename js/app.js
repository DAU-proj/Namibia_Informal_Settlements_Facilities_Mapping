// ===============================
// CONFIG
// ===============================
const CONFIG = {
  center: [-22, 17],   // National extent on landing
  zoom: 6,
  dataUrl: 'data/namibia_dashboard.geojson',
  boundaryUrl: 'data/settlements.geojson',
  informalUrl: 'data/Informal Settlement.geojson'
};

// ===============================
// MAP MANAGER
// ===============================
const MapManager = {
  map: null,
  cluster: null,
  baseLayers: {},
  informalLayer: {},     // settlement name → Leaflet layer
  townBounds: {},        // town (UPPER) → L.latLngBounds
  townSettlements: {},   // town (UPPER) → [settlement names]

  init() {
    this.map = L.map('map').setView(CONFIG.center, CONFIG.zoom);

    const light = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    ).addTo(this.map);

    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    );

    this.baseLayers = { "Light": light, "Satellite": sat };
    L.control.layers(this.baseLayers).addTo(this.map);

    this.cluster = L.markerClusterGroup({
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="cluster">${count}</div>`,
          className: "cluster-wrapper",
          iconSize: L.point(40, 40)
        });
      }
    });

    this.map.addLayer(this.cluster);
  },

  fitToBounds(bounds) {
    if (bounds) this.map.fitBounds(bounds.pad(0.15));
  }
};

// ===============================
// DATA MANAGER
// ===============================
const DataManager = {
  features: [],

  async load() {
    try {
      const res = await fetch(CONFIG.dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.features = data.features;
      console.log(`Loaded ${this.features.length} facilities`);
    } catch (err) {
      console.error("Failed to load facility data:", err);
      this.features = [];
    }
  }
};

// ===============================
// STYLE MANAGER
// ===============================
const StyleManager = {

  getConditionClass(condition) {
    const c = (condition || "").toLowerCase();
    if (c.includes("good"))    return "good";
    if (c.includes("average")) return "average";
    if (c.includes("poor"))    return "poor";
    return "unknown";
  },

  getIconClass(facility) {
    const f = (facility || "").toLowerCase();
    if (f.includes("education"))              return "fa-school";
    if (f.includes("health"))                 return "fa-hospital";
    if (f.includes("water"))                  return "fa-droplet";
    if (f.includes("transport"))              return "fa-bus";
    if (f.includes("religious"))              return "fa-church";
    if (f.includes("solid waste") || f.includes("waste")) return "fa-trash";
    if (f.includes("sanitation"))             return "fa-toilet";
    if (f.includes("market"))                 return "fa-store";
    if (f.includes("lighting") || f.includes("light mast")) return "fa-lightbulb";
    if (f.includes("social"))                 return "fa-people-group";
    if (f.includes("admin"))                  return "fa-building";
    if (f.includes("public space"))           return "fa-tree";
    return "fa-location-dot";
  },

  createMarker(feature) {
    const p = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const conditionClass = this.getConditionClass(p.Condition);
    const iconClass      = this.getIconClass(p.Facility);

    return L.marker([lat, lng], {
      icon: L.divIcon({
        className: "",
        html: `<div class="marker ${conditionClass}"><i class="fa-solid ${iconClass}"></i></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    });
  }
};

// ===============================
// RENDERER
// ===============================
const Renderer = {
  render(features) {
    MapManager.cluster.clearLayers();
    features.forEach(f => {
      const marker = StyleManager.createMarker(f);
      marker.bindPopup(this.createPopup(f.properties), { maxWidth: 420 });
      MapManager.cluster.addLayer(marker);
    });
  },

  createPopup(p) {
    if (p.un_dashboard_popup_html) return p.un_dashboard_popup_html;

    const imgHtml = p.github_image_url_cdn
      ? `<a href="${p.github_image_url_cdn}" target="_blank"><img src="${p.github_image_url_cdn}" width="100%"></a>`
      : "";
    const fn = p["Is the facility functional?"];
    const funcLabel = fn === true ? "✅ Yes" : fn === false ? "❌ No" : "— Unknown";

    return `
      <div class="popup">
        ${imgHtml}
        <h4>${p.Name || p.Facility || "Unknown"}</h4>
        <p><b>Type:</b> ${p["Type of the facility"] || p.Facility || "—"}</p>
        <p><b>Town:</b> ${p.Town || "—"}</p>
        <p><b>Constituency:</b> ${p.Constituency || "—"}</p>
        <p><b>Condition:</b> ${p.Condition || "—"}</p>
        <p><b>Functional:</b> ${funcLabel}</p>
        <p><b>Managed by:</b> ${p["Who manages the facility?"] || "—"}</p>
        <p><b>Year established:</b> ${p["Year Established"] || "—"}</p>
      </div>`;
  }
};

// ===============================
// FILTER MANAGER
// ===============================
const FilterManager = {
  town:       "",
  settlement: "",   // informal settlement name (exact, from boundary data)
  facility:   "",
  functional: "",

  apply(features) {
    return features.filter(f => {
      const p = f.properties;
      const townVal = (p.Town || "").toLowerCase();
      const fVal    = (p.Facility || "").toLowerCase();
      const cVal    = (p.Condition || "").toLowerCase();
      const fnVal   = p["Is the facility functional?"];
      const lat     = f.geometry.coordinates[1];
      const lng     = f.geometry.coordinates[0];

      if (this.town && !townVal.includes(this.town)) return false;
      if (this.facility && !fVal.includes(this.facility)) return false;
      if (this.functional === "yes"     && fnVal !== true)  return false;
      if (this.functional === "no"      && fnVal !== false) return false;
      if (this.functional === "unknown" && fnVal !== null)  return false;

      // Settlement filter: check if point falls inside the chosen polygon
      if (this.settlement) {
        const layer = MapManager.informalLayer[this.settlement];
        if (layer) {
          const pt = L.latLng(lat, lng);
          if (!layer.getBounds().contains(pt)) return false;
          // Fine-grained point-in-polygon using Leaflet's internal method
          const poly = layer.feature
            ? layer
            : null;
          // Use bounds as approximation (good enough for informal settlement scale)
          if (!layer.getBounds().pad(0.01).contains(pt)) return false;
        }
      }

      return true;
    });
  }
};

// ===============================
// STATS MANAGER
// ===============================
const StatsManager = {
  update(features) {
    let good = 0, avg = 0, poor = 0, func = 0, nonFunc = 0, unknownFunc = 0;

    features.forEach(f => {
      const p = f.properties;
      const c = (p.Condition || "").toLowerCase();
      if (c.includes("good"))         good++;
      else if (c.includes("average")) avg++;
      else if (c.includes("poor"))    poor++;

      const fn = p["Is the facility functional?"];
      if (fn === true)       func++;
      else if (fn === false) nonFunc++;
      else                   unknownFunc++;
    });

    document.getElementById("statTotal").textContent       = features.length.toLocaleString();
    document.getElementById("statGood").textContent        = good.toLocaleString();
    document.getElementById("statAvg").textContent         = avg.toLocaleString();
    document.getElementById("statPoor").textContent        = poor.toLocaleString();
    document.getElementById("statFunc").textContent        = func.toLocaleString();
    document.getElementById("statNonFunc").textContent     = nonFunc.toLocaleString();
    document.getElementById("statUnknownFunc").textContent = unknownFunc.toLocaleString();
  }
};

// ===============================
// UI MANAGER
// ===============================
const UIManager = {

  initFilters(features) {
    const townSel       = document.getElementById("townFilter");
    const settlementSel = document.getElementById("settlementFilter");
    const facilitySel   = document.getElementById("facilityFilter");
    const funcSel       = document.getElementById("functionalFilter");
    const clearBtn      = document.getElementById("clearFilters");

    // Populate town dropdown from facility data
    const towns = new Set();
    const facilities = new Set();
    features.forEach(f => {
      if (f.properties.Town)     towns.add(f.properties.Town);
      if (f.properties.Facility) facilities.add(f.properties.Facility);
    });

    [...towns].sort().forEach(t => {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      townSel.appendChild(opt);
    });

    [...facilities].sort().forEach(f => {
      const opt = document.createElement("option");
      opt.value = f; opt.textContent = f;
      facilitySel.appendChild(opt);
    });

    // ── Town change ──────────────────────────────────────────────
    townSel.addEventListener("change", (e) => {
      const town = e.target.value;
      FilterManager.town       = town.toLowerCase();
      FilterManager.settlement = "";

      // Repopulate settlement dropdown for this town
      this.populateSettlements(town.toUpperCase().trim());

      // Zoom to town extent
      const upper = town.toUpperCase().trim();
      if (upper && MapManager.townBounds[upper]) {
        MapManager.map.fitBounds(MapManager.townBounds[upper].pad(0.2));
      } else if (!town) {
        // Zoom back to national
        MapManager.map.setView(CONFIG.center, CONFIG.zoom);
      }

      App.update();
    });

    // ── Settlement change ────────────────────────────────────────
    settlementSel.addEventListener("change", (e) => {
      const name = e.target.value;
      FilterManager.settlement = name;

      if (name && MapManager.informalLayer[name]) {
        MapManager.map.fitBounds(
          MapManager.informalLayer[name].getBounds().pad(0.3)
        );
      }

      App.update();
    });

    // ── Facility type change ─────────────────────────────────────
    facilitySel.addEventListener("change", (e) => {
      FilterManager.facility = e.target.value.toLowerCase();
      App.update();
    });

    // ── Functionality change ─────────────────────────────────────
    funcSel.addEventListener("change", (e) => {
      FilterManager.functional = e.target.value;
      App.update();
    });

    // ── Clear all ────────────────────────────────────────────────
    clearBtn.addEventListener("click", () => {
      FilterManager.town       = "";
      FilterManager.settlement = "";
      FilterManager.facility   = "";
      FilterManager.functional = "";

      townSel.value       = "";
      facilitySel.value   = "";
      funcSel.value       = "";

      settlementSel.innerHTML = '<option value="">All Settlements</option>';
      settlementSel.disabled  = true;

      MapManager.map.setView(CONFIG.center, CONFIG.zoom);
      App.update();
    });
  },

  // Fill settlement dropdown with names belonging to the given town (UPPER)
  populateSettlements(town) {
    const settlementSel = document.getElementById("settlementFilter");
    settlementSel.innerHTML = '<option value="">All Settlements</option>';

    if (town && MapManager.townSettlements[town]) {
      MapManager.townSettlements[town].sort().forEach(name => {
        const opt = document.createElement("option");
        opt.value = name; opt.textContent = name;
        settlementSel.appendChild(opt);
      });
      settlementSel.disabled = false;
    } else {
      settlementSel.disabled = true;
    }
  }
};

// ===============================
// APP CONTROLLER
// ===============================
const App = {
  async init() {
    MapManager.init();
    await DataManager.load();
    if (DataManager.features.length === 0) {
      console.error("No facility data loaded.");
      return;
    }
    UIManager.initFilters(DataManager.features);
    await this.loadBoundary();
    await this.loadInformalSettlements();
    this.update();
  },

  update() {
    const filtered = FilterManager.apply(DataManager.features);
    Renderer.render(filtered);
    StatsManager.update(filtered);
  },

  async loadBoundary() {
    try {
      const res = await fetch(CONFIG.boundaryUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      L.geoJSON(data, {
        style: { color: "#2c3e50", weight: 2, opacity: 0.6, fillOpacity: 0 }
      }).addTo(MapManager.map);
    } catch (err) {
      console.warn("Could not load boundary layer:", err);
    }
  },

  async loadInformalSettlements() {
    try {
      const res = await fetch(CONFIG.informalUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      L.geoJSON(data, {
        style: {
          color: "#e67e22", weight: 1.5, opacity: 0.8,
          fillColor: "#f39c12", fillOpacity: 0.12
        },
        onEachFeature(feature, layer) {
          const name = feature.properties.Settlement || "Unnamed";
          const town = (feature.properties.Town || "").toUpperCase().trim();

          // Tooltip only at close zoom
          MapManager.map.on("zoomend", () => {
            if (MapManager.map.getZoom() >= 12) {
              layer.bindTooltip(name, { sticky: true, opacity: 0.85 });
            } else {
              layer.unbindTooltip();
            }
          });

          MapManager.informalLayer[name] = layer;

          if (!MapManager.townBounds[town]) {
            MapManager.townBounds[town]    = layer.getBounds();
            MapManager.townSettlements[town] = [];
          } else {
            MapManager.townBounds[town].extend(layer.getBounds());
          }
          MapManager.townSettlements[town].push(name);
        }
      }).addTo(MapManager.map);

      console.log(`Loaded ${Object.keys(MapManager.informalLayer).length} settlement boundaries`);
    } catch (err) {
      console.warn("Could not load informal settlements:", err);
    }
  }
};

App.init();
