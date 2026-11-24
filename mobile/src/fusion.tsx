// Fusión con AHA HOGAR: aprobar la orden, acta de conformidad, servicio cerrado, ficha de producto desplegable,
// bandeja de mensajes y comunicación directa (soporte) con el centro de control.
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, fileUrl, subirFoto } from "./api";
import { useNav } from "./nav";
import { tomarFoto } from "./photo";
import type { Articulo, Orden } from "./types";
import { Aviso, Boton, C, Campo, Cargando, Casilla, Etiqueta, Pantalla, Seccion, Tarjeta, Texto } from "./ui";

export type Punto = { id: string; texto: string };
const fechaLarga = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });

/** «Aprueba tu orden»: el cliente confirma acceso, tomas y adulto presente, o avisa que no la reconoce. */
export function AprobarOrden({ o, onCambio }: { o: Orden; onCambio: (o: Orden) => void }) {
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [noReconozco, setNoReconozco] = useState(false);
  const nav = useNav();
  const puntos = o.aprobacion?.puntos ?? [];
  const faltan = puntos.filter((p) => !marcas[p.id]).length;
  async function aprobar() {
    try { onCambio(await api<Orden>(`/ordenes/${o.id}/aprobar`, { body: { puntos: marcas } })); } catch (e: any) { setError(e.message); }
  }
  async function reportar() {
    try { onCambio(await api<Orden>(`/ordenes/${o.id}/no-reconozco`, { body: { motivo: "" } })); setNoReconozco(true); } catch (e: any) { setError(e.message); }
  }
  if (noReconozco) {
    return (
      <Tarjeta>
        <Aviso tono="info" texto="Avisamos al centro de control. Te escribirán por Mensajes → Soporte AHA HOME." />
        <Boton titulo="Abrir Soporte AHA HOME" icono="headset" onPress={() => nav.push("soporte")} />
      </Tarjeta>
    );
  }
  return (
    <View style={{ backgroundColor: C.blanco, borderRadius: 20, borderWidth: 2, borderColor: C.naranja, padding: 16, gap: 10 }}>
      <Text style={{ color: C.naranja, fontWeight: "900", fontSize: 13, letterSpacing: 0.6 }}>APRUEBA TU ORDEN</Text>
      <Texto size={14}>La creó la caja de {o.tienda.nombre}. Antes de aprobar, confirma:</Texto>
      {puntos.map((p) => <Casilla key={p.id} texto={p.texto} marcado={!!marcas[p.id]} onPress={() => setMarcas({ ...marcas, [p.id]: !marcas[p.id] })} />)}
      <Aviso texto={error} />
      <Boton titulo={faltan ? `Confirma los ${puntos.length} puntos` : "Aprobar orden"} tipo="naranja" deshabilitado={!!faltan} onPress={aprobar} />
      <Pressable accessibilityRole="button" onPress={reportar} style={{ minHeight: 40, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontWeight: "800", color: C.marino }}>No reconozco esta orden</Text>
      </Pressable>
    </View>
  );
}

/** Acta de conformidad: puntos del servicio + quién recibe. Al confirmarla aparece el código de cierre. */
export function ActaConformidad({ o, onCambio }: { o: Orden; onCambio: (o: Orden) => void }) {
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [adulto, setAdulto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puntos = o.acta?.puntos ?? [];
  const faltan = puntos.filter((p) => !marcas[p.id]).length;
  const ced = cedula.replace(/\D/g, "");
  const listo = !faltan && nombre.trim().length >= 3 && ced.length >= 6 && ced.length <= 9 && adulto;
  async function confirmar() {
    try { onCambio(await api<Orden>(`/ordenes/${o.id}/acta`, { body: { puntos: marcas, recibe_nombre: nombre, recibe_cedula: cedula, mayor_edad: adulto } })); }
    catch (e: any) { setError(e.message); }
  }
  return (
    <View style={{ backgroundColor: C.blanco, borderRadius: 20, borderWidth: 2, borderColor: C.marino, padding: 16, gap: 10 }}>
      <Text style={{ color: C.marino, fontWeight: "900", fontSize: 13, letterSpacing: 0.6 }}>CIERRE DEL SERVICIO · ACTA DE CONFORMIDAD</Text>
      <Texto gris size={13.5}>Revisa y prueba tu equipo con el técnico. Confirma cada punto y luego verás tu código para cerrar el servicio.</Texto>
      {puntos.map((p) => <Casilla key={p.id} texto={p.texto} marcado={!!marcas[p.id]} onPress={() => setMarcas({ ...marcas, [p.id]: !marcas[p.id] })} />)}
      <Seccion>QUIÉN RECIBE</Seccion>
      <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} />
      <Campo etiqueta="Cédula" value={cedula} onChangeText={setCedula} keyboardType="number-pad" />
      <Casilla texto="Soy mayor de edad y estoy presente en el domicilio" marcado={adulto} onPress={() => setAdulto(!adulto)} />
      <Aviso texto={error} />
      <Boton titulo={faltan ? `Confirma los ${puntos.length} puntos` : "Confirmar acta y recibir mi código"} tipo="exito" icono="document-text" deshabilitado={!listo} onPress={confirmar} />
      <Texto gris size={12}>Si hay un daño o falla, no confirmes: díselo al técnico o escribe a Soporte AHA HOME.</Texto>
    </View>
  );
}

