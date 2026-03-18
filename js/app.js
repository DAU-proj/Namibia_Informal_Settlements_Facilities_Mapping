
var map=L.map('map',{maxBounds:[[ -30, 10],[ -16, 30 ]]}).setView([-22,17],6);

var osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
L.control.layers({"OSM":osm,"Satellite":esri}).addTo(map);

var cluster=L.markerClusterGroup();
var townLayers={}, allTowns=[];

fetch('data/facilities.geojson')
.then(r=>r.json())
.then(data=>{
    var layer=L.geoJSON(data,{
        pointToLayer:(f,latlng)=>{
            let t=f.properties.Town;
            if(t && !townLayers[t]){
                townLayers[t]=[];
                allTowns.push(t);
            }
            return L.circleMarker(latlng,{
                radius:6,fillColor:"#38b6f5",color:"#fff",weight:1,fillOpacity:0.9
            });
        },
        onEachFeature:(f,l)=>{
            let p=f.properties;
            let img=p.github_image_url_cdn||"";
            l.bindPopup(`
                <div style="max-width:300px;">
                <img src="${img}" style="width:100%;border-radius:6px;"><br>
                <b>Town:</b> ${p.Town}<br>
                <b>Facility:</b> ${p.Facility}<br>
                <b>Status:</b> ${p["Is the facility functional?"]}<br>
                <b>Condition:</b> ${p.Condition}
                </div>
            `);
            townLayers[p.Town].push(l);
        }
    });

    cluster.addLayer(layer);
    map.addLayer(cluster);

    buildTownList(allTowns);
});

// KPI
function updateKPI(town){
    let layers=townLayers[town]||[];
    let total=layers.length;
    let functional=layers.filter(l=>l.feature.properties["Is the facility functional?"]=="Yes").length;
    let good=layers.filter(l=>l.feature.properties.Condition=="Good").length;

    document.getElementById("kpi").innerHTML=`
    <div class="kpi-box">Total Facilities: ${total}</div>
    <div class="kpi-box">Functional: ${functional}</div>
    <div class="kpi-box">Good Condition: ${good}</div>
    `;
}

// Town list
function buildTownList(towns){
    let container=document.getElementById("townList");
    container.innerHTML="";
    towns.sort().forEach(t=>{
        let div=document.createElement("div");
        div.className="town-item";
        div.innerText=t;

        div.onclick=function(){
            document.querySelectorAll('.town-item').forEach(el=>el.classList.remove('active-town'));
            div.classList.add('active-town');

            let group=L.featureGroup(townLayers[t]);
            map.fitBounds(group.getBounds());

            updateKPI(t);
        };

        container.appendChild(div);
    });
}

// search
document.getElementById("searchBox").addEventListener("keyup",function(){
    let val=this.value.toLowerCase();
    let filtered=allTowns.filter(t=>t.toLowerCase().includes(val));
    buildTownList(filtered);
});

// Settlement interaction (optional file)
fetch('data/settlements.geojson')
.then(r=>r.json())
.then(data=>{
    L.geoJSON(data,{
        style:{color:"#e74c3c",weight:1,fillOpacity:0.2},
        onEachFeature:(f,l)=>{
            l.on("click",function(){
                map.fitBounds(l.getBounds());
            });
        }
    }).addTo(map);
}).catch(()=>{});
