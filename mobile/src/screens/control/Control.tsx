import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden } from "../../types";
import { Aviso, Boton, C, Cargando, Etiqueta, Pantalla, Seccion, Tarjeta, Texto, tonoEstado } from "../../ui";

type Tec = { id: number; nombre: string; rol: string; grupo: string | null; reten_activo: boolean; verificado: boolean; registro_app_completo: boolean;
             documentos_faltantes: string[]; ayudantes: { nombre: string }[]; jefe: string | null };
type Resumen = {
  fecha: string; grupo_de_guardia: string;
  indicadores: { ordenes: number; sin_tecnico: number; en_ruta_o_en_servicio: number; completadas: number; incidencias_abiertas: number };
  ordenes: Orden[]; incidencias: { id: number; texto: string; tecnico: string | null }[]; reten: Tec[]; pendientes_de_alta: Tec[];
};

/** Centro de control en el teléfono: técnico supervisor (su tienda), supervisor y superadmin. */
export default function Control() {
  const nav = useNav();
  const { perfil, salir } = useSession();
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setR(await api<Resumen>("/supervisor/resumen")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  async function hacer(ruta: string, body: any = {}) {
    try { await api(ruta, { body }); await cargar(); } catch (e: any) { setError(e.message); }
  }

  const k = r?.indicadores;
  return (
    <Pantalla titulo="Centro de control" subtitulo={perfil?.nombre} volver={false} onRefresh={cargar}
      derecha={<Pressable accessibilityLabel="Salir" onPress={salir} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="log-out-outline" size={22} color={C.blanco} /></Pressable>}>
      <Aviso texto={error} />
      {!r ? <Cargando /> : (
        <>
          <Texto gris>Hoy {r.fecha} · Guardia del Grupo {r.grupo_de_guardia}</Texto>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Boton titulo="Mapa en vivo" icono="map" onPress={() => nav.push("mapa")} /></View>
            <View style={{ flex: 1 }}><Boton titulo="Analítica" icono="bar-chart" tipo="secundario" onPress={() => nav.push("analitica")} /></View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[["Órdenes", k!.ordenes, C.texto], ["En curso", k!.en_ruta_o_en_servicio, C.texto], ["Completadas", k!.completadas, C.ok],
              ["Sin técnico", k!.sin_tecnico, C.error], ["Incidencias", k!.incidencias_abiertas, C.alerta]].map(([t, v, col]) => (
              <View key={t as string} style={{ flexBasis: "30%", flexGrow: 1, backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12 }}>
                <Text style={{ fontSize: 12, color: C.gris }}>{t}</Text>
                <Text style={{ fontSize: 26, fontWeight: "900", color: col as string }}>{v as number}</Text>
              </View>
            ))}
          </View>

          {r.pendientes_de_alta.length ? (
            <Tarjeta>
              <Seccion color={C.alerta}>POR DAR DE ALTA ({r.pendientes_de_alta.length})</Seccion>
              {r.pendientes_de_alta.map((t) => (
                <Pressable key={t.id} onPress={() => nav.push("expediente", { id: t.id })} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 }}>
                  <View style={{ flex: 1 }}>
                    <Texto negrita>{t.nombre} · {t.rol === "ayudante" ? "Ayudante" : "Técnico"}</Texto>
                    <Texto gris size={13}>{t.registro_app_completo ? "Registro en la app listo" : "Falta registro en la app"} · {t.documentos_faltantes.length ? `faltan ${t.documentos_faltantes.length} documento(s)` : "expediente listo"}</Texto>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.gris} />
                </Pressable>
              ))}
            </Tarjeta>
          ) : null}

          <Seccion>ÓRDENES DE HOY</Seccion>
          {r.ordenes.length === 0 ? <Texto gris>Sin órdenes para hoy.</Texto> : null}
          {r.ordenes.map((o) => (
            <Tarjeta key={o.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Texto negrita>{o.codigo} · {o.tipo_servicio_texto}</Texto>
                <Etiqueta texto={o.estado_texto} tono={tonoEstado(o.estado)} />
              </View>
              <Texto gris size={13}>{o.franja} · {o.cliente.nombre} · {o.cliente.direccion}</Texto>
              <Texto size={14}>{o.tecnico ? `${o.tecnico.nombre}${o.ayudantes.length ? " + " + o.ayudantes.map((a) => a.nombre).join(", ") : ""}` : "SIN TÉCNICO"}</Texto>
              {["solicitud_enviada", "tecnico_asignado", "cita_confirmada"].includes(o.estado) ? (
                <Boton titulo={o.tecnico ? "Reasignar automáticamente" : "Buscar técnico"} tipo="secundario" icono="shuffle" onPress={() => hacer(`/supervisor/ordenes/${o.id}/reasignar`)} />
              ) : null}
            </Tarjeta>
          ))}

          {r.incidencias.length ? <Seccion color={C.alerta}>INCIDENCIAS</Seccion> : null}
          {r.incidencias.map((i) => (
            <Tarjeta key={i.id}>
              <Texto negrita>{i.texto}</Texto>
              <Texto gris size={13}>{i.tecnico ?? ""}</Texto>
              <Boton titulo="Marcar resuelta" tipo="secundario" onPress={() => hacer(`/supervisor/incidencias/${i.id}/resolver`)} />
            </Tarjeta>
          ))}

          <Tarjeta oscura>
            <Text style={{ color: C.blanco, fontSize: 16, fontWeight: "800" }}>Guardia Retén</Text>
            {r.reten.map((t) => (
              <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ flex: 1, color: C.blanco }}>{t.nombre}{t.ayudantes.length ? ` + ${t.ayudantes.map((a) => a.nombre).join(", ")}` : ""}</Text>
                <Pressable onPress={() => hacer(`/supervisor/tecnicos/${t.id}/reten`, { activo: !t.reten_activo })}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.reten_activo ? C.lima : "transparent", borderWidth: 1, borderColor: C.lima, justifyContent: "center" }}>
                  <Text style={{ fontWeight: "800", color: t.reten_activo ? C.marino : C.blanco }}>{t.reten_activo ? "Activado" : "Activar"}</Text>
                </Pressable>
              </View>
            ))}
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}
