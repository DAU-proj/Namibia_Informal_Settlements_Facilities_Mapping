// ===============================
// CONFIG
// ===============================
const CONFIG = {
  center: [-22, 17],
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
  informalLayer: null,   // stores informal settlement polygons keyed by name

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
    if (!bounds) return;
    const padded = bounds.pad(0.3);
    this.map.fitBounds(padded);
    this.map.setMaxBounds(padded);
    this.map.options.maxBoundsViscosity = 0.6;
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
        html: `
          <div class="marker ${conditionClass}">
            <i class="fa-solid ${iconClass}"></i>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    });
  }
};

// ===============================
// RENDERER (MUST BE DEFINED BEFORE APP)
// ===============================
const Renderer = {
  render(features) {
    MapManager.cluster.clearLayers();
    features.forEach(f => {
      const marker = StyleManager.createMarker(f);
      marker.bindPopup(this.createPopup(f.properties));
      MapManager.cluster.addLayer(marker);
    });
  },

  createPopup(p) {
    const imgHtml = p.github_image_url_cdn ? `<img src="${p.github_image_url_cdn}" width="100%">` : "";
    return `
      <div class="popup">
        ${imgHtml}
        <h4>${p.Facility || "Unknown"}</h4>
        <p><b>Town:</b> ${p.Town || "—"}</p>
        <p><b>Condition:</b> ${p.Condition || "—"}</p>
        <p><b>Functional?</b> ${p["Is the facility functional?"] || "Unknown"}</p>
      </div>
    `;
  }
};

// ===============================
// FILTER MANAGER (with town)
// ===============================
const FilterManager = {
  town: "",
  facility: "",
  condition: "",

  apply(features) {
    return features.filter(f => {
      const townVal = (f.properties.Town || "").toLowerCase();
      const fVal = (f.properties.Facility || "").toLowerCase();
      const cVal = (f.properties.Condition || "").toLowerCase();

      return (!this.town || townVal.includes(this.town)) &&
             (!this.facility || fVal.includes(this.facility)) &&
             (!this.condition || cVal.includes(this.condition));
    });
  }
};

// ===============================
// UI MANAGER (populates dropdowns)
// ===============================
const UIManager = {
  initFilters(features) {
    const townSelect = document.getElementById("townFilter");
    const facilitySelect = document.getElementById("facilityFilter");
    const conditionSelect = document.getElementById("conditionFilter");

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

    townSelect.addEventListener("change", (e) => {
      FilterManager.town = e.target.value.toLowerCase();
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
  },

  async loadBoundary() {
    try {
      const res = await fetch(CONFIG.boundaryUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const boundary = L.geoJSON(data, {
        style: {
          color: "#2c3e50",
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0
        }
      }).addTo(MapManager.map);
      MapManager.fitToBounds(boundary.getBounds());
    } catch (err) {
      console.warn("Could not load boundary layer:", err);
    }
  },

  async loadInformalSettlements() {
    try {
      const res = await fetch(CONFIG.informalUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Map settlement name → layer bounds for pan-to
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
          const name = feature.properties.Settlement || feature.properties.IS_Name || "Unnamed";
          layer.bindTooltip(name, { sticky: true, opacity: 0.85 });
          MapManager.informalLayer[name] = layer;
        }
      }).addTo(MapManager.map);

      // Populate the legend dropdown
      const sel = document.getElementById("settlementNav");
      if (sel) {
        [...Object.keys(MapManager.informalLayer)].sort().forEach(name => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          sel.appendChild(opt);
        });

        sel.addEventListener("change", (e) => {
          const chosen = e.target.value;
          if (!chosen) return;
          const layer = MapManager.informalLayer[chosen];
          if (layer) {
            MapManager.map.fitBounds(layer.getBounds().pad(0.4));
            layer.openTooltip();
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
