// =====================
// MAP
// =====================
var map = L.map('map', {
    maxBounds: [[-30, 10], [-16, 30]]
}).setView([-22, 17], 6);

// Basemaps
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

var esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
);

L.control.layers({
    "OSM": osm,
    "Satellite": esri
}).addTo(map);

// =====================
// DATA STORAGE
// =====================
var cluster = L.markerClusterGroup();
var townLayers = {};
var allTowns = [];

// =====================
// LOAD DATA
// =====================
fetch('data/namibia_dashboard.geojson')
.then(res => res.json())
.then(data => {

    var layer = L.geoJSON(data, {

        pointToLayer: function (feature, latlng) {

            let town = feature.properties.Town;

            if (town && !townLayers[town]) {
                townLayers[town] = [];
                allTowns.push(town);
            }

            return L.circleMarker(latlng, {
                radius: 6,
                fillColor: "#019EDF",
                color: "#ffffff",
                weight: 1,
                fillOpacity: 0.9
            });
        },

        onEachFeature: function (feature, layer) {

            let p = feature.properties;
            let img = p.github_image_url_cdn || "";

            layer.bindPopup(`
                <div style="max-width:300px;">
                    <img src="${img}" style="width:100%;border-radius:6px;"><br>
                    <b>Town:</b> ${p.Town}<br>
                    <b>Facility:</b> ${p.Facility}<br>
                    <b>Status:</b> ${p["Is the facility functional?"]}<br>
                    <b>Condition:</b> ${p.Condition}
                </div>
            `);

            if (!townLayers[p.Town]) {
                townLayers[p.Town] = [];
            }
            townLayers[p.Town].push(layer);
        }
    });

    cluster.addLayer(layer);
    map.addLayer(cluster);

    buildTownList(allTowns);

})
.catch(err => console.error("DATA LOAD ERROR:", err));

// =====================
// BUILD TOWNS
// =====================
function buildTownList(towns) {

    let container = document.getElementById("townList");
    container.innerHTML = "";

    towns.sort().forEach(town => {

        let div = document.createElement("div");
        div.className = "town-item";
        div.innerText = town;

        div.onclick = function () {

            document.querySelectorAll('.town-item').forEach(el => el.classList.remove('active-town'));
            div.classList.add('active-town');

            let group = L.featureGroup(townLayers[town]);
            map.fitBounds(group.getBounds());

            updateKPI(town);
        };

        container.appendChild(div);
    });
}

// =====================
// KPI (FIXED + ROBUST)
// =====================
function updateKPI(town) {

    console.log("Updating KPI:", town);

    let layers = townLayers[town] || [];

    let total = layers.length;

    if (total === 0) {
        document.getElementById("kpi").innerHTML = "No data available";
        return;
    }

    let functional = layers.filter(l =>
        (l.feature.properties["Is the facility functional?"] || "").toLowerCase() === "yes"
    ).length;

    let conditionCounts = {};

    layers.forEach(l => {

        let cond = (l.feature.properties.Condition || "Unknown").trim();
        cond = cond.charAt(0).toUpperCase() + cond.slice(1).toLowerCase();

        conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
    });

    function getColor(c) {
        c = c.toLowerCase();
        if (c.includes("good")) return "#2ecc71";
        if (c.includes("fair")) return "#f1c40f";
        if (c.includes("poor")) return "#e74c3c";
        return "#95a5a6";
    }

    let html = `
        <div class="kpi-box kpi-main"><b>Total:</b> ${total}</div>
        <div class="kpi-box kpi-main"><b>Functional:</b> ${functional}</div>
    `;

    Object.keys(conditionCounts).forEach(c => {

        let count = conditionCounts[c];
        let percent = ((count / total) * 100).toFixed(1);
        let color = getColor(c);

        html += `
            <div class="kpi-box" style="border-left:5px solid ${color}">
                <b>${c}</b>: ${count} (${percent}%)
            </div>
        `;
    });

    document.getElementById("kpi").innerHTML = html;
}

// =====================
// SEARCH
// =====================
document.getElementById("searchBox").addEventListener("keyup", function () {

    let val = this.value.toLowerCase();
    let filtered = allTowns.filter(t => t.toLowerCase().includes(val));
    buildTownList(filtered);
});