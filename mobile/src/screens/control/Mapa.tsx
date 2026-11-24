import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import MapaReal from "../../MapaReal";
import { Aviso, C, Cargando, Pantalla, Tarjeta, Texto } from "../../ui";

type Mapa = {
  tiendas: { id: number; nombre: string; zona: string; direccion: string; lat: number; lng: number }[];
  tecnicos: { id: number; nombre: string; ayudantes: string[]; grupo: string | null; estado: string; lat: number; lng: number; gps_en: string | null;
              orden: { codigo: string; servicio: string; direccion: string; lat: number | null; lng: number | null; franja: string } | null }[];
};

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
  const tec = m.tecnicos.find((t) => `t${t.id}` === foco);
  const tienda = m.tiendas.find((t) => `s${t.id}` === foco);

  return (
    <Pantalla titulo="Mapa en vivo" subtitulo="Se actualiza cada 15 segundos" onRefresh={cargar}>
      <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.linea }}>
        <MapaReal alto={380} puntos={[
          ...m.tiendas.map((s) => ({ lat: s.lat, lng: s.lng, tipo: "tienda" as const, titulo: s.nombre, detalle: s.direccion, destacado: s.nombre.includes("San Martín") })),
          ...m.tecnicos.map((t) => ({ lat: t.lat, lng: t.lng, tipo: (t.estado === "en_ruta" ? "camion" : "tecnico") as "camion" | "tecnico", color: COLOR[t.estado],
            titulo: `${t.nombre}${t.ayudantes.length ? " + " + t.ayudantes.join(", ") : ""}`, detalle: `${TEXTO[t.estado]}${t.orden ? " · " + t.orden.codigo : ""}` })),
          ...m.tecnicos.filter((t) => t.orden?.lat && t.orden?.lng).map((t) => ({ lat: t.orden!.lat!, lng: t.orden!.lng!, tipo: "casa" as const,
            titulo: `Cliente · ${t.orden!.codigo}`, detalle: `${t.orden!.direccion} · ${t.orden!.franja}` })),
        ]} rutas={m.tecnicos.filter((t) => t.orden?.lat && t.orden?.lng && t.estado === "en_ruta")
          .map((t) => ({ desde: [t.lat, t.lng] as [number, number], hasta: [t.orden!.lat!, t.orden!.lng!] as [number, number] }))} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {m.tecnicos.map((t) => (
          <Pressable key={t.id} accessibilityRole="button" onPress={() => setFoco(`t${t.id}`)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 16, paddingHorizontal: 10, minHeight: 34,
              backgroundColor: foco === `t${t.id}` ? C.marino : C.blanco, borderWidth: 1, borderColor: C.borde }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLOR[t.estado] }} />
            <Text style={{ color: foco === `t${t.id}` ? C.blanco : C.texto, fontWeight: "700", fontSize: 13 }}>{t.nombre.split(" ")[0]}</Text>
          </Pressable>
        ))}
        {m.tiendas.map((s) => (
          <Pressable key={`s${s.id}`} accessibilityRole="button" onPress={() => setFoco(`s${s.id}`)}
            style={{ borderRadius: 16, paddingHorizontal: 10, minHeight: 34, justifyContent: "center", backgroundColor: foco === `s${s.id}` ? C.marino : C.limaSuave }}>
            <Text style={{ color: foco === `s${s.id}` ? C.blanco : C.marino, fontWeight: "700", fontSize: 13 }}>★ {s.nombre.replace("Damasco ", "")}</Text>
          </Pressable>
        ))}
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
        <Texto gris size={12}>Mapa de Caracas (OpenStreetMap). Toca un punto para ver su detalle. Las cuadrillas aparecen en su última posición GPS (la app la envía cada 30 s mientras van en ruta o en servicio).</Texto>
      </Tarjeta>
    </Pantalla>
  );
}
