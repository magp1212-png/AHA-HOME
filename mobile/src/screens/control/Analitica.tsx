import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { Aviso, Avatar, C, Cargando, Etiqueta, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

type A = {
  desde: string; hasta: string;
  indicadores: { ordenes: number; completadas: number; canceladas: number; articulos: number; instalaciones: number;
                 calificacion_promedio: number | null; tiempo_total_promedio_min: number | null; incidencias: number };
  por_tienda: { tienda: string; ordenes: number }[];
  por_dia: { fecha: string; traslado: number; instalacion: number; traslado_instalacion: number }[];
  calor: { dias: string[]; horas: number[]; valores: number[][] };
  articulos: { texto: string; total: number; instalados: number }[];
  tiempos_promedio_min: Record<string, number>;
  cumplimiento: Record<string, number | null>;
  estrellas: Record<string, number>;
  ranking: { id: number; nombre: string; foto: string | null; grupo: string | null; ayudantes: string[]; servicios: number; calificacion: number | null;
             resenas: number; puntualidad: number; sin_incidencias: number; incidencias: number; indice: number; impecable: boolean }[];
  resenas: { orden: string; cliente: string; estrellas: number; comentario: string; tecnico: string | null; tecnico_id: number | null; servicio: string; fecha: string }[];
};

const SERIE = { traslado: "#2A78D6", traslado_instalacion: "#EB6834", instalacion: "#1BAF7A" };
const RAMPA = ["#EEF0FA", "#CDD2EE", "#9DA5D9", "#6B74C0", "#3F4795", "#21244D"];
const RANGOS: [string, number][] = [["7 días", 6], ["30 días", 29], ["90 días", 89]];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (m?: number | null) => (m == null ? "—" : m < 1 ? "menos de 1 min" : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

/** Panel de analítica: qué tienda pide más, cuándo, qué artículos, cumplimiento, ranking de técnicos y reseñas. */
export default function Analitica() {
  const [rango, setRango] = useState(29);
  const [a, setA] = useState<A | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tec, setTec] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const hasta = new Date(); const desde = new Date(Date.now() - rango * 86400000);
    try { setA(await api<A>("/supervisor/analitica", { query: { desde: iso(desde), hasta: iso(hasta) } })); setError(null); } catch (e: any) { setError(e.message); }
  }, [rango]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!a) return <Pantalla titulo="Analítica">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  const k = a.indicadores;
  const maxT = Math.max(1, ...a.por_tienda.map((x) => x.ordenes));
  const maxD = Math.max(1, ...a.por_dia.map((d) => d.traslado + d.instalacion + d.traslado_instalacion));
  const maxC = Math.max(1, ...a.calor.valores.flat());
  const maxA = Math.max(1, ...a.articulos.map((x) => x.total));
  const totEst = Math.max(1, Object.values(a.estrellas).reduce((s, v) => s + v, 0));
  const sel = a.ranking.find((r) => r.id === tec) ?? a.ranking[0];
  const resenasSel = a.resenas.filter((r) => !sel || r.tecnico_id === sel.id);

  return (
    <Pantalla titulo="Analítica" subtitulo={`${a.desde} → ${a.hasta}`} onRefresh={cargar}>
      <Fila>{RANGOS.map(([t, d]) => <Opcion key={t} texto={t} activo={rango === d} onPress={() => setRango(d)} />)}</Fila>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {[["Órdenes", k.ordenes], ["Completadas", k.completadas], ["Artículos", k.articulos], ["Instalaciones", k.instalaciones],
          ["Calificación", k.calificacion_promedio?.toFixed(2).replace(".", ",") ?? "—"], ["Tiempo total", hm(k.tiempo_total_promedio_min)],
          ["Incidencias", k.incidencias], ["Canceladas", k.canceladas]].map(([t, v]) => (
          <View key={t as string} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12 }}>
            <Text style={{ fontSize: 12, color: C.gris }}>{t}</Text>
            <Text style={{ fontSize: 24, fontWeight: "900", color: C.texto }}>{String(v)}</Text>
          </View>
        ))}
      </View>

      <Tarjeta>
        <Seccion>¿QUÉ TIENDA SOLICITA MÁS EL SERVICIO?</Seccion>
        {a.por_tienda.length === 0 ? <Texto gris>Sin órdenes en este período.</Texto> : null}
        {a.por_tienda.map((t, i) => (
          <Pressable key={t.tienda} onPress={() => setDetalle(`${t.tienda}: ${t.ordenes} órdenes`)} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, fontWeight: i === 0 ? "800" : "500", color: C.texto }}>{t.tienda}</Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: C.texto }}>{t.ordenes}</Text>
            </View>
            <View style={{ height: 16, backgroundColor: "#F4F7FB", borderRadius: 4 }}>
              <View style={{ width: `${(t.ordenes / maxT) * 100}%`, height: 16, borderRadius: 4, backgroundColor: i === 0 ? C.marino : "#6B74C0" }} />
            </View>
          </Pressable>
        ))}
      </Tarjeta>

      <Tarjeta>
        <Seccion>ÓRDENES POR DÍA Y TIPO DE SERVICIO</Seccion>
        <Fila wrap>
          {(Object.keys(SERIE) as (keyof typeof SERIE)[]).map((s) => (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginRight: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: SERIE[s] }} />
              <Text style={{ fontSize: 12, color: C.gris }}>{s === "traslado" ? "Traslado" : s === "instalacion" ? "Instalación" : "Traslado e instalación"}</Text>
            </View>
          ))}
        </Fila>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 4, height: 150, borderBottomWidth: 1, borderBottomColor: C.borde }}>
          {a.por_dia.slice(-21).map((d) => {
            const tot = d.traslado + d.instalacion + d.traslado_instalacion;
            return (
              <Pressable key={d.fecha} onPress={() => setDetalle(`${d.fecha}: ${tot} órdenes · ${d.traslado} traslado · ${d.traslado_instalacion} traslado e instalación · ${d.instalacion} instalación`)}
                style={{ flex: 1, maxWidth: 30, height: "100%", justifyContent: "flex-end" }}>
                {(["instalacion", "traslado_instalacion", "traslado"] as const).map((s, j) => d[s] ? (
                  <View key={s} style={{ height: (d[s] / maxD) * 140, backgroundColor: SERIE[s], borderTopLeftRadius: j === 0 ? 3 : 0, borderTopRightRadius: j === 0 ? 3 : 0, marginTop: 1 }} />
                ) : null)}
              </Pressable>
            );
          })}
        </View>
        {detalle ? <Text style={{ fontSize: 12, color: C.gris }}>{detalle}</Text> : <Text style={{ fontSize: 12, color: C.gris }}>Toca una barra para ver el detalle.</Text>}
      </Tarjeta>

      <Tarjeta>
        <Seccion>¿CUÁNDO PIDEN MÁS? DÍA Y HORA</Seccion>
        <View style={{ flexDirection: "row", gap: 2 }}>
          <View style={{ width: 30 }} />
          {a.calor.horas.map((h) => <Text key={h} style={{ flex: 1, fontSize: 9, color: C.gris, textAlign: "center" }}>{h}</Text>)}
        </View>
        {a.calor.valores.map((fila, di) => (
          <View key={di} style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
            <Text style={{ width: 30, fontSize: 11, color: C.gris }}>{a.calor.dias[di]}</Text>
            {fila.map((v, hi) => (
              <Pressable key={hi} onPress={() => setDetalle(`${a.calor.dias[di]} ${a.calor.horas[hi]}:00 · ${v} solicitudes`)}
                style={{ flex: 1, height: 20, borderRadius: 3, backgroundColor: RAMPA[Math.min(5, Math.ceil((v / maxC) * 5))] }} />
            ))}
          </View>
        ))}
      </Tarjeta>

      <Tarjeta>
        <Seccion>ARTÍCULOS MÁS SOLICITADOS</Seccion>
        {a.articulos.map((x) => (
          <View key={x.texto} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: C.texto }}>{x.texto}</Text>
              <Text style={{ fontSize: 13, color: C.texto }}><Text style={{ fontWeight: "800" }}>{x.total}</Text> · {x.instalados} instalados</Text>
            </View>
            <View style={{ height: 12, backgroundColor: "#F4F7FB", borderRadius: 4 }}>
              <View style={{ width: `${(x.total / maxA) * 100}%`, height: 12, borderRadius: 4, backgroundColor: C.marino }} />
            </View>
          </View>
        ))}
      </Tarjeta>

      <Tarjeta>
        <Seccion>CUMPLIMIENTO</Seccion>
        {[["Llegada dentro de la franja", "llegada_en_franja"], ["Cierre con fotos de evidencia", "cierre_con_evidencia"],
          ["Retiro de residuos en instalaciones", "retiro_de_residuos"], ["Órdenes sin incidencias", "sin_incidencias"], ["Clientes que califican", "clientes_que_califican"]].map(([t, key]) => {
          const v = a.cumplimiento[key];
          return (
            <View key={key} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: C.texto }}>{t}</Text><Text style={{ fontSize: 13, fontWeight: "800", color: C.texto }}>{v == null ? "—" : `${v}%`}</Text>
              </View>
              <View style={{ height: 10, backgroundColor: "#EEF2F7", borderRadius: 5 }}><View style={{ width: `${v ?? 0}%`, height: 10, borderRadius: 5, backgroundColor: C.marino }} /></View>
            </View>
          );
        })}
        <Text style={{ fontSize: 12, color: C.gris }}>Tiempos promedio: caja→asignado {hm(a.tiempos_promedio_min.caja_a_asignado)} · asignado→en ruta {hm(a.tiempos_promedio_min.asignado_a_ruta)} · traslado {hm(a.tiempos_promedio_min.traslado)} · servicio {hm(a.tiempos_promedio_min.servicio)}</Text>
      </Tarjeta>

      <Tarjeta>
        <Seccion>RANKING DE TÉCNICOS</Seccion>
        <Texto gris size={12}>Índice de excelencia: 40 % calificación, 30 % puntualidad y 30 % servicios sin incidencias.</Texto>
        {a.ranking.length === 0 ? <Texto gris>Aún no hay servicios completados.</Texto> : null}
        {a.ranking.map((r, i) => (
          <Pressable key={r.id} onPress={() => setTec(r.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, backgroundColor: sel?.id === r.id ? C.limaSuave : "transparent" }}>
            <Text style={{ width: 20, fontWeight: "900", color: C.texto }}>{i + 1}</Text>
            <Avatar nombre={r.nombre} foto={r.foto} size={38} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ fontWeight: "800", color: C.texto }}>{r.nombre}</Text>
                {r.impecable ? <Etiqueta texto="IMPECABLE" tono="lima" /> : null}
              </View>
              <Text style={{ fontSize: 12, color: C.gris }}>
                ★ {r.calificacion?.toFixed(2).replace(".", ",") ?? "—"} ({r.resenas}) · {r.servicios} servicios · {r.puntualidad}% puntual · {r.incidencias} incid.
              </Text>
            </View>
            <Text style={{ fontWeight: "900", fontSize: 18, color: C.marino }}>{r.indice}</Text>
          </Pressable>
        ))}
      </Tarjeta>

      <Tarjeta>
        <Seccion>DISTRIBUCIÓN DE CALIFICACIONES</Seccion>
        {["5", "4", "3", "2", "1"].map((n) => (
          <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ width: 28, fontSize: 13, color: C.texto }}>{n} ★</Text>
            <View style={{ flex: 1, height: 12, backgroundColor: "#F4F7FB", borderRadius: 4 }}>
              <View style={{ width: `${((a.estrellas[n] ?? 0) / totEst) * 100}%`, height: 12, borderRadius: 4, backgroundColor: "#E8A317" }} />
            </View>
            <Text style={{ width: 30, fontSize: 13, color: C.texto, textAlign: "right" }}>{a.estrellas[n] ?? 0}</Text>
          </View>
        ))}
      </Tarjeta>

      <Seccion>RESEÑAS{sel ? ` · ${sel.nombre.toUpperCase()}` : ""}</Seccion>
      {resenasSel.length === 0 ? <Texto gris>Sin reseñas todavía.</Texto> : null}
      {resenasSel.map((r) => (
        <Tarjeta key={r.orden}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Texto negrita>{r.cliente}</Texto><Text style={{ fontSize: 12, color: C.gris }}>{r.fecha} · {r.orden}</Text>
          </View>
          <View style={{ flexDirection: "row" }}>{[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= r.estrellas ? "star" : "star-outline"} size={16} color="#E8A317" />)}</View>
          {r.comentario ? <Texto>{r.comentario}</Texto> : <Texto gris>Sin comentario.</Texto>}
          <Text style={{ fontSize: 12, color: C.gris }}>{r.servicio}</Text>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
