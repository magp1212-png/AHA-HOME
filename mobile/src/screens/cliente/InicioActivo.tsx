// Inicio del cliente con estilo iPhone: 3 accesos, mapa del pedido, tipo de servicio,
// seguimiento plegable con chat, mensajes de AHA HOME, banners de aliados y menú flotante.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { api } from "../../api";
import { Calendario, Camion, Campana, Equipos } from "../../ilustraciones";
import { MenuFlotanteCliente } from "../../menus";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden } from "../../types";
import { Avatar, C, Logo, useAvisos } from "../../ui";

const vidrio = { backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)",
  shadowColor: "#21244D", shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;

const CORTO: Record<string, string> = { tecnico_asignado: "Técnico asignado", cita_confirmada: "Cita confirmada", en_ruta: "En camino",
  en_progreso: "En tu casa", completado: "Completado" };
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }) : "—");

const DESCRIPCION: Record<string, string> = {
  traslado: "Retiramos tu compra en la tienda y te la llevamos a casa en su caja, tal como sale de la tienda.",
  instalacion: "Vamos a tu casa e instalamos tu equipo, y nos llevamos las cajas, el anime y los plásticos.",
  traslado_instalacion: "Retiramos tu compra en la tienda, la llevamos a tu casa, la desembalamos, la instalamos y nos llevamos las cajas.",
};

// Mensajes propios de AHA HOME y espacios para aliados (por ahora fijos; luego se cargan desde el centro de control).
const MENSAJES = [
  { titulo: "Instalación + retiro de cajas", texto: "Todo incluido desde la caja de tu tienda" },
  { titulo: "Inspección antes de instalar", texto: "Pídela y te damos el presupuesto sin compromiso" },
  { titulo: "Califica a tu técnico", texto: "Tu opinión premia a los mejores" },
];
const ALIADOS = [
  { etiqueta: "ALIADO · PRÓXIMAMENTE", titulo: "Tu marca aquí", boton: "VER BENEFICIO", fondo: C.lima, texto: C.marino },
  { etiqueta: "ALIADO · PRÓXIMAMENTE", titulo: "Promoción de la tienda", boton: "VER MÁS", fondo: "#2A78D6", texto: C.blanco },
];

