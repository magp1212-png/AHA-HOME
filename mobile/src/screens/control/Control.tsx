import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden } from "../../types";
import { TasaDelDia } from "../../components";
import { BotonCuenta, Campana, Aviso, Boton, C, Cargando, Etiqueta, Pantalla, Seccion, Tarjeta, Texto, tonoEstado } from "../../ui";

type Tec = { id: number; nombre: string; rol: string; grupo: string | null; reten_activo: boolean; verificado: boolean; registro_app_completo: boolean;
             documentos_faltantes: string[]; ayudantes: { nombre: string }[]; jefe: string | null };
type Fila = { id: number; nombre: string; grupo: string | null; luz: "verde" | "roja" | "gris"; estado_texto: string; ayudantes: { nombre: string }[];
              ausente_motivo: string; respaldo_ofrecido: boolean; respaldo_activo: boolean };
type Equipo = { resumen: { verdes: number; rojas: number; grises: number; ordenes_sin_tecnico: number; ordenes_de_ausentes: number };
                faltan_tecnicos: boolean; equipo: Fila[]; respaldo: Fila[] };
const LUZ = { verde: "#1C9E62", roja: "#E5484D", gris: "#9AA8BA" };

function Luz({ color }: { color: "verde" | "roja" | "gris" }) {
  return <View accessibilityLabel={color === "verde" ? "Disponible" : color === "roja" ? "Ocupado" : "No disponible"}
    style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: LUZ[color], borderWidth: 3, borderColor: color === "gris" ? "#E2E8F0" : color === "verde" ? "#C9F0DA" : "#FAD4D5" }} />;
}

type Resumen = {
  fecha: string; grupo_de_guardia: string;
  indicadores: { ordenes: number; sin_tecnico: number; en_ruta_o_en_servicio: number; completadas: number; incidencias_abiertas: number; en_pausa_inspeccion: number };
  ordenes: Orden[]; incidencias: { id: number; texto: string; tecnico: string | null }[]; reten: Tec[]; pendientes_de_alta: Tec[];
};

