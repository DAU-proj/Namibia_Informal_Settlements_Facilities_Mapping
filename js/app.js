// ================= MAP =================
const map = L.map('map', {
  center: [-22.56, 17.08],
  zoom: 6,
  minZoom: 5
});

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
const sat = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
);

osm.addTo(map);
L.control.layers({ "OSM": osm, "Satellite": sat }).addTo(map);

// ================= CLUSTER =================
const cluster = L.markerClusterGroup({
  chunkedLoading: true,
  iconCreateFunction: function (cluster) {
    const count = cluster.getChildCount();

    let size = "small";
    if (count > 50) size = "large";
    else if (count > 20) size = "medium";

    return L.divIcon({
      html: `<div><span>${count}</span></div>`,
      className: `marker-cluster marker-cluster-${size}`,
      iconSize: L.point(40, 40)
    });
  }
});

// ================= GLOBAL STATE =================
let allFeatures = [];
let townLayers = {};
let allTowns = [];
let boundaryLayer = null;

// ================= LOAD BOUNDARY (FIXED) =================
fetch('asset/settlement_boundary.geojson')
  .then(res => res.json())
  .then(data => {
    boundaryLayer = L.geoJSON(data, {
      style: { color: "#019EDF", weight: 2, fillOpacity: 0 }
    }).addTo(map);

    map.fitBounds(boundaryLayer.getBounds());
    map.setMaxBounds(boundaryLayer.getBounds());
    map.options.maxBoundsViscosity = 1.0;
  });

// ================= LOAD DATA =================
fetch('data/namibia_dashboard.geojson')
  .then(res => res.json())
  .then(data => {
    allFeatures = data.features;
    populateFilters();
    renderData();
  });

// ================= FILTERS =================
function populateFilters() {
  const fSet = new Set();
  const cSet = new Set();

  allFeatures.forEach(f => {
    fSet.add(f.properties.Facility);
    cSet.add(f.properties.Condition);
  });

  facilityFilter.innerHTML = '<option value="">All Facilities</option>';
  conditionFilter.innerHTML = '<option value="">All Conditions</option>';

  fSet.forEach(v => facilityFilter.add(new Option(v, v)));
  cSet.forEach(v => conditionFilter.add(new Option(v, v)));
}

// ================= COLOR =================
function getColor(cond) {
  cond = (cond || "").toLowerCase();
  if (cond.includes("good")) return "#2ecc71";
  if (cond.includes("fair")) return "#f1c40f";
  if (cond.includes("poor")) return "#e74c3c";
  return "#95a5a6";
}

// ================= ICON =================
function getIcon(f) {
  f = (f || "").toLowerCase();
  if (f.includes("school")) return "fa-school";
  if (f.includes("health")) return "fa-hospital";
  if (f.includes("water")) return "fa-droplet";
  if (f.includes("toilet")) return "fa-toilet";
  return "fa-location-dot";
}

// ================= RENDER =================
function renderData() {

  cluster.clearLayers();
  townLayers = {};
  allTowns = [];

  const fval = facilityFilter.value.toLowerCase();
  const cval = conditionFilter.value.toLowerCase();

  let filtered = allFeatures.filter(f => {
    const f1 = (f.properties.Facility || "").toLowerCase();
    const c1 = (f.properties.Condition || "").toLowerCase();

    return (!fval || f1.includes(fval)) &&
           (!cval || c1.includes(cval));
  });

  filtered.forEach(f => {

    const p = f.properties;
    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];

    const color = getColor(p.Condition);

    // ===== MARKER =====
    const marker = L.marker(latlng, {
      icon: L.divIcon({
        html: `
          <div class="marker-icon" style="background:${color}">
            <i class="fa ${getIcon(p.Facility)}"></i>
          </div>
        `,
        className: ""
      })
    });

    // ===== BUFFER (NEW - your requirement restored) =====
    const buffer = L.circle(latlng, {
      radius: 300,
      color: color,
      weight: 1,
      fillOpacity: 0.1
    });

    const combined = L.layerGroup([buffer, marker]);

    // ===== POPUP =====
    marker.bindPopup(`
      <div>
        ${p.github_image_url_cdn ? `<img src="${p.github_image_url_cdn}" style="width:100%" onerror="this.style.display='none'">` : ""}
        <b>Town:</b> ${p.Town || "N/A"}<br>
        <b>Facility:</b> ${p.Facility || "N/A"}<br>
        <b>Status:</b> ${p["Is the facility functional?"] || "N/A"}<br>
        <b>Condition:</b> ${p.Condition || "N/A"}
      </div>
    `);

    // ===== TOWN GROUPING =====
    const town = (p.Town || "").trim();

    if (!townLayers[town]) {
      townLayers[town] = [];
      allTowns.push(town);
    }

    townLayers[town].push(combined);

    cluster.addLayer(combined);
  });

  map.addLayer(cluster);

  buildTownDropdown();
}

// ================= TOWN =================
function buildTownDropdown() {

  townSelect.innerHTML = '<option value="">Select Town</option>';

  [...new Set(allTowns)].sort().forEach(t => {
    townSelect.add(new Option(t, t));
  });

  townSelect.onchange = function () {

    const t = this.value;

    if (!t || !townLayers[t]) return;

    const group = L.featureGroup(townLayers[t]);
    map.fitBounds(group.getBounds());
  };
}

// ================= EVENTS =================
facilityFilter.onchange = renderData;
conditionFilter.onchange = renderData;