function Mapa({ o }: { o: Orden }) {
  // Mapa esquemático: la estrella es la tienda donde compró; el pin verde, su casa; el camión, la cuadrilla.
  const pos = o.estado === "en_ruta" ? [175, 112] : ["en_progreso", "completado"].includes(o.estado) ? [282, 70] : [70, 70];
  const recorrido = o.estado === "en_ruta" ? "M70 70 C110 70 130 112 175 112" : ["en_progreso", "completado"].includes(o.estado)
    ? "M70 70 C110 70 130 112 175 112 S250 100 292 58" : "";
  const estado = o.estado === "en_ruta" ? "En camino a tu casa" : o.estado === "en_progreso" ? "La cuadrilla está en tu casa"
    : o.estado === "completado" ? "Servicio completado" : o.con_retiro_en_tienda ? `Por retirar · ${o.franja.replace("-", " – ")}` : `Cita · ${o.franja.replace("-", " – ")}`;
  function verMapa() {
    const destino = o.cliente.lat && o.cliente.lng ? `${o.cliente.lat},${o.cliente.lng}` : `${o.cliente.direccion}, Caracas`;
    const origen = `${o.tienda.direccion || o.tienda.nombre}, Caracas`;
    Linking.openURL(Platform.OS === "ios" ? `maps://?saddr=${encodeURIComponent(origen)}&daddr=${encodeURIComponent(destino)}`
      : `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origen)}&destination=${encodeURIComponent(destino)}`);
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ver la ruta en el mapa" onPress={verMapa}
      style={{ borderRadius: 24, overflow: "hidden", ...vidrio }}>
      <Svg width="100%" height={190} viewBox="0 0 358 190" preserveAspectRatio="xMidYMid slice">
        <Rect width={358} height={190} fill="#E8EFE6" />
        <Path d="M0 40 C80 30 160 55 240 40 S340 35 358 30 V0 H0Z" fill="#D5E6CC" />
        <G stroke="#fff" strokeWidth={9} fill="none" strokeLinecap="round">
          <Path d="M-10 120 C80 112 160 130 260 118 S340 110 370 116" /><Path d="M120 -10 L140 200" /><Path d="M250 -10 C240 60 270 130 255 200" />
        </G>
        <G stroke="#fff" strokeWidth={4} fill="none"><Path d="M-10 75 H370" /><Path d="M60 -10 V200" /><Path d="M310 -10 V200" /><Path d="M-10 165 H370" /></G>
        <Path d="M70 70 C110 70 130 112 175 112 S250 100 292 58" stroke={C.marino} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray="2 9" />
        {recorrido ? <Path d={recorrido} stroke={C.naranja} strokeWidth={5} fill="none" strokeLinecap="round" /> : null}
        <G transform="translate(70 70)">
          <Circle r={20} fill={C.lima} opacity={0.35} /><Circle r={15} fill={C.marino} />
          <Path d="M0 -9 L2.6 -2.8 L9.3 -2.8 L3.9 1.2 L5.9 7.6 L0 3.8 L-5.9 7.6 L-3.9 1.2 L-9.3 -2.8 L-2.6 -2.8Z" fill={C.lima} />
        </G>
        <G transform="translate(292 58)">
          <Path d="M0 -26 C-11 -26 -17 -18 -17 -10 C-17 2 0 14 0 14 C0 14 17 2 17 -10 C17 -18 11 -26 0 -26Z" fill="#1E8A4C" />
          <Path d="M-7 -10 L0 -16 L7 -10 V-3 H-7Z" fill="#fff" />
        </G>
        <G transform={`translate(${pos[0]} ${pos[1]})`}>
          <Circle r={14} fill={C.naranja} stroke="#fff" strokeWidth={3} />
          <Path d="M-7 -4h8v7h-8z M1 -1h3l3 3v1h-6z" fill="#fff" />
        </G>
      </Svg>
      <View style={{ position: "absolute", left: 10, top: 10, backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: C.texto }}>★ {o.tienda.nombre}</Text>
        <Text style={{ fontSize: 11, color: C.gris }}>donde compraste</Text>
      </View>
      <View style={{ position: "absolute", right: 10, top: 86, backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 150 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: C.texto }}>Tu casa</Text>
        <Text style={{ fontSize: 11, color: C.gris }} numberOfLines={1}>{o.cliente.direccion}</Text>
      </View>
      <View style={{ position: "absolute", left: 10, right: 10, bottom: 10, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.9)",
        flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.naranja }} />
        <Text style={{ flex: 1, fontSize: 13.5, color: C.texto, fontWeight: "600" }} numberOfLines={1}>{estado}</Text>
        <Text style={{ fontWeight: "800", color: C.marino }}>Ver mapa ›</Text>
      </View>
    </Pressable>
  );
}

function TuServicio({ o }: { o: Orden }) {
  const tipos: [string, string][] = [["traslado", "Traslado"], ["instalacion", "Instalación"], ["traslado_instalacion", "Traslado e instalación"]];
  return (
    <View style={{ borderRadius: 22, padding: 14, gap: 8, ...vidrio }}>
      <Text style={{ fontWeight: "900", fontSize: 15, color: C.texto }}>Tu servicio</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {tipos.map(([k, t]) => {
          const on = o.tipo_servicio === k;
          return (
            <Text key={k} style={{ fontSize: 12.5, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, overflow: "hidden",
              backgroundColor: on ? C.marino : "#EEF2F7", color: on ? C.lima : C.gris }}>{on ? "✓ " : ""}{t}</Text>
          );
        })}
        <Text style={{ fontSize: 12.5, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, overflow: "hidden",
          backgroundColor: o.inspeccion.requerida ? C.naranjaSuave : "#EEF2F7", color: o.inspeccion.requerida ? C.naranja : C.gris }}>
          {o.inspeccion.requerida ? "+ Inspección" : "Inspección"}
        </Text>
      </View>
      <Text style={{ fontSize: 13.5, color: C.gris, lineHeight: 19 }}>
        {DESCRIPCION[o.tipo_servicio]}{o.inspeccion.requerida ? " Antes, el técnico inspecciona y te da el presupuesto." : ""}
      </Text>
    </View>
  );
}

