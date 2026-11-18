import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { api } from "../../api";
import { Aviso, C, Cargando, Pantalla, Tarjeta, Texto } from "../../ui";

type Mapa = {
  tiendas: { id: number; nombre: string; zona: string; direccion: string; lat: number; lng: number }[];
  tecnicos: { id: number; nombre: string; ayudantes: string[]; grupo: string | null; estado: string; lat: number; lng: number; gps_en: string | null;
              orden: { codigo: string; servicio: string; direccion: string; lat: number | null; lng: number | null; franja: string } | null }[];
};

const W = 600, H = 440;

/** Encuadre automático: el mapa se acerca a donde están las tiendas, las cuadrillas y los clientes. */
function encuadre(m: Mapa) {
  const pts: [number, number][] = [...m.tiendas.map((s) => [s.lat, s.lng] as [number, number]), ...m.tecnicos.map((t) => [t.lat, t.lng] as [number, number]),
    ...m.tecnicos.filter((t) => t.orden?.lat && t.orden?.lng).map((t) => [t.orden!.lat!, t.orden!.lng!] as [number, number])];
  if (!pts.length) pts.push([10.49, -66.9]);
  let [n, s, e, w] = [Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), Math.min(...pts.map((p) => p[1]))];
  const span = Math.max(0.02, n - s, (e - w) * (H / W));
  const cLat = (n + s) / 2, cLng = (e + w) / 2, k = span * 0.65;
  n = cLat + k; s = cLat - k; const kx = k * (W / H); w = cLng - kx; e = cLng + kx;
  return { px: (lng: number) => ((lng - w) / (e - w)) * W, py: (lat: number) => ((n - lat) / (n - s)) * H };
}
const COLOR: Record<string, string> = { en_ruta: "#EB6834", en_servicio: "#2A78D6", asignado: "#6B7789", disponible: "#1BAF7A" };
const TEXTO: Record<string, string> = { en_ruta: "En ruta", en_servicio: "En servicio", asignado: "Asignado, sin salir", disponible: "Disponible de guardia" };