/** Centro de control en el teléfono: técnico supervisor (su tienda), supervisor y superadmin. */
export default function Control() {
  const nav = useNav();
  const { perfil, salir } = useSession();
  const [r, setR] = useState<Resumen | null>(null);
  const [eq, setEq] = useState<Equipo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api<Resumen>("/supervisor/resumen"), api<Equipo>("/supervisor/equipo-hoy")]);
      setR(a); setEq(b); setError(null);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  async function hacer(ruta: string, body: any = {}) {
    try { await api(ruta, { body }); await cargar(); } catch (e: any) { setError(e.message); }
  }

  const k = r?.indicadores;
  return (
    <Pantalla titulo="Centro de control" subtitulo={perfil?.nombre} volver={false} onRefresh={cargar}
      derecha={<><Campana /><BotonCuenta /></>}>
      <Aviso texto={error} />
      {!r ? <Cargando /> : (
        <>
          <Texto gris>Hoy {r.fecha} · Guardia del Grupo {r.grupo_de_guardia}</Texto>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Boton titulo="Mapa en vivo" icono="map" onPress={() => nav.push("mapa")} /></View>
            <View style={{ flex: 1 }}><Boton titulo="Analítica" icono="bar-chart" tipo="secundario" onPress={() => nav.push("analitica")} /></View>
          </View>
          <Boton titulo="Presupuestos y pagos" icono="cash-outline" tipo="lima" onPress={() => nav.push("pagos")} />
          <Boton titulo="Mensajes de soporte" icono="headset-outline" tipo="secundario" onPress={() => nav.push("soporteBandeja")} />
          {perfil?.es_ceo ? <Boton titulo="Centro de mando · auditoría del equipo" icono="shield-checkmark" tipo="naranja" onPress={() => nav.push("auditoria")} /> : null}
          <TasaDelDia editable={perfil?.rol === "superadmin"} />
          {perfil?.rol === "superadmin" ? <Boton titulo="QR de las tiendas" icono="qr-code-outline" tipo="secundario" onPress={() => nav.push("tiendasQR")} /> : null}
          {perfil?.rol === "superadmin" ? <Boton titulo="Banners y aliados" icono="megaphone-outline" tipo="secundario" onPress={() => nav.push("banners")} /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[["Órdenes", k!.ordenes, C.texto], ["En curso", k!.en_ruta_o_en_servicio, C.texto], ["Completadas", k!.completadas, C.ok],
              ["Sin técnico", k!.sin_tecnico, C.error], ["Incidencias", k!.incidencias_abiertas, C.alerta], ["En pausa (inspección)", k!.en_pausa_inspeccion ?? 0, C.alerta]].map(([t, v, col]) => (
              <View key={t as string} style={{ flexBasis: "30%", flexGrow: 1, backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12 }}>
                <Text style={{ fontSize: 12, color: C.gris }}>{t}</Text>
                <Text style={{ fontSize: 26, fontWeight: "900", color: col as string }}>{v as number}</Text>
              </View>
            ))}
          </View>

          {eq ? (
            <Tarjeta>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Seccion>EQUIPO DE HOY</Seccion>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Luz color="verde" /><Text style={{ fontWeight: "800", color: C.texto }}>{eq.resumen.verdes}</Text></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Luz color="roja" /><Text style={{ fontWeight: "800", color: C.texto }}>{eq.resumen.rojas}</Text></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Luz color="gris" /><Text style={{ fontWeight: "800", color: C.texto }}>{eq.resumen.grises}</Text></View>
                </View>
              </View>
              {eq.faltan_tecnicos ? (
                <Aviso texto={"Faltan técnicos: " + [
                  eq.resumen.grises ? `${eq.resumen.grises} no puede(n) trabajar hoy` : "",
                  eq.resumen.ordenes_sin_tecnico ? `${eq.resumen.ordenes_sin_tecnico} orden(es) sin técnico` : "",
                  eq.resumen.ordenes_de_ausentes ? `${eq.resumen.ordenes_de_ausentes} orden(es) de técnicos ausentes por reasignar` : "",
                ].filter(Boolean).join(", ") + ". Activa a alguien del respaldo del día."} />
              ) : null}
              {eq.equipo.map((f) => (
                <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                  <Luz color={f.luz} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: C.texto }}>{f.nombre}{f.ayudantes.length ? ` + ${f.ayudantes.map((a) => a.nombre.split(" ")[0]).join(", ")}` : ""}</Text>
                    <Text style={{ fontSize: 12, color: C.gris }}>{f.respaldo_activo ? "Respaldo · " : f.grupo === "RETEN" ? "Retén · " : `Grupo ${f.grupo} · `}{f.estado_texto}{f.ausente_motivo ? ` (${f.ausente_motivo})` : ""}</Text>
                  </View>
                </View>
              ))}
              <Text style={{ fontSize: 12, color: C.gris }}>Verde: disponible · Roja: ocupado en un servicio · Gris: no puede trabajar hoy</Text>
            </Tarjeta>
          ) : null}

          {eq ? (
            <Tarjeta>
              <Seccion color={eq.faltan_tecnicos ? C.alerta : C.marino}>RESPALDO DEL DÍA ({eq.respaldo.length})</Seccion>
              {eq.respaldo.length === 0 ? <Texto gris size={14}>Nadie se ha ofrecido todavía. Los técnicos que no están de guardia pueden ofrecerse desde su app.</Texto> : null}
              {eq.respaldo.map((f) => (
                <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 }}>
                  <Luz color="verde" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: C.texto }}>{f.nombre}</Text>
                    <Text style={{ fontSize: 12, color: C.gris }}>{f.grupo === "RETEN" ? "Guardia Retén" : `Grupo ${f.grupo} · se ofreció para hoy`}</Text>
                  </View>
                  <Pressable onPress={() => hacer(`/supervisor/tecnicos/${f.id}/respaldo`, { activo: true })}
                    style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.marino, justifyContent: "center" }}>
                    <Text style={{ color: C.blanco, fontWeight: "800" }}>Activar</Text>
                  </Pressable>
                </View>
              ))}
            </Tarjeta>
          ) : null}

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
              <Texto gris size={13}>{o.franja} · {o.cliente.nombre} · {o.cliente.tipo_inmueble_texto ? `${o.cliente.tipo_inmueble_texto} · ` : ""}{o.cliente.direccion}</Texto>
              {o.pago_instalacion?.pagado ? (
                <Texto size={13}>💳 Pagado en tienda: {o.pago_instalacion.cobrado} · {o.pago_instalacion.metodo_texto}
                  {o.pago_instalacion.moneda === "Bs" ? ` (USD ${o.pago_instalacion.monto_usd} · tasa ${o.pago_instalacion.tasa})` : " · en dólares"}</Texto>
              ) : null}
              <Texto size={14}>{o.tecnico ? `${o.tecnico.nombre}${o.ayudantes.length ? " + " + o.ayudantes.map((a) => a.nombre).join(", ") : ""}` : "SIN TÉCNICO"}</Texto>
              {o.pausa?.activa ? (
                <View style={{ gap: 8, backgroundColor: o.pausa.vencida ? "#FDECEC" : C.limaSuave, borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontWeight: "800", color: o.pausa.vencida ? C.error : C.marino }}>
                    En pausa por inspección · {o.pausa.horas} h de {o.pausa.limite_horas} h{o.pausa.vencida ? " · VENCIDA" : ""}
                  </Text>
                  <Texto gris size={13}>{o.presupuesto ? `Presupuesto: ${o.presupuesto.estado_texto}` : "Falta que el técnico inspeccione y envíe el presupuesto."}</Texto>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}><Boton titulo="Extender" tipo="secundario" onPress={() => hacer(`/supervisor/ordenes/${o.id}/pausa`, { accion: "extender" })} /></View>
                    <View style={{ flex: 1 }}><Boton titulo="Quitar inspección" tipo="peligro" onPress={() => hacer(`/supervisor/ordenes/${o.id}/pausa`, { accion: "quitar_inspeccion" })} /></View>
                  </View>
                </View>
              ) : null}
              <Boton titulo="Ver chat de la orden" tipo="secundario" icono="chatbubble-ellipses-outline" onPress={() => nav.push("chat", { id: o.id })} />
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
