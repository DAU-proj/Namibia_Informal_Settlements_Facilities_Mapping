var map = L.map('map').setView([-22, 17], 6);

var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
var sat = L.tileLayer(
 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
);

osm.addTo(map);
L.control.layers({ "OSM":osm, "Satellite":sat }).addTo(map);

// CLUSTER (DAU STYLE)
var cluster = L.markerClusterGroup({
  iconCreateFunction: function (cluster) {

    var count = cluster.getChildCount();

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

var allFeatures=[], townLayers={}, allTowns=[];

// LOAD DATA
fetch('data/namibia_dashboard.geojson')
.then(res=>res.json())
.then(data=>{
  allFeatures=data.features;
  populateFilters();
  renderData();
});

// LOAD BOUNDARY + LOCK
fetch('data/settlements.geojson')
.then(res => res.json())
.then(data => {

  // ================= NAMIBIA BOUNDARY =================
  let boundary = L.geoJSON(data, {
    style: {
      color: "#2c3e50",
      weight: 3,
      opacity: 0.9,
      fillOpacity: 0
    }
  }).addTo(map);

  let bounds = boundary.getBounds();

  // ================= CREATE MASK CORRECTLY =================

  // World polygon
  let outer = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
    [-90, -180]
  ];

  // Collect Namibia polygons as holes
  let holes = [];

  data.features.forEach(f => {

    if (f.geometry.type === "Polygon") {
      holes.push(f.geometry.coordinates[0]);
    }

    if (f.geometry.type === "MultiPolygon") {
      f.geometry.coordinates.forEach(poly => {
        holes.push(poly[0]);
      });
    }

  });

  // 🔥 IMPORTANT: Reverse holes (fix orientation issue)
  holes = holes.map(ring => ring.slice().reverse());

  // Create mask
  let mask = L.polygon([outer, ...holes], {
    fillColor: "#000",
    fillOpacity: 0.4,
    stroke: false,
    interactive: false
  }).addTo(map);

  // ================= LOCK MAP =================
  map.fitBounds(bounds);
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

});
// FILTERS
function populateFilters(){
  let fSet=new Set(), cSet=new Set();

  allFeatures.forEach(f=>{
    fSet.add(f.properties.Facility);
    cSet.add(f.properties.Condition);
  });

  fSet.forEach(v=>facilityFilter.add(new Option(v,v)));
  cSet.forEach(v=>conditionFilter.add(new Option(v,v)));
}

// COLOR
function getColor(cond){
  cond=(cond||"").toLowerCase();
  if(cond.includes("good")) return "#2ecc71";
  if(cond.includes("fair")) return "#f1c40f";
  if(cond.includes("poor")) return "#e74c3c";
  return "#95a5a6";
}

// ICON
function getIcon(f){
  f=(f||"").toLowerCase();
  if(f.includes("school")) return "fa-school";
  if(f.includes("health")) return "fa-hospital";
  if(f.includes("water")) return "fa-droplet";
  if(f.includes("toilet")) return "fa-toilet";
  return "fa-location-dot";
}

// RENDER
function renderData(){

  cluster.clearLayers();
  townLayers={}; allTowns=[];

  let fval=facilityFilter.value.toLowerCase();
  let cval=conditionFilter.value.toLowerCase();

  let filtered=allFeatures.filter(f=>{
    let f1=(f.properties.Facility||"").toLowerCase();
    let c1=(f.properties.Condition||"").toLowerCase();
    return (!fval||f1.includes(fval)) && (!cval||c1.includes(cval));
  });

  filtered.forEach(f=>{

    let p=f.properties;
    let latlng=[f.geometry.coordinates[1],f.geometry.coordinates[0]];

    let marker=L.marker(latlng,{
      icon:L.divIcon({
        html:`<div class="marker-icon" style="background:${getColor(p.Condition)}">
          <i class="fa ${getIcon(p.Facility)}"></i>
        </div>`
      })
    });

    marker.bindPopup(`
      <div>
        ${p.github_image_url_cdn ? `<img src="${p.github_image_url_cdn}" style="width:100%" onerror="this.style.display='none'">`:""}
        <b>Town:</b> ${p.Town}<br>
        <b>Facility:</b> ${p.Facility}<br>
        <b>Status:</b> ${p["Is the facility functional?"]}<br>
        <b>Condition:</b> ${p.Condition}
      </div>
    `);

    let town=(p.Town||"").trim();
    if(!townLayers[town]){
      townLayers[town]=[];
      allTowns.push(town);
    }

    townLayers[town].push(marker);
    cluster.addLayer(marker);
  });

  map.addLayer(cluster);
  buildTownDropdown();
}

// TOWN
function buildTownDropdown(){
  townSelect.innerHTML='<option>Select Town</option>';

  [...new Set(allTowns)].sort().forEach(t=>{
    townSelect.add(new Option(t,t));
  });

  townSelect.onchange=function(){
    let t=this.value;
    let group=L.featureGroup(townLayers[t]||[]);
    map.fitBounds(group.getBounds());
  };
}

// LEGEND INTERACTION
document.querySelectorAll('.clickable').forEach(el=>{
  el.onclick=function(){
    let cond=this.dataset.condition || "";
    conditionFilter.value=cond;

    document.querySelectorAll('.clickable').forEach(i=>i.classList.remove('active'));
    this.classList.add('active');

    renderData();
  };
});

// EVENTS
facilityFilter.onchange=renderData;
conditionFilter.onchange=renderData;


// =====================
// LAST UPDATED (AUTO)
// =====================
function updateLastUpdated() {
    const el = document.getElementById("lastUpdated");
    if (!el) return;

    const now = new Date();

    const formatted = now.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    el.innerText = "Last updated: " + formatted;
}

updateLastUpdated();
