// ===============================
// CONFIG
// ===============================
const CONFIG = {
  center: [-22.559, 17.083], // Default to Windhoek (77% of data)
  zoom: 12,
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
  informalLayer: null,    // settlement name → layer
  townBounds: {},         // town (upper) → L.latLngBounds
  townSettlements: {},    // town (upper) → [settlement names]

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

  // [LOW] Removed permanent maxBounds lock — only used for initial boundary fit
  fitToBounds(bounds) {
    if (!bounds) return;
    this.map.fitBounds(bounds.pad(0.3));
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
    if (c.includes("good")) return "good";
    if (c.includes("average")) return "average";
    if (c.includes("poor")) return "poor";
    return "unknown";
  },

  getIconClass(facility) {
    const f = (facility || "").toLowerCase();
    if (f.includes("education")) return "fa-school";
    if (f.includes("health")) return "fa-hospital";
    if (f.includes("water")) return "fa-droplet";
    if (f.includes("transport")) return "fa-bus";
    if (f.includes("religious")) return "fa-church";
    if (f.includes("waste")) return "fa-trash";
    if (f.includes("sanitation")) return "fa-toilet";
    if (f.includes("market")) return "fa-store";
    if (f.includes("lighting") || f.includes("light")) return "fa-lightbulb";
    if (f.includes("social")) return "fa-people-group";
    if (f.includes("admin")) return "fa-building";
    if (f.includes("public space")) return "fa-tree";
    return "fa-location-dot";
  },

  createMarker(feature) {
    const p = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;

    const conditionClass = this.getConditionClass(p.Condition);
    const iconClass = this.getIconClass(p.Facility);

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
      // [QUICK WIN] Use the rich pre-built popup from the data
      marker.bindPopup(this.createPopup(f.properties), { maxWidth: 420 });
      MapManager.cluster.addLayer(marker);
    });
  },

  createPopup(p) {
    // Use un_dashboard_popup_html if available, otherwise build enhanced fallback
    if (p.un_dashboard_popup_html) {
      return p.un_dashboard_popup_html;
    }
    // Enhanced fallback with more fields
    const imgHtml = p.github_image_url_cdn
      ? `<a href="${p.github_image_url_cdn}" target="_blank"><img src="${p.github_image_url_cdn}" width="100%"></a>`
      : "";
    const functional = p["Is the facility functional?"];
    const funcLabel = functional === true ? "✅ Yes"
                    : functional === false ? "❌ No"
                    : "— Unknown";
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
      </div>
    `;
  }
};

// ===============================
// FILTER MANAGER
// ===============================
const FilterManager = {
  town: "",
  facility: "",
  condition: "",
  functional: "",   // [HIGH] new functional status filter

  apply(features) {
    return features.filter(f => {
      const p = f.properties;
      const townVal = (p.Town || "").toLowerCase();
      const fVal = (p.Facility || "").toLowerCase();
      const cVal = (p.Condition || "").toLowerCase();
      const funcVal = p["Is the facility functional?"];

      if (this.town && !townVal.includes(this.town)) return false;
      if (this.facility && !fVal.includes(this.facility)) return false;
      if (this.condition && !cVal.includes(this.condition)) return false;

      if (this.functional === "yes" && funcVal !== true) return false;
      if (this.functional === "no" && funcVal !== false) return false;
      if (this.functional === "unknown" && funcVal !== null) return false;

      return true;
    });
  }
};

// ===============================
// STATS MANAGER
// ===============================
const StatsManager = {
  update(features) {
    const total = features.length;
    let good = 0, avg = 0, poor = 0, func = 0, nonFunc = 0, unknownFunc = 0;

    features.forEach(f => {
      const p = f.properties;
      const c = (p.Condition || "").toLowerCase();
      if (c.includes("good")) good++;
      else if (c.includes("average")) avg++;
      else if (c.includes("poor")) poor++;

      const fn = p["Is the facility functional?"];
      if (fn === true) func++;
      else if (fn === false) nonFunc++;
      else unknownFunc++;
    });

    document.getElementById("statTotal").textContent = total.toLocaleString();
    document.getElementById("statGood").textContent = good.toLocaleString();
    document.getElementById("statAvg").textContent = avg.toLocaleString();
    document.getElementById("statPoor").textContent = poor.toLocaleString();
    document.getElementById("statFunc").textContent = func.toLocaleString();
    document.getElementById("statNonFunc").textContent = nonFunc.toLocaleString();
    document.getElementById("statUnknownFunc").textContent = unknownFunc.toLocaleString();
  }
};

// ===============================
// UI MANAGER
// ===============================
const UIManager = {
  initFilters(features) {
    const townSelect      = document.getElementById("townFilter");
    const facilitySelect  = document.getElementById("facilityFilter");
    const conditionSelect = document.getElementById("conditionFilter");
    const funcSelect      = document.getElementById("functionalFilter");
    const clearBtn        = document.getElementById("clearFilters");

    if (!townSelect || !facilitySelect || !conditionSelect) {
      console.warn("One or more filter dropdowns not found in DOM");
      return;
    }

    const towns = new Set();
    const facilities = new Set();
    const conditions = new Set();

    features.forEach(f => {
      if (f.properties.Town) towns.add(f.properties.Town);
      if (f.properties.Facility) facilities.add(f.properties.Facility);
      if (f.properties.Condition) conditions.add(f.properties.Condition);
    });

    [...towns].sort().forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      townSelect.appendChild(opt);
    });

    [...facilities].sort().forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      facilitySelect.appendChild(opt);
    });

    [...conditions].sort().forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      conditionSelect.appendChild(opt);
    });

    // [MEDIUM] Sync sidebar town filter with legend nav
    townSelect.addEventListener("change", (e) => {
      FilterManager.town = e.target.value.toLowerCase();
      this.syncTownNav(e.target.value);
      App.update();
    });

    facilitySelect.addEventListener("change", (e) => {
      FilterManager.facility = e.target.value.toLowerCase();
      App.update();
    });

    conditionSelect.addEventListener("change", (e) => {
      FilterManager.condition = e.target.value.toLowerCase();
      App.update();
    });

    // [HIGH] Functional status filter
    funcSelect.addEventListener("change", (e) => {
      FilterManager.functional = e.target.value;
      App.update();
    });

    // [MEDIUM] Clear all filters button
    clearBtn.addEventListener("click", () => {
      FilterManager.town = "";
      FilterManager.facility = "";
      FilterManager.condition = "";
      FilterManager.functional = "";

      townSelect.value = "";
      facilitySelect.value = "";
      conditionSelect.value = "";
      funcSelect.value = "";

      // Reset legend nav too
      const townNav = document.getElementById("townNav");
      const settlementNav = document.getElementById("settlementNav");
      if (townNav) townNav.value = "";
      if (settlementNav) {
        settlementNav.innerHTML = '<option value="">— Select settlement —</option>';
        settlementNav.disabled = true;
      }

      App.update();
    });
  },

  // [MEDIUM] Keep legend town nav in sync when sidebar town filter changes
  syncTownNav(townName) {
    const townNav = document.getElementById("townNav");
    const settlementNav = document.getElementById("settlementNav");
    if (!townNav) return;

    const upper = townName.toUpperCase().trim();
    townNav.value = upper;

    // Zoom to town if bounds available
    if (upper && MapManager.townBounds[upper]) {
      MapManager.map.fitBounds(MapManager.townBounds[upper].pad(0.15));
    }

    // Populate settlement dropdown
    if (settlementNav) {
      settlementNav.innerHTML = '<option value="">— Select settlement —</option>';
      settlementNav.disabled = !upper;
      if (upper && MapManager.townSettlements[upper]) {
        MapManager.townSettlements[upper].sort().forEach(name => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          settlementNav.appendChild(opt);
        });
      }
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
      console.error("No facility data loaded – map will be empty.");
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
    StatsManager.update(filtered);  // [HIGH] update stats bar
  },

  async loadBoundary() {
    try {
      const res = await fetch(CONFIG.boundaryUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      L.geoJSON(data, {
        style: {
          color: "#2c3e50",
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0
        }
      }).addTo(MapManager.map);
      // [LOW] No longer locks maxBounds — boundary just loads silently
    } catch (err) {
      console.warn("Could not load boundary layer:", err);
    }
  },

  async loadInformalSettlements() {
    try {
      const res = await fetch(CONFIG.informalUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      MapManager.informalLayer = {};

      const geoLayer = L.geoJSON(data, {
        style: {
          color: "#e67e22",
          weight: 1.5,
          opacity: 0.8,
          fillColor: "#f39c12",
          fillOpacity: 0.12
        },
        onEachFeature(feature, layer) {
          const name = feature.properties.Settlement || "Unnamed";
          const town = (feature.properties.Town || "").toUpperCase().trim();

          // [LOW] Only show tooltip above zoom 12 to avoid confusion at overview zoom
          MapManager.map.on("zoomend", () => {
            if (MapManager.map.getZoom() >= 12) {
              layer.bindTooltip(name, { sticky: true, opacity: 0.85 });
            } else {
              layer.unbindTooltip();
            }
          });

          MapManager.informalLayer[name] = layer;

          if (!MapManager.townBounds[town]) {
            MapManager.townBounds[town] = layer.getBounds();
            MapManager.townSettlements[town] = [];
          } else {
            MapManager.townBounds[town].extend(layer.getBounds());
          }
          MapManager.townSettlements[town].push(name);
        }
      }).addTo(MapManager.map);

      // Populate legend town nav dropdown
      const townSel       = document.getElementById("townNav");
      const settlementSel = document.getElementById("settlementNav");

      if (townSel && settlementSel) {
        Object.keys(MapManager.townBounds).sort().forEach(town => {
          const opt = document.createElement("option");
          opt.value = town;
          opt.textContent = town;
          townSel.appendChild(opt);
        });

        // [MEDIUM] Legend town nav → also syncs sidebar town filter
        townSel.addEventListener("change", (e) => {
          const town = e.target.value;

          settlementSel.innerHTML = '<option value="">— Select settlement —</option>';
          settlementSel.disabled = !town;

          if (!town) {
            // Clear sidebar town filter too
            const sidebarTown = document.getElementById("townFilter");
            if (sidebarTown) sidebarTown.value = "";
            FilterManager.town = "";
            App.update();
            return;
          }

          MapManager.map.fitBounds(MapManager.townBounds[town].pad(0.15));

          // Sync sidebar filter
          const sidebarTown = document.getElementById("townFilter");
          if (sidebarTown) {
            // Match value by case-insensitive comparison
            const matchOpt = [...sidebarTown.options].find(
              o => o.value.toUpperCase() === town
            );
            if (matchOpt) {
              sidebarTown.value = matchOpt.value;
              FilterManager.town = matchOpt.value.toLowerCase();
            }
          }

          (MapManager.townSettlements[town] || []).sort().forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            settlementSel.appendChild(opt);
          });

          App.update();
        });

        settlementSel.addEventListener("change", (e) => {
          const chosen = e.target.value;
          if (!chosen) return;
          const layer = MapManager.informalLayer[chosen];
          if (layer) {
            MapManager.map.fitBounds(layer.getBounds().pad(0.4));
          }
        });
      }

      console.log(`Loaded ${Object.keys(MapManager.informalLayer).length} informal settlement boundaries`);
    } catch (err) {
      console.warn("Could not load informal settlement boundaries:", err);
    }
  }
};

// Start the app
App.init();