function Seguimiento({ o, chatNuevos }: { o: Orden; chatNuevos: number }) {
  const nav = useNav();
  const [abierto, setAbierto] = useState(false);
  const visible = ["en_ruta", "en_progreso", "completado"].includes(o.estado);
  const nombreTec = visible && o.tecnico ? o.tecnico.nombre : "Tu técnico";
  const ev = Object.fromEntries(o.linea_de_tiempo.map((p) => [p.estado, p]));
  const pasos = [
    { k: "tecnico_asignado", t: "Técnico asignado", d: visible && o.tecnico ? `${o.tecnico.nombre}${o.ayudantes[0] ? " + " + o.ayudantes[0].nombre.split(" ")[0] : ""}` : "Verás su foto cuando salga con tu pedido" },
    { k: "cita_confirmada", t: "Cita confirmada", d: `${o.fecha} · ${o.franja.replace("-", " – ")}` },
    { k: "en_ruta", t: o.con_retiro_en_tienda ? "Retiró tu compra · en camino" : "En camino", d: o.con_retiro_en_tienda ? `${o.tienda.nombre} · QR validado` : "Va hacia tu casa" },
    { k: "en_progreso", t: "Llegó a tu casa", d: o.tipo_servicio === "traslado" ? "Entrega en su caja" : "Instalación y retiro de cajas" },
    { k: "completado", t: "Servicio completado", d: "Fotos de evidencia cargadas" },
  ];
  const actual = pasos.filter((p) => ev[p.k]?.hecho).pop();
  return (
    <View style={{ borderRadius: 24, padding: 14, gap: 10, ...vidrio }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: abierto }} onPress={() => setAbierto(!abierto)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Camion size={64} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16.5, fontWeight: "800", color: C.texto }}>Seguimiento del servicio</Text>
          <Text style={{ fontSize: 12.5, color: C.gris }}>{o.codigo} · {o.fecha} {o.franja.replace("-", " – ")}</Text>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: abierto ? C.marino : "#EEF2F7" }}>
          <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={20} color={abierto ? C.lima : C.marino} />
        </View>
      </Pressable>
      {!abierto ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.fondo, borderRadius: 14, padding: 8 }}>
          <Avatar nombre={nombreTec} foto={visible ? o.tecnico?.foto : null} size={30} />
          <Text style={{ flex: 1, fontSize: 13, color: C.gris }} numberOfLines={2}>
            <Text style={{ fontWeight: "800", color: C.texto }}>{nombreTec.split(" ")[0]}{visible && o.tecnico ? ` ${nombreTec.split(" ")[1]?.[0] ?? ""}.` : ""}</Text>
            {ev.en_ruta?.hecho && o.con_retiro_en_tienda ? ` · Retiró ${hora(ev.en_ruta.fecha)}` : ""}
            {" · "}<Text style={{ fontWeight: "800", color: C.naranja }}>{CORTO[actual?.k ?? ""] ?? o.estado_texto}</Text>
          </Text>
          <BotonChat id={o.id} n={chatNuevos} chico />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.fondo, borderRadius: 16, padding: 10 }}>
            <Avatar nombre={nombreTec} foto={visible ? o.tecnico?.foto : null} size={46} borde={C.lima} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 15, color: C.texto }}>{nombreTec}</Text>
              <Text style={{ fontSize: 12.5, color: C.gris }}>
                Técnico asignado{o.tecnico?.calificacion != null ? ` · ★ ${o.tecnico.calificacion.toFixed(1)}` : ""}
                {visible && o.ayudantes[0] ? ` · Ayudante: ${o.ayudantes[0].nombre}` : ""}
              </Text>
            </View>
            <BotonChat id={o.id} n={chatNuevos} />
          </View>
          {pasos.map((p, i) => {
            const hecho = !!ev[p.k]?.hecho;
            return (
              <View key={p.k} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ alignItems: "center" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: hecho ? C.ok : C.linea, alignItems: "center", justifyContent: "center" }}>
                    {hecho ? <Ionicons name="checkmark" size={15} color={C.blanco} /> : null}
                  </View>
                  {i < pasos.length - 1 ? <View style={{ width: 2, height: 16, backgroundColor: hecho ? C.ok : C.linea }} /> : null}
                </View>
                <View style={{ flex: 1, marginTop: i < pasos.length - 1 ? -16 : 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: hecho ? C.texto : C.gris }}>{p.t}</Text>
                  <Text style={{ fontSize: 12, color: C.gris }}>{p.d}</Text>
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: "800", color: C.marino, marginTop: i < pasos.length - 1 ? -16 : 0 }}>{hecho ? hora(ev[p.k].fecha) : "—"}</Text>
              </View>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => nav.push("rastreo", { id: o.id })} style={{ alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
            <Text style={{ color: C.marino, fontWeight: "800" }}>Ver todo el detalle ›</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** Ícono rojo de chat con el número de mensajes nuevos. */
export function BotonChat({ id, n, chico }: { id: number; n: number; chico?: boolean }) {
  const nav = useNav();
  const s = chico ? 34 : 42;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Chat con el técnico${n ? `, ${n} mensajes nuevos` : ""}`} onPress={() => nav.push("chat", { id })}
      style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: "#D92D20", alignItems: "center", justifyContent: "center",
        shadowColor: "#D92D20", shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
      <Ionicons name="chatbubble-ellipses" size={chico ? 17 : 21} color={C.blanco} />
      {n > 0 ? (
        <View style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.marino, borderWidth: 2,
          borderColor: C.blanco, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ color: C.blanco, fontSize: 10, fontWeight: "900" }}>{n > 9 ? "9+" : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Algo que el cliente debe hacer (presupuesto, penalidad, calificar…): se resuelve en el detalle del pedido. */
function pendiente(o: Orden): string | null {
  const p = o.presupuesto;
  if (o.penalidad && ["pendiente"].includes(o.penalidad.estado) && !o.penalidad.por_definir) return `Paga la penalidad de USD ${o.penalidad.monto} para reprogramar`;
  if (p?.estado === "enviado" && !p.cliente_acepto) return "Revisa y acepta tu presupuesto de instalación";
  if (p?.estado === "aprobado") return `Paga tu presupuesto: USD ${p.a_pagar}`;
  if (o.pausa?.activa && !p) return "Tu servicio está en pausa: el técnico te visitará para la inspección";
  if (o.estado === "completado" && !o.calificacion) return "¿Cómo fue el servicio? Califica a tu técnico";
  return null;
}

export default function InicioActivo({ o, onRefrescar }: { o: Orden | null; onRefrescar: () => void }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { perfil } = useSession();
  const avisos = useAvisos();
  const [chatNuevos, setChatNuevos] = useState(0);
  useEffect(() => {
    if (!o) return;
    let vivo = true;
    const ver = () => api<{ no_leidos: number }>(`/ordenes/${o.id}/chat?solo_resumen=1`).then((r) => vivo && setChatNuevos(r.no_leidos)).catch(() => {});
    ver();
    const t = setInterval(() => { ver(); onRefrescar(); }, 20000);
    return () => { vivo = false; clearInterval(t); };
  }, [o?.id]);
  const nombre = perfil?.nombre.split(" ")[0] ?? "";
  const ini = (perfil?.nombre ?? "?").split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const accion = o ? pendiente(o) : null;
  const anchoBanner = Math.min(width, 520) - 70;

  function programar() {
    if (o && o.reprogramar?.puede) nav.push("reprogramar", { id: o.id });
    else if (o) nav.push("rastreo", { id: o.id });
    else nav.push("misPedidos");
  }

  const Acceso = ({ dibujo, titulo, sub, onPress }: { dibujo: React.ReactNode; titulo: string; sub: string; onPress: () => void }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={titulo} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 4, alignItems: "center", gap: 2, minHeight: 124,
        transform: [{ scale: pressed ? 0.97 : 1 }], ...vidrio })}>
      <View style={{ height: 58, justifyContent: "center" }}>{dibujo}</View>
      <Text style={{ fontSize: 13, fontWeight: "800", color: C.texto, textAlign: "center" }}>{titulo}</Text>
      <Text style={{ fontSize: 11, color: C.gris, textAlign: "center" }} numberOfLines={2}>{sub}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#F2F4F9" }}>
      {/* brillo suave de fondo */}
      <View style={{ position: "absolute", top: -120, left: -80, width: 360, height: 360, borderRadius: 180, backgroundColor: "#EEF2B8", opacity: 0.7 }} />
      <View style={{ position: "absolute", top: -60, right: -120, width: 320, height: 320, borderRadius: 160, backgroundColor: "#DCE0F7", opacity: 0.7 }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mi cuenta" onPress={() => nav.push("miCuenta")}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", ...vidrio }}>
            <Text style={{ fontWeight: "900", color: C.marino }}>{ini}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: C.texto }}>Hola, {nombre}</Text>
            <Text style={{ fontSize: 13, color: C.gris }}>Bienvenido a AHA HOME</Text>
          </View>
          <Logo size={34} conFondo={false} />
          <Text style={{ fontWeight: "900", color: C.marino, fontSize: 15 }}>AHA HOME</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Acceso dibujo={<Calendario size={74} />} titulo="Programar instalación" sub={o?.reprogramar?.puede ? "Elige día y hora" : "Ver tu cita"} onPress={programar} />
          <Acceso dibujo={<Equipos size={74} />} titulo="Mis equipos" sub="Instalados y garantía" onPress={() => nav.push("misEquipos")} />
          <Acceso dibujo={<Campana size={66} n={avisos} />} titulo="Notificaciones" sub={avisos ? `${avisos} nuevas` : "Al día"} onPress={() => nav.push("notificaciones")} />
        </View>

        {accion && o ? (
          <Pressable accessibilityRole="button" onPress={() => nav.push("rastreo", { id: o.id })}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.naranja, borderRadius: 18, padding: 14 }}>
            <Ionicons name="alert-circle" size={24} color={C.blanco} />
            <Text style={{ flex: 1, color: C.blanco, fontWeight: "800", fontSize: 14.5 }}>{accion}</Text>
            <Ionicons name="chevron-forward" size={22} color={C.blanco} />
          </Pressable>
        ) : null}

        {o ? (
          <>
            <Mapa o={o} />
            <TuServicio o={o} />
            <Seguimiento o={o} chatNuevos={chatNuevos} />
          </>
        ) : (
          <View style={{ borderRadius: 24, padding: 18, gap: 6, alignItems: "center", ...vidrio }}>
            <Camion size={96} />
            <Text style={{ fontSize: 16, fontWeight: "800", color: C.texto, textAlign: "center" }}>No tienes servicios en curso</Text>
            <Text style={{ fontSize: 13.5, color: C.gris, textAlign: "center" }}>Cuando compres en la tienda y pidas AHA HOME en la caja, aquí verás el mapa y el seguimiento de tu servicio.</Text>
          </View>
        )}

        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} snapToInterval={Math.min(width, 520) - 22} decelerationRate="fast">
          {MENSAJES.map((m) => (
            <View key={m.titulo} style={{ width: Math.min(width, 520) - 32, borderRadius: 22, backgroundColor: C.marino, padding: 14,
              flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
                <Logo size={30} conFondo={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.lima, fontWeight: "900", fontSize: 16 }}>{m.titulo}</Text>
                <Text style={{ color: "#DCDEF0", fontSize: 13.5 }}>{m.texto}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <Text style={{ fontSize: 20, fontWeight: "800", color: C.texto, marginTop: 4 }}>Alianzas y beneficios</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          snapToInterval={anchoBanner + 12} decelerationRate="fast">
          {ALIADOS.map((a) => (
            <View key={a.titulo} style={{ width: anchoBanner, height: 150, borderRadius: 22, backgroundColor: a.fondo, padding: 16, overflow: "hidden" }}>
              <Text style={{ color: a.texto, fontSize: 11, fontWeight: "900", letterSpacing: 0.6, opacity: 0.85 }}>{a.etiqueta}</Text>
              <Text style={{ color: a.texto, fontSize: 21, fontWeight: "800", marginTop: 6, maxWidth: "62%" }}>{a.titulo}</Text>
              <View style={{ position: "absolute", left: 16, bottom: 16, borderRadius: 15, paddingHorizontal: 14, height: 30, justifyContent: "center",
                backgroundColor: a.texto === C.marino ? C.marino : C.blanco }}>
                <Text style={{ fontSize: 12, fontWeight: "900", color: a.texto === C.marino ? C.lima : "#1B4F95" }}>{a.boton}</Text>
              </View>
              <View style={{ position: "absolute", right: 16, top: 33, width: 84, height: 84, borderRadius: 22, borderWidth: 2, borderStyle: "dashed",
                borderColor: a.texto === C.marino ? "rgba(33,36,77,0.45)" : "rgba(255,255,255,0.75)", alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.18)" }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: a.texto, textAlign: "center" }}>LOGO DEL{"\n"}ALIADO</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
      <MenuFlotanteCliente activo="inicio" onCentro={() => (o ? nav.push("rastreo", { id: o.id }) : nav.push("misPedidos"))} />
    </View>
  );
}
