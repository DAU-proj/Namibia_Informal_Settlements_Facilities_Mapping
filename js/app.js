// ===============================
// CONFIG
// ===============================
const CONFIG = {
  center: [-22, 17],
  zoom: 6,
  dataUrl: 'data/namibia_dashboard.geojson',
  boundaryUrl: 'data/settlements.geojson'
};

// ===============================
// MAP MANAGER
// ===============================
const MapManager = {
  map: null,
  cluster: null,
  baseLayers: {},

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
// DATA MANAGER (with error handling)
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
// FILTER MANAGER (now with town)
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
// UI MANAGER (populates all three dropdowns)
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

    // Collect unique values
    const towns = new Set();
    const facilities = new Set();
    const conditions = new Set();

    features.forEach(f => {
      if (f.properties.Town) towns.add(f.properties.Town);
      if (f.properties.Facility) facilities.add(f.properties.Facility);
      if (f.properties.Condition) conditions.add(f.properties.Condition);
    });

    // Populate Town dropdown (sorted)
    [...towns].sort().forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      townSelect.appendChild(opt);
    });

    // Populate Facility dropdown
    [...facilities].sort().forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      facilitySelect.appendChild(opt);
    });

    // Populate Condition dropdown
    [...conditions].sort().forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      conditionSelect.appendChild(opt);
    });

    // Event listeners
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

// The rest of your App remains the same (no changes needed)
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
  }
};

// Start the app
App.init();
