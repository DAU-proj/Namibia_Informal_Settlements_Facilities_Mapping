// =====================
// GLOBAL VARIABLES
// =====================
var map, cluster;
var allFeatures = [];
var currentFilteredData = [];
var townLayers = {};
var allTowns = [];
var conditionChart, facilityChart;

// =====================
// MAP INIT
// =====================
map = L.map('map', {
    maxBounds: [[-30, 10], [-16, 30]]
}).setView([-22, 17], 6);

var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

var esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
);

L.control.layers({
    "OSM": osm,
    "Satellite": esri
}).addTo(map);

// =====================
// CLUSTER (DAU STYLE)
// =====================
cluster = L.markerClusterGroup({
    iconCreateFunction: function (clusterGroup) {
        var count = clusterGroup.getChildCount();
        var size = "small";
        if (count > 50) size = "large";
        else if (count > 20) size = "medium";

        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: L.point(40, 40)
        });
    }
});

// =====================
// LOAD DATA
// =====================
fetch('data/namibia_dashboard.geojson')
.then(res => res.json())
.then(data => {
    allFeatures = data.features;
    populateFilters(allFeatures);
    renderFilteredData();
});

// =====================
// FILTER DROPDOWNS
// =====================
function populateFilters(features) {

    let facilitySet = new Set();
    let conditionSet = new Set();

    features.forEach(f => {
        if (f.properties.Facility)
            facilitySet.add(f.properties.Facility);

        if (f.properties.Condition)
            conditionSet.add(f.properties.Condition);
    });

    facilitySet.forEach(v => {
        let opt = new Option(v, v);
        document.getElementById("facilityFilter").appendChild(opt);
    });

    conditionSet.forEach(v => {
        let opt = new Option(v, v);
        document.getElementById("conditionFilter").appendChild(opt);
    });
}

// =====================
// MAIN RENDER FUNCTION
// =====================
function renderFilteredData() {

    let facilityVal = document.getElementById("facilityFilter").value.toLowerCase();
    let conditionVal = document.getElementById("conditionFilter").value.toLowerCase();

    let filtered = allFeatures.filter(f => {

        let fac = (f.properties.Facility || "").toLowerCase();
        let cond = (f.properties.Condition || "").toLowerCase();

        return (!facilityVal || fac.includes(facilityVal)) &&
               (!conditionVal || cond.includes(conditionVal));
    });

    currentFilteredData = filtered;

    if (cluster) map.removeLayer(cluster);

    cluster = L.markerClusterGroup({
        iconCreateFunction: function (clusterGroup) {
            var count = clusterGroup.getChildCount();
            return L.divIcon({
                html: `<div><span>${count}</span></div>`,
                className: 'marker-cluster',
                iconSize: L.point(40, 40)
            });
        }
    });

    townLayers = {};
    allTowns = [];

    let layer = L.geoJSON(filtered, {
        pointToLayer: pointToLayer,
        onEachFeature: onEachFeature
    });

    cluster.addLayer(layer);
    map.addLayer(cluster);

    buildTownDropdown(allTowns);
    updateCharts(filtered);
}

// =====================
// ICON + COLOR LOGIC
// =====================
function pointToLayer(feature, latlng) {

    let p = feature.properties;
    let cond = (p.Condition || "").toLowerCase();
    let fac = (p.Facility || "").toLowerCase();

    function getColor(c) {
        if (c.includes("good")) return "#2ecc71";
        if (c.includes("fair")) return "#f1c40f";
        if (c.includes("poor")) return "#e74c3c";
        return "#95a5a6";
    }

    function getIcon(f) {
        if (f.includes("school")) return "fa-school";
        if (f.includes("health")) return "fa-hospital";
        if (f.includes("water")) return "fa-droplet";
        if (f.includes("toilet")) return "fa-toilet";
        return "fa-location-dot";
    }

    return L.marker(latlng, {
        icon: L.divIcon({
            html: `<div style="
                background:${getColor(cond)};
                width:28px;height:28px;border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                color:white;border:2px solid white;">
                <i class="fa ${getIcon(fac)}"></i>
            </div>`
        })
    });
}

// =====================
// POPUPS + TOWN GROUPING
// =====================
function onEachFeature(feature, layer) {

    let p = feature.properties;
    let town = (p.Town || "").trim();

    if (!townLayers[town]) {
        townLayers[town] = [];
        allTowns.push(town);
    }

    townLayers[town].push(layer);

    layer.bindPopup(`
        <b>Town:</b> ${p.Town}<br>
        <b>Facility:</b> ${p.Facility}<br>
        <b>Status:</b> ${p["Is the facility functional?"]}<br>
        <b>Condition:</b> ${p.Condition}
    `);
}

// =====================
// TOWN DROPDOWN
// =====================
function buildTownDropdown(towns) {

    let select = document.getElementById("townSelect");
    select.innerHTML = '<option value="">-- Select Town --</option>';

    [...new Set(towns)].sort().forEach(t => {
        select.add(new Option(t, t));
    });

    select.onchange = function () {

        let town = this.value;
        let layers = townLayers[town] || [];

        if (!layers.length) return;

        let group = L.featureGroup(layers);
        map.fitBounds(group.getBounds());

        updateKPI(town);
    };
}

// =====================
// KPI
// =====================
function updateKPI(town) {

    let layers = townLayers[town] || [];
    let total = layers.length;

    let functional = layers.filter(l =>
        (l.feature.properties["Is the facility functional?"] || "").toLowerCase() === "yes"
    ).length;

    let html = `<div>Total: ${total}</div><div>Functional: ${functional}</div>`;

    document.getElementById("kpi").innerHTML = html;
}

// =====================
// CHARTS
// =====================
function updateCharts(features) {

    let conditionCounts = {};
    let facilityCounts = {};

    features.forEach(f => {
        let c = f.properties.Condition || "Unknown";
        let fac = f.properties.Facility || "Unknown";

        conditionCounts[c] = (conditionCounts[c] || 0) + 1;
        facilityCounts[fac] = (facilityCounts[fac] || 0) + 1;
    });

    if (conditionChart) conditionChart.destroy();
    if (facilityChart) facilityChart.destroy();

    conditionChart = new Chart(document.getElementById("conditionChart"), {
        type: 'pie',
        data: {
            labels: Object.keys(conditionCounts),
            datasets: [{ data: Object.values(conditionCounts) }]
        }
    });

    facilityChart = new Chart(document.getElementById("facilityChart"), {
        type: 'bar',
        data: {
            labels: Object.keys(facilityCounts),
            datasets: [{ data: Object.values(facilityCounts) }]
        }
    });
}

// =====================
// EXPORT CSV
// =====================
function downloadCSV() {

    let headers = Object.keys(currentFilteredData[0].properties);
    let rows = [headers.join(",")];

    currentFilteredData.forEach(f => {
        let row = headers.map(h => `"${f.properties[h] || ""}"`);
        rows.push(row.join(","));
    });

    let blob = new Blob([rows.join("\n")]);
    let link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = "data.csv";
    link.click();
}

// =====================
// DOWNLOAD CHART
// =====================
function downloadChart(id, name) {
    let canvas = document.getElementById(id);
    let link = document.createElement("a");
    link.download = name + ".png";
    link.href = canvas.toDataURL();
    link.click();
}

// =====================
// EVENTS
// =====================
document.getElementById("facilityFilter").onchange = renderFilteredData;
document.getElementById("conditionFilter").onchange = renderFilteredData;
