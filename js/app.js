var map = L.map('map').setView([-22, 17], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

var cluster = L.markerClusterGroup();

var allFeatures = [];
var townLayers = {};
var allTowns = [];

// LOAD DATA
fetch('data/namibia_dashboard.geojson')
.then(res => res.json())
.then(data => {
    allFeatures = data.features;
    populateFilters();
    renderData();
});

function populateFilters() {
    let facSet = new Set();
    let condSet = new Set();

    allFeatures.forEach(f => {
        facSet.add(f.properties.Facility);
        condSet.add(f.properties.Condition);
    });

    facSet.forEach(v => facilityFilter.add(new Option(v,v)));
    condSet.forEach(v => conditionFilter.add(new Option(v,v)));
}

function renderData() {

    cluster.clearLayers();
    townLayers = {};
    allTowns = [];

    let fac = facilityFilter.value.toLowerCase();
    let cond = conditionFilter.value.toLowerCase();

    let filtered = allFeatures.filter(f => {
        let f1 = (f.properties.Facility||"").toLowerCase();
        let c1 = (f.properties.Condition||"").toLowerCase();
        return (!fac || f1.includes(fac)) && (!cond || c1.includes(cond));
    });

    filtered.forEach(f => {

        let p = f.properties;
        let latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];

        let marker = L.marker(latlng);

        // ✅ FIXED IMAGE POPUP
        marker.bindPopup(`
            <div class="popup-card">
                ${p.github_image_url_cdn ? `<img src="${p.github_image_url_cdn}" onerror="this.style.display='none'">` : ""}
                <b>Town:</b> ${p.Town}<br>
                <b>Facility:</b> ${p.Facility}<br>
                <b>Status:</b> ${p["Is the facility functional?"]}<br>
                <b>Condition:</b> ${p.Condition}
            </div>
        `);

        let town = (p.Town||"").trim();

        if(!townLayers[town]) {
            townLayers[town] = [];
            allTowns.push(town);
        }

        townLayers[town].push(marker);
        cluster.addLayer(marker);
    });

    map.addLayer(cluster);
    buildTownDropdown();
}

function buildTownDropdown() {
    townSelect.innerHTML = '<option value="">Select Town</option>';

    [...new Set(allTowns)].sort().forEach(t=>{
        townSelect.add(new Option(t,t));
    });

    townSelect.onchange = function(){
        let t = this.value;
        let group = L.featureGroup(townLayers[t]||[]);
        map.fitBounds(group.getBounds());
    };
}

// EVENTS
facilityFilter.onchange = renderData;
conditionFilter.onchange = renderData;