/** Comprobante del cierre: acta confirmada y, si el cliente se quedó con el empaque, hasta cuándo guardarlo. */
export function ServicioCerrado({ o }: { o: Orden }) {
  const a = o.acta;
  if (!a?.confirmada) return null;
  return (
    <Tarjeta>
      <View style={{ alignItems: "center", gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#E7F5EC", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={34} color={C.ok} />
        </View>
        <Text style={{ fontWeight: "900", fontSize: 16, color: C.texto, textAlign: "center" }}>{o.codigo}: el servicio está completo y el acta quedó confirmada</Text>
      </View>
      {a.caja_hasta ? (
        <View style={{ backgroundColor: C.limaSuave, borderRadius: 14, padding: 12 }}>
          <Texto negrita size={14}>Guarda la caja original</Texto>
          <Texto size={13.5}>Conserva la caja, los animes, los manuales y los accesorios hasta el {fechaLarga(a.caja_hasta)} para cualquier garantía con {o.tienda.nombre}.</Texto>
        </View>
      ) : null}
      <Texto gris size={13}>Acta confirmada por {a.recibe_nombre} (C.I. {a.recibe_cedula}){a.en ? ` el ${fechaLarga(a.en)}` : ""}, con el código de cierre.</Texto>
    </Tarjeta>
  );
}

const ICONO: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  nevera: "snow-outline", lavadora: "water-outline", secadora: "sunny-outline", aire_acondicionado: "thermometer-outline",
  cocina: "flame-outline", televisor: "tv-outline", otro: "cube-outline",
};

/** Ficha de producto: se toca para ver marca, modelo, serial, garantía y qué incluye la instalación. */
export function ProductoDesplegable({ a }: { a: Articulo & { garantia?: string } }) {
  const [abierto, setAbierto] = useState(false);
  const listo = ["Entregado", "Instalado"].includes(a.estado);
  const fila = (k: string, v?: string) => (v ? (
    <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
      <Text style={{ color: C.gris, fontSize: 13 }}>{k}</Text><Text style={{ color: C.texto, fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>{v}</Text>
    </View>) : null);
  return (
    <View style={{ backgroundColor: C.blanco, borderRadius: 16, borderWidth: 1, borderColor: C.linea, overflow: "hidden" }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: abierto }} onPress={() => setAbierto(!abierto)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
        <View style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={ICONO[a.tipo] ?? "cube-outline"} size={30} color={C.marino} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: C.texto }}>{a.nombre}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {a.instalar ? <Etiqueta texto="Con instalación" tono="lima" /> : <Etiqueta texto="Solo entrega" />}
            <Etiqueta texto={a.estado} tono={listo ? "ok" : "alerta"} />
          </View>
        </View>
        <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={22} color={C.marino} />
      </Pressable>
      {abierto ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6, borderTopWidth: 1, borderTopColor: C.linea, paddingTop: 10 }}>
          {fila("Marca", a.marca)}{fila("Modelo", a.modelo)}{fila("Serial", a.serial)}{fila("Garantía", a.garantia)}
          <Text style={{ color: C.gris, fontSize: 12.5, marginTop: 4 }}>
            {a.instalar ? "Instalación estándar: se conecta a las tomas de agua, desagüe y electricidad que ya existen. Obras, extensiones o cableado se presupuestan aparte (inspección)." : "Se entrega en su empaque original, sin desembalar."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------- Mensajes y soporte ----------
type MsgS = { id: number; texto: string; foto: string | null; tema: string; tema_texto: string; creado: string; mio: boolean; sistema: boolean; autor: string | null; control: boolean };
type Hilo = { hilo_id: number; con: { nombre: string; rol: string }; temas: Record<string, string>; llamar: string; mensajes: MsgS[] };
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
const ICONO_TEMA: Record<string, string> = { pedido: "📦", fecha: "🗓", reclamo: "⚠️", pagos: "💳", documentos: "📄", app: "📱", guardia: "🗓", emergencia: "🚨" };

/** Conversación de soporte con AHA HOME. Sin `hilo`, es la del propio cliente o técnico; con `hilo`, la ve el centro de control. */
export function SoporteChat({ hilo }: { hilo?: number }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [h, setH] = useState<Hilo | null>(null);
  const [texto, setTexto] = useState("");
  const [tema, setTema] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const ruta = hilo ? `/supervisor/soporte/${hilo}` : "/soporte";
  const control = !!hilo;
  const cargar = useCallback(async () => { try { setH(await api<Hilo>(ruta)); } catch (e: any) { setError(e.message); } }, [ruta]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 8000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }, [h?.mensajes.length]);
  async function enviar(t: string, foto = "") {
    if (!t.trim() && !foto) return;
    try { setH(await api<Hilo>(ruta, { body: { texto: t, foto, tema } })); setTexto(""); } catch (e: any) { setError(e.message); }
  }
  async function adjuntar() {
    const r = await tomarFoto();
    if (!r || "error" in r) return;
    try { await enviar("", await subirFoto(r.base64)); } catch (e: any) { setError(e.message); }
  }
  const rapidas = control ? ["Lo revisamos ya mismo", "Listo, resuelto ✓", "Te llamamos en un momento"]
    : h?.con.rol === "cliente" ? ["¿Dónde está mi pedido?", "Quiero cambiar la fecha", "Tengo un reclamo"] : ["Voy tarde", "Necesito apoyo", "Problema con la app"];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#EEF1F7" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: 10, backgroundColor: C.blanco, borderBottomWidth: 1, borderBottomColor: C.linea, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={nav.back} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={28} color={C.marino} />
        </Pressable>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.lima, alignItems: "center", justifyContent: "center" }}>
          {control ? <Ionicons name="person" size={22} color={C.marino} /> : <Text style={{ fontWeight: "900", fontStyle: "italic", color: C.marino }}>Go</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 15.5, color: C.texto }} numberOfLines={1}>{control ? `${h?.con.nombre ?? ""} · ${h?.con.rol ?? ""}` : "Soporte AHA HOME"}</Text>
          <Text style={{ fontSize: 12, color: C.ok, fontWeight: "700" }}>{control ? "Comunicación directa" : "● Centro de control · responde en minutos"}</Text>
        </View>
        {h?.llamar ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Llamar" onPress={() => Linking.openURL(`tel:${h.llamar}`)}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.ok, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="call" size={22} color={C.blanco} />
          </Pressable>
        ) : null}
      </View>
      {!control && h ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, padding: 10 }}>
          <Text style={{ alignSelf: "center", color: C.gris, fontWeight: "700", fontSize: 12.5 }}>¿Sobre qué es?</Text>
          {Object.entries(h.temas).map(([k, t]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: tema === k }} onPress={() => setTema(tema === k ? "" : k)}
              style={{ borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, minHeight: 36, justifyContent: "center",
                borderColor: k === "emergencia" ? C.error : tema === k ? C.marino : C.borde, backgroundColor: tema === k ? (k === "emergencia" ? C.error : C.marino) : C.blanco }}>
              <Text style={{ fontWeight: "800", fontSize: 13, color: tema === k ? (k === "emergencia" ? C.blanco : C.lima) : k === "emergencia" ? C.error : C.marino }}>{ICONO_TEMA[k] ?? ""} {t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {error ? <Text style={{ color: C.error }}>{error}</Text> : null}
        {!h ? <Cargando /> : h.mensajes.length === 0 ? <Text style={{ alignSelf: "center", color: C.gris, marginTop: 10, textAlign: "center" }}>
          {control ? "Sin mensajes todavía." : "Escríbenos lo que necesites: pagos, tu pedido, la app o una emergencia. Te responde el centro de control."}</Text> : null}
        {h?.mensajes.map((m, i) => (
          <View key={m.id} style={{ gap: 6 }}>
            {m.tema && m.tema !== h.mensajes[i - 1]?.tema ? <Text style={{ alignSelf: "center", fontSize: 11.5, fontWeight: "800", color: C.marino, backgroundColor: "rgba(207,215,42,0.35)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" }}>Tema: {m.tema_texto}</Text> : null}
            {m.sistema ? <Text style={{ alignSelf: "center", fontSize: 12, color: C.marino, fontWeight: "700", textAlign: "center" }}>{m.texto}</Text> : (
              <View style={{ maxWidth: "80%", alignSelf: m.mio ? "flex-end" : "flex-start", borderRadius: 18, padding: 10, borderBottomRightRadius: m.mio ? 6 : 18, borderBottomLeftRadius: m.mio ? 18 : 6,
                backgroundColor: m.mio ? C.marino : C.blanco }}>
                {!m.mio ? <Text style={{ fontSize: 11.5, fontWeight: "800", color: m.control ? C.ok : C.naranja, marginBottom: 2 }}>{m.autor} · {m.control ? "centro de control" : h.con.rol}</Text> : null}
                {m.foto ? <Image source={{ uri: fileUrl(m.foto) ?? undefined }} style={{ width: 200, height: 150, borderRadius: 12, marginBottom: m.texto ? 6 : 0 }} /> : null}
                {m.texto ? <Text style={{ fontSize: 15, color: m.mio ? C.blanco : C.texto }}>{m.texto}</Text> : null}
                <Text style={{ fontSize: 10.5, color: m.mio ? "#C5C8E4" : C.gris, alignSelf: "flex-end", marginTop: 3 }}>{hora(m.creado)}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 6 }}>
          {rapidas.map((r) => (
            <Pressable key={r} accessibilityRole="button" onPress={() => enviar(r)} style={{ borderRadius: 16, borderWidth: 1, borderColor: C.borde, backgroundColor: C.blanco, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }}>
              <Text style={{ fontWeight: "700", color: C.marino, fontSize: 13 }}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ marginHorizontal: 12, minHeight: 54, borderRadius: 27, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar foto" onPress={adjuntar} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="camera-outline" size={24} color={C.marino} />
          </Pressable>
          <TextInput value={texto} onChangeText={setTexto} placeholder={control ? "Responder…" : "Escribe a AHA HOME…"} placeholderTextColor="#6B7789" multiline style={{ flex: 1, fontSize: 15, color: C.texto, maxHeight: 100, paddingVertical: 10 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar" disabled={!texto.trim()} onPress={() => enviar(texto)}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: texto.trim() ? C.naranja : C.borde, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="send" size={18} color={C.blanco} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Bandeja de mensajes del cliente: Soporte AHA HOME y el chat de cada pedido en curso. */
export function BandejaMensajes({ abajo }: { abajo?: React.ReactNode }) {
  const nav = useNav();
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [nl, setNl] = useState<Record<string, number>>({});
  const cargar = useCallback(async () => {
    try {
      const os = (await api<Orden[]>("/ordenes")).filter((o) => !["completado", "cancelado"].includes(o.estado));
      setOrdenes(os);
      const s = await api<{ no_leidos: number }>("/soporte", { query: { solo_resumen: true } });
      const r: Record<string, number> = { soporte: s.no_leidos };
      for (const o of os) { try { r[o.id] = (await api<{ no_leidos: number }>(`/ordenes/${o.id}/chat`, { query: { solo_resumen: true } })).no_leidos; } catch { /* sin chat */ } }
      setNl(r);
    } catch { setOrdenes([]); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const Fila = ({ icono, titulo, sub, n, onPress }: { icono: any; titulo: string; sub: string; n?: number; onPress: () => void }) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.blanco, borderRadius: 16, borderWidth: 1, borderColor: C.linea, padding: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}><Ionicons name={icono} size={22} color={C.marino} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 15, color: C.texto }}>{titulo}</Text><Text style={{ color: C.gris, fontSize: 13 }}>{sub}</Text></View>
      {n ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.naranja, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}><Text style={{ color: C.blanco, fontWeight: "900", fontSize: 12 }}>{n}</Text></View> : null}
      <Ionicons name="chevron-forward" size={20} color={C.gris} />
    </Pressable>
  );
  return (
    <Pantalla titulo="Mensajes" volver={false} abajo={abajo} onRefresh={cargar}>
      <Seccion>TUS PEDIDOS EN CURSO</Seccion>
      {ordenes === null ? <Cargando /> : ordenes.length === 0 ? <Texto gris size={14}>Cuando tengas un pedido en curso podrás escribirle aquí a tu técnico.</Texto> : null}
      {ordenes?.map((o) => <Fila key={o.id} icono="chatbubbles-outline" titulo={`Tu técnico · ${o.codigo}`} sub={`${o.articulos.map((a) => a.nombre).join(" · ")} · supervisado`} n={nl[o.id]} onPress={() => nav.push("chat", { id: o.id })} />)}
      <Seccion>AYUDA</Seccion>
      <Fila icono="headset-outline" titulo="Soporte AHA HOME" sub="Dudas, reclamos o cambios de fecha" n={nl.soporte} onPress={() => nav.push("soporte")} />
    </Pantalla>
  );
}

/** Tarjeta del perfil del técnico: comunicación directa con AHA HOME. */
export function ComunicacionDirecta() {
  const nav = useNav();
  const [h, setH] = useState<Hilo | null>(null);
  useEffect(() => { api<Hilo>("/soporte").then(setH).catch(() => {}); }, []);
  const ult = h?.mensajes.filter((m) => !m.mio).slice(-1)[0];
  return (
    <View style={{ backgroundColor: C.marino, borderRadius: 20, padding: 16, gap: 12 }}>
      <Text style={{ color: C.lima, fontWeight: "900", fontSize: 13, letterSpacing: 0.6 }}>COMUNICACIÓN DIRECTA CON AHA HOME</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#3DDC84" }} />
        <Text style={{ color: "#DCDEF0", fontSize: 12.5 }}>Centro de control · responde en minutos</Text></View>
      <Text style={{ color: "#DCDEF0", fontSize: 13.5 }}>Para lo que no es de una orden: pagos, documentos, la app, tu guardia o una emergencia en la calle.</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Boton titulo="Escribir" tipo="lima" icono="chatbubble-ellipses" onPress={() => nav.push("soporte")} /></View>
        <View style={{ flex: 1 }}><Boton titulo="Llamar" tipo="exito" icono="call" onPress={() => h?.llamar && Linking.openURL(`tel:${h.llamar}`)} /></View>
      </View>
      {ult ? <Text style={{ color: C.blanco, fontSize: 12.5, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 10 }}>Último mensaje · {ult.autor ?? "AHA HOME"}: «{ult.texto.slice(0, 80)}» · {hora(ult.creado)}</Text> : null}
    </View>
  );
}

type FilaSop = { hilo_id: number; nombre: string; rol: string; tema_texto: string; ultimo: string; creado: string; no_leidos: number; emergencia: boolean; telefono: string };

/** Centro de control: todas las conversaciones de soporte; las emergencias sin leer primero. */
export function SoporteBandeja() {
  const nav = useNav();
  const [fs, setFs] = useState<FilaSop[] | null>(null);
  const cargar = useCallback(async () => { try { setFs(await api<FilaSop[]>("/supervisor/soporte")); } catch { setFs([]); } }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 10000); return () => clearInterval(t); }, [cargar]);
  return (
    <Pantalla titulo="Mensajes de soporte" subtitulo="Clientes, técnicos y cajas" onRefresh={cargar}>
      {fs === null ? <Cargando /> : fs.length === 0 ? <Texto gris>Sin conversaciones.</Texto> : null}
      {fs?.map((f) => (
        <Pressable key={f.hilo_id} accessibilityRole="button" onPress={() => nav.push("soporte", { hilo: f.hilo_id })}
          style={{ backgroundColor: C.blanco, borderRadius: 16, borderWidth: f.emergencia ? 2 : 1, borderColor: f.emergencia ? C.error : C.linea, padding: 14, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontWeight: "900", fontSize: 15, color: C.texto, flex: 1 }}>{f.emergencia ? "🚨 " : ""}{f.nombre} <Text style={{ color: C.gris, fontWeight: "600", fontSize: 13 }}>· {f.rol}</Text></Text>
            <Text style={{ fontSize: 12, fontWeight: "800", color: f.emergencia ? C.error : C.gris }}>{f.tema_texto ? `${f.tema_texto.toUpperCase()} · ` : ""}{hora(f.creado)}</Text>
          </View>
          <Text style={{ color: "#4A5568", fontSize: 13.5 }} numberOfLines={2}>«{f.ultimo}»</Text>
          {f.no_leidos ? <Etiqueta texto={`${f.no_leidos} sin leer`} tono={f.emergencia ? "error" : "alerta"} /> : null}
        </Pressable>
      ))}
    </Pantalla>
  );
}
