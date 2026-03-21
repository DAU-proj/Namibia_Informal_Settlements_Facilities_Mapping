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
    const res = await fetch(CONFIG.dataUrl);
    const data = await res.json();
    this.features = data.features;
  }
};

// ===============================
// STYLE MANAGER
// ===============================
const StyleManager = {

  getColor(condition) {
    const c = (condition || "").toLowerCase();

    if (c.includes("good")) return "#27ae60";
    if (c.includes("average")) return "#f39c12";
    if (c.includes("poor")) return "#c0392b";

    return "#7f8c8d";
  },

  getIcon(facility) {
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

    const conditionClass = (p.Condition || "")
      .toLowerCase()
      .replace(" condition", "");

    return L.marker([lat, lng], {
      icon: L.divIcon({
        className: "",
        html: `
          <div class="marker ${conditionClass}">
            <i class="fa-solid ${this.getIcon(p.Facility)}"></i>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    });
  }
};

// ===============================
// FILTER MANAGER
// ===============================
const FilterManager = {
  facility: "",
  condition: "",

  apply(features) {
    return features.filter(f => {
      const fVal = (f.properties.Facility || "").toLowerCase();
      const cVal = (f.properties.Condition || "").toLowerCase();

      return (!this.facility || fVal.includes(this.facility)) &&
             (!this.condition || cVal.includes(this.condition));
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

      marker.bindPopup(this.createPopup(f.properties));
      MapManager.cluster.addLayer(marker);
    });
  },

  createPopup(p) {
    return `
      <div class="popup">
        ${p.github_image_url_cdn ? `<img src="${p.github_image_url_cdn}">` : ""}
        <h4>${p.Facility}</h4>
        <p><b>Town:</b> ${p.Town}</p>
        <p><b>Condition:</b> ${p.Condition}</p>
        <p><b>Status:</b> ${p["Is the facility functional?"]}</p>
      </div>
    `;
  }
};

// ===============================
// UI MANAGER
// ===============================
const UIManager = {

  initFilters(features) {
    const fSet = new Set();
    const cSet = new Set();

    features.forEach(f => {
      fSet.add(f.properties.Facility);
      cSet.add(f.properties.Condition);
    });

    fSet.forEach(v => facilityFilter.add(new Option(v, v)));
    cSet.forEach(v => conditionFilter.add(new Option(v, v)));

    facilityFilter.onchange = () => {
      FilterManager.facility = facilityFilter.value.toLowerCase();
      App.update();
    };

    conditionFilter.onchange = () => {
      FilterManager.condition = conditionFilter.value.toLowerCase();
      App.update();
    };
  }
};

// ===============================
// APP CONTROLLER
// ===============================
const App = {

  async init() {
    MapManager.init();

    await DataManager.load();

    UIManager.initFilters(DataManager.features);

    this.loadBoundary();
    this.update();
  },

  update() {
    const filtered = FilterManager.apply(DataManager.features);
    Renderer.render(filtered);
  },

  async loadBoundary() {
    const res = await fetch(CONFIG.boundaryUrl);
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
  }
};

// ===============================
// INIT
// ===============================
App.init();