/** Mapa en vivo del centro de control: tiendas Damasco y cuadrillas con su última posición GPS. */
export default function MapaVivo() {
  const [m, setM] = useState<Mapa | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setM(await api<Mapa>("/supervisor/mapa")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 15000); return () => clearInterval(t); }, [cargar]);

  if (!m) return <Pantalla titulo="Mapa en vivo">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  const { px, py } = encuadre(m);
  const tec = m.tecnicos.find((t) => `t${t.id}` === foco);
  const tienda = m.tiendas.find((t) => `s${t.id}` === foco);

  return (
    <Pantalla titulo="Mapa en vivo" subtitulo="Se actualiza cada 15 segundos" onRefresh={cargar}>
      <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#EEF3F8", borderWidth: 1, borderColor: C.linea }}>
        <Svg width="100%" height={undefined} viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
          <Rect width={W} height={H} fill="#F4F6F9" />
          {[1, 2, 3, 4, 5].map((i) => <Line key={`h${i}`} x1={0} y1={(H / 6) * i} x2={W} y2={(H / 6) * i + 18} stroke="#FFFFFF" strokeWidth={10} />)}
          {[1, 2, 3, 4, 5, 6, 7].map((i) => <Line key={`v${i}`} x1={(W / 8) * i} y1={0} x2={(W / 8) * i - 24} y2={H} stroke="#FFFFFF" strokeWidth={8} />)}
          <Path d={`M0 ${H * 0.62} C${W * 0.25} ${H * 0.58} ${W * 0.5} ${H * 0.7} ${W} ${H * 0.64}`} fill="none" stroke="#B9D4EE" strokeWidth={8} />
          <Rect x={0} y={0} width={W} height={34} fill="#D7E4D3" />
          <SvgText x={W / 2} y={23} textAnchor="middle" fontSize={16} fontWeight="700" fill="#4F6B4A">↑ El Ávila (norte)</SvgText>
          {m.tecnicos.filter((t) => t.orden?.lat && t.orden?.lng).map((t) => (
            <G key={`d${t.id}`}>
              <Line x1={px(t.lng)} y1={py(t.lat)} x2={px(t.orden!.lng!)} y2={py(t.orden!.lat!)} stroke={C.marino} strokeWidth={2} strokeDasharray="4 5" opacity={0.45} />
              <Circle cx={px(t.orden!.lng!)} cy={py(t.orden!.lat!)} r={11} fill="#FFFFFF" stroke={C.marino} strokeWidth={4} />
            </G>
          ))}
          {m.tiendas.map((s) => (
            <G key={`s${s.id}`} onPress={() => setFoco(`s${s.id}`)}>
              <Circle cx={px(s.lng)} cy={py(s.lat)} r={30} fill={C.lima} opacity={0.45} />
              <Rect x={px(s.lng) - 19} y={py(s.lat) - 19} width={38} height={38} rx={11} fill={C.marino} />
              <Path d={`M${px(s.lng)} ${py(s.lat) - 9} L${px(s.lng) + 9} ${py(s.lat) - 2} V${py(s.lat) + 7} H${px(s.lng) - 9} V${py(s.lat) - 2} Z`} fill={C.lima} />
              <SvgText x={px(s.lng)} y={py(s.lat) + 42} textAnchor="middle" fontSize={18} fontWeight="800" fill={C.texto}>{s.nombre.replace("Damasco ", "")}</SvgText>
            </G>
          ))}
          {m.tecnicos.map((t) => (
            <G key={`t${t.id}`} onPress={() => setFoco(`t${t.id}`)}>
              {foco === `t${t.id}` ? <Circle cx={px(t.lng)} cy={py(t.lat)} r={26} fill="none" stroke={C.marino} strokeWidth={3} /> : null}
              <Circle cx={px(t.lng)} cy={py(t.lat)} r={19} fill={COLOR[t.estado]} stroke="#FFFFFF" strokeWidth={3} />
              <SvgText x={px(t.lng)} y={py(t.lat) + 5} textAnchor="middle" fontSize={13} fontWeight="700" fill="#FFFFFF">
                {t.nombre.split(" ").map((x) => x[0]).slice(0, 2).join("")}
              </SvgText>
            </G>
          ))}
        </Svg>
      </View>
      <Tarjeta oscura>
        {tec ? (
          <>
            <Text style={{ color: C.lima, fontWeight: "800", fontSize: 12 }}>{TEXTO[tec.estado].toUpperCase()}{tec.orden ? ` · ${tec.orden.codigo}` : ""}</Text>
            <Text style={{ color: C.blanco, fontWeight: "800", fontSize: 16 }}>{tec.nombre}{tec.ayudantes.length ? ` + ${tec.ayudantes.join(", ")}` : ""}</Text>
            <Text style={{ color: "#DCDEF0" }}>{tec.orden ? `${tec.orden.direccion} · ${tec.orden.franja}` : `Grupo ${tec.grupo ?? "—"}, sin orden activa`}</Text>
            <Text style={{ color: "#9EA3CF", fontSize: 12 }}>{tec.gps_en ? `GPS: ${new Date(tec.gps_en).toLocaleTimeString("es-VE")}` : "Sin GPS todavía: se muestra su zona"}</Text>
          </>
        ) : tienda ? (
          <>
            <Text style={{ color: C.lima, fontWeight: "800", fontSize: 12 }}>TIENDA DAMASCO · ZONA {tienda.zona.toUpperCase()}</Text>
            <Text style={{ color: C.blanco, fontWeight: "800", fontSize: 16 }}>{tienda.nombre}</Text>
            <Text style={{ color: "#DCDEF0" }}>{tienda.direccion}</Text>
          </>
        ) : <Text style={{ color: C.blanco }}>Toca una tienda o una cuadrilla.</Text>}
      </Tarjeta>
      <Tarjeta>
        {Object.keys(COLOR).map((k) => (
          <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLOR[k] }} />
            <Text style={{ color: C.texto }}>{TEXTO[k]} · {m.tecnicos.filter((t) => t.estado === k).length}</Text>
          </View>
        ))}
        <Texto gris size={12}>Mapa esquemático de Caracas. Las cuadrillas aparecen en su última posición GPS (la app la envía cada 30 s mientras van en ruta o en servicio).</Texto>
      </Tarjeta>
    </Pantalla>
  );
}
