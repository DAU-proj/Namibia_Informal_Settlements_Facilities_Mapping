// Initialize map (Namibia bounds)
var map = L.map('map', {
    maxBounds: [[-30, 10], [-16, 30]]
}).setView([-22, 17], 6);

// Basemaps
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

L.control.layers({
    "OSM": osm,
    "Satellite": esri
}).addTo(map);

// Cluster group
var cluster = L.markerClusterGroup();

// Storage
var townLayers = {};
var allTowns = [];

// =====================
// LOAD FACILITY DATA
// =====================
fetch('data/namibia_dashboard.geojson')   // ✅ FIXED HERE
.then(response => {
    if (!response.ok) {
        throw new Error("GeoJSON not found. Check file path.");
    }
    return response.json();
})
.then(data => {

    console.log("Data loaded successfully:", data); // Debug

    var layer = L.geoJSON(data, {

        // Style points
        pointToLayer: function (feature, latlng) {

            let town = feature.properties.Town;

            if (town && !townLayers[town]) {
                townLayers[town] = [];
                allTowns.push(town);
            }

            return L.circleMarker(latlng, {
                radius: 6,
                fillColor: "#38b6f5",
                color: "#ffffff",
                weight: 1,
                fillOpacity: 0.9
            });
        },

        // Popup content
        onEachFeature: function (feature, layer) {

            let p = feature.properties;
            let img = p.github_image_url_cdn || "";

            layer.bindPopup(`
                <div style="max-width:300px;font-family:Arial;">
                    <img src="${img}" style="width:100%;border-radius:6px;"><br>
                    <b>Town:</b> ${p.Town || ""}<br>
                    <b>Facility:</b> ${p.Facility || ""}<br>
                    <b>Status:</b> ${p["Is the facility functional?"] || ""}<br>
                    <b>Condition:</b> ${p.Condition || ""}
                </div>
            `);

            // Store layer by town
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
.catch(error => {
    console.error("ERROR LOADING GEOJSON:", error);
});


// =====================
// BUILD TOWN LIST
// =====================
function buildTownList(towns) {

    let container = document.getElementById("townList");
    container.innerHTML = "";

    towns.sort().forEach(town => {

        let div = document.createElement("div");
        div.className = "town-item";
        div.innerText = town;

        div.onclick = function () {

            // Highlight selected
            document.querySelectorAll('.town-item').forEach(el => el.classList.remove('active-town'));
            div.classList.add('active-town');

            // Zoom to all features in town
            let group = L.featureGroup(townLayers[town]);
            map.fitBounds(group.getBounds());

            // Update KPI
            updateKPI(town);
        };

        container.appendChild(div);
    });
}


// =====================
// KPI FUNCTION
// =====================
function updateKPI(town) {

    let layers = townLayers[town] || [];

    let total = layers.length;

    let functional = layers.filter(l =>
        l.feature.properties["Is the facility functional?"] === "Yes"
    ).length;

    let good = layers.filter(l =>
        l.feature.properties.Condition === "Good"
    ).length;

    document.getElementById("kpi").innerHTML = `
        <div class="kpi-box">Total Facilities: ${total}</div>
        <div class="kpi-box">Functional: ${functional}</div>
        <div class="kpi-box">Good Condition: ${good}</div>
    `;
}


// =====================
// SEARCH FUNCTION
// =====================
document.getElementById("searchBox").addEventListener("keyup", function () {

    let value = this.value.toLowerCase();

    let filtered = allTowns.filter(t =>
        t.toLowerCase().includes(value)
    );

    buildTownList(filtered);
});


// =====================
// SETTLEMENT INTERACTION
// =====================
fetch('data/settlements.geojson')
.then(r => r.json())
.then(data => {

    L.geoJSON(data, {
        style: {
            color: "#e74c3c",
            weight: 1,
            fillOpacity: 0.2
        },
        onEachFeature: function (feature, layer) {

            layer.on("click", function () {
                map.fitBounds(layer.getBounds());
            });
        }
    }).addTo(map);

})
.catch(() => {
    console.warn("No settlements layer found.");
});
