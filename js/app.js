var map = L.map('map', {
    maxBounds: [[-30, 10], [-16, 30]]
}).setView([-22, 17], 6);

var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
        attribution: 'Tiles &copy; Esri'
    }
);

L.control.layers(
    {
        "OpenStreetMap": osm,
        "Satellite": esri
    },
    {},
    { collapsed: false }
).addTo(map);

var cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function (clusterGroup) {
        var count = clusterGroup.getChildCount();
        var size = "small";

        if (count > 50) {
            size = "large";
        } else if (count > 20) {
            size = "medium";
        }

        return L.divIcon({
            html: "<div><span>" + count + "</span></div>",
            className: "marker-cluster marker-cluster-" + size,
            iconSize: L.point(40, 40)
        });
    }
});

var townLayers = {};
var allTowns = [];

function normalizeTownName(value) {
    return (value || "").trim();
}

function formatCondition(value) {
    var cond = (value || "Unknown").trim();
    if (!cond) return "Unknown";
    return cond.charAt(0).toUpperCase() + cond.slice(1).toLowerCase();
}

function getConditionColor(condition) {
    var c = (condition || "").toLowerCase();
    if (c.includes("good")) return "#2ecc71";
    if (c.includes("fair")) return "#f1c40f";
    if (c.includes("poor")) return "#e74c3c";
    return "#95a5a6";
}

fetch('data/namibia_dashboard.geojson')
    .then(function (response) {
        if (!response.ok) {
            throw new Error("Could not load data/namibia_dashboard.geojson");
        }
        return response.json();
    })
    .then(function (data) {
        var facilitiesLayer = L.geoJSON(data, {
            pointToLayer: function (feature, latlng) {
                var town = normalizeTownName(feature.properties.Town);

                if (town && !townLayers[town]) {
                    townLayers[town] = [];
                    allTowns.push(town);
                }

                return L.circleMarker(latlng, {
                    radius: 6,
                    fillColor: "#019EDF",
                    color: "#ffffff",
                    weight: 1,
                    fillOpacity: 0.95
                });
            },

            onEachFeature: function (feature, layer) {
                var p = feature.properties || {};
                var town = normalizeTownName(p.Town);
                var img = p.github_image_url_cdn || "";

                layer.bindPopup(
                    '<div class="popup-card">' +
                        (img ? '<img src="' + img + '" alt="Facility image">' : '') +
                        '<div class="popup-row"><span class="popup-label">Town:</span> ' + (p.Town || '') + '</div>' +
                        '<div class="popup-row"><span class="popup-label">Facility:</span> ' + (p.Facility || '') + '</div>' +
                        '<div class="popup-row"><span class="popup-label">Status:</span> ' + (p["Is the facility functional?"] || '') + '</div>' +
                        '<div class="popup-row"><span class="popup-label">Condition:</span> ' + (p.Condition || '') + '</div>' +
                    '</div>'
                );

                if (!townLayers[town]) {
                    townLayers[town] = [];
                    if (town) allTowns.push(town);
                }

                townLayers[town].push(layer);
            }
        });

        cluster.addLayer(facilitiesLayer);
        map.addLayer(cluster);

        buildTownList(allTowns);
    })
    .catch(function (error) {
        console.error("Facility data loading error:", error);
        document.getElementById("kpi").innerHTML =
            '<div class="kpi-box">Could not load facility data.</div>';
    });

function buildTownList(towns) {
    var container = document.getElementById("townList");
    container.innerHTML = "";

    var uniqueTowns = Array.from(new Set(towns.filter(Boolean))).sort();

    uniqueTowns.forEach(function (town) {
        var div = document.createElement("div");
        div.className = "town-item";
        div.textContent = town;

        div.onclick = function () {
            document.querySelectorAll('.town-item').forEach(function (el) {
                el.classList.remove('active-town');
            });
            div.classList.add('active-town');

            var layers = townLayers[town] || [];
            if (!layers.length) {
                document.getElementById("kpi").innerHTML =
                    '<div class="kpi-box">No data available for this town.</div>';
                return;
            }

            var group = L.featureGroup(layers);
            map.fitBounds(group.getBounds(), { padding: [30, 30] });

            updateKPI(town);
        };

        container.appendChild(div);
    });
}

function updateKPI(town) {
    var layers = townLayers[town] || [];
    var kpi = document.getElementById("kpi");

    if (!layers.length) {
        kpi.innerHTML = '<div class="kpi-box">No data available for this town.</div>';
        return;
    }

    var total = layers.length;
    var functional = layers.filter(function (layer) {
        return ((layer.feature.properties["Is the facility functional?"] || "").toLowerCase() === "yes");
    }).length;

    var conditionCounts = {};
    layers.forEach(function (layer) {
        var condition = formatCondition(layer.feature.properties.Condition);
        conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
    });

    var functionalPercent = total > 0 ? ((functional / total) * 100).toFixed(1) : "0.0";

    var html = '';
    html += '<div class="kpi-box kpi-main">';
    html += '<span class="kpi-title">Total Facilities</span>';
    html += '<span class="kpi-value">' + total + '</span>';
    html += '</div>';

    html += '<div class="kpi-box kpi-main">';
    html += '<span class="kpi-title">Functional</span>';
    html += '<span class="kpi-value">' + functional + '</span>';
    html += '<span class="kpi-sub">' + functionalPercent + '% of selected town</span>';
    html += '</div>';

    Object.keys(conditionCounts).sort().forEach(function (condition) {
        var count = conditionCounts[condition];
        var percent = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
        var color = getConditionColor(condition);

        html += '<div class="kpi-box" style="border-left:5px solid ' + color + ';">';
        html += '<span class="kpi-title">' + condition + '</span>';
        html += '<span class="kpi-value">' + count + '</span>';
        html += '<span class="kpi-sub">' + percent + '% of selected town</span>';
        html += '</div>';
    });

    kpi.innerHTML = html;
}

document.getElementById("searchBox").addEventListener("keyup", function () {
    var value = this.value.toLowerCase();
    var filtered = allTowns.filter(function (town) {
        return town.toLowerCase().includes(value);
    });
    buildTownList(filtered);
});

fetch('data/settlements.geojson')
    .then(function (response) {
        if (!response.ok) {
            throw new Error("No settlement layer found");
        }
        return response.json();
    })
    .then(function (data) {
        var settlements = L.geoJSON(data, {
            style: function () {
                return {
                    color: "#e74c3c",
                    weight: 1.2,
                    fillColor: "#e74c3c",
                    fillOpacity: 0.16
                };
            },
            onEachFeature: function (feature, layer) {
                layer.on("click", function () {
                    map.fitBounds(layer.getBounds(), { padding: [20, 20] });
                });
            }
        });

        settlements.addTo(map);
    })
    .catch(function () {
        console.warn("Settlements layer not found.");
    });

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
