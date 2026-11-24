// Mapa real con calles de OpenStreetMap (Leaflet), igual en iPhone, Android y web.
// Marca tiendas (estrella), domicilios (casa verde) y cuadrillas, y traza la ruta por calles con OSRM.
import React, { useMemo } from "react";
import { Platform, View } from "react-native";

export type PuntoMapa = {
  lat: number; lng: number; tipo: "tienda" | "casa" | "camion" | "tecnico";
  titulo?: string; detalle?: string; color?: string; destacado?: boolean;
};
export type RutaMapa = { desde: [number, number]; hasta: [number, number]; hecho?: boolean };

function html(puntos: PuntoMapa[], rutas: RutaMapa[], interactivo: boolean) {
  const datos = JSON.stringify({ puntos, rutas, interactivo }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#E8EFE6;font-family:-apple-system,Inter,Arial,sans-serif}
.pin{display:flex;align-items:center;justify-content:center;border-radius:50%;box-shadow:0 3px 8px rgba(33,36,77,.35);border:3px solid #fff}
.leaflet-popup-content{margin:8px 12px;font-size:13px}.leaflet-popup-content b{color:#21244D}</style></head>
<body><div id="m"></div><script>
var D=${datos};
var m=L.map('m',{zoomControl:D.interactivo,attributionControl:true,dragging:D.interactivo,scrollWheelZoom:false,doubleClickZoom:D.interactivo,touchZoom:D.interactivo});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
function icono(p){
  if(p.tipo==='tienda') return L.divIcon({className:'',iconSize:[34,34],iconAnchor:[17,17],html:'<div class="pin" style="width:28px;height:28px;background:#21244D'+(p.destacado?';box-shadow:0 0 0 6px rgba(207,215,42,.6)':'')+'"><svg width="16" height="16" viewBox="-10 -10 20 20"><path d="M0 -9 L2.6 -2.8 L9.3 -2.8 L3.9 1.2 L5.9 7.6 L0 3.8 L-5.9 7.6 L-3.9 1.2 L-9.3 -2.8 L-2.6 -2.8Z" fill="#CFD72A"/></svg></div>'});
  if(p.tipo==='casa') return L.divIcon({className:'',iconSize:[34,42],iconAnchor:[17,40],html:'<svg width="34" height="42" viewBox="-17 -40 34 42"><path d="M0 -38 C-11 -38 -16 -30 -16 -22 C-16 -10 0 2 0 2 C0 2 16 -10 16 -22 C16 -30 11 -38 0 -38Z" fill="#1E8A4C" stroke="#fff" stroke-width="2.5"/><path d="M-7 -22 L0 -28 L7 -22 V-15 H-7Z" fill="#fff"/></svg>'});
  if(p.tipo==='camion') return L.divIcon({className:'',iconSize:[32,32],iconAnchor:[16,16],html:'<div class="pin" style="width:26px;height:26px;background:#C8461B"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M1 6h13v10H1z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg></div>'});
  return L.divIcon({className:'',iconSize:[24,24],iconAnchor:[12,12],html:'<div class="pin" style="width:18px;height:18px;background:'+(p.color||'#1BAF7A')+'"></div>'});
}
var b=[];
D.puntos.forEach(function(p){var mk=L.marker([p.lat,p.lng],{icon:icono(p)}).addTo(m);if(p.titulo)mk.bindPopup('<b>'+p.titulo+'</b>'+(p.detalle?'<br>'+p.detalle:''));b.push([p.lat,p.lng]);});
function linea(r,coords){L.polyline(coords,r.hecho?{color:'#C8461B',weight:5}:{color:'#21244D',weight:4,dashArray:'2 9',lineCap:'round'}).addTo(m);}
D.rutas.forEach(function(r){
  var recta=[r.desde,r.hasta];
  fetch('https://router.project-osrm.org/route/v1/driving/'+r.desde[1]+','+r.desde[0]+';'+r.hasta[1]+','+r.hasta[0]+'?overview=full&geometries=geojson')
   .then(function(x){return x.json()}).then(function(j){var c=j.routes[0].geometry.coordinates.map(function(p){return[p[1],p[0]]});linea(r,c);})
   .catch(function(){linea(r,recta);});
});
if(b.length===1)m.setView(b[0],15);else if(b.length)m.fitBounds(b,{padding:[36,36],maxZoom:16});else m.setView([10.49,-66.9],12);
</script></body></html>`;
}

/** Mapa real. En la web usa un iframe; en el teléfono, WebView. */
export default function MapaReal({ puntos, rutas = [], alto = 220, interactivo = true }: { puntos: PuntoMapa[]; rutas?: RutaMapa[]; alto?: number; interactivo?: boolean }) {
  const doc = useMemo(() => html(puntos, rutas, interactivo), [JSON.stringify(puntos), JSON.stringify(rutas), interactivo]);
  if (Platform.OS === "web") {
    return (
      <View style={{ height: alto, width: "100%" }}>
        {React.createElement("iframe", { srcDoc: doc, title: "Mapa", style: { border: 0, width: "100%", height: "100%" } })}
      </View>
    );
  }
  const { WebView } = require("react-native-webview");
  return (
    <View style={{ height: alto, width: "100%" }}>
      <WebView originWhitelist={["*"]} source={{ html: doc, baseUrl: "https://tile.openstreetmap.org" }} scrollEnabled={false}
        style={{ backgroundColor: "#E8EFE6" }} />
    </View>
  );
}
