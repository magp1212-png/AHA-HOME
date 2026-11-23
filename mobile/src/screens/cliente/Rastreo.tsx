import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { FormPago, InspeccionCliente, PagoServicio } from "../../components";
import { HamburguesaCliente, MenuCliente } from "../../menus";
import type { Orden, Persona } from "../../types";
import { Aviso, Avatar, Boton, C, Campana, Cargando, Etiqueta, Pantalla, Tarjeta, Texto, Titulo } from "../../ui";

const ICONO: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  nevera: "snow-outline", lavadora: "water-outline", secadora: "sunny-outline", aire_acondicionado: "thermometer-outline",
  cocina: "flame-outline", televisor: "tv-outline", otro: "cube-outline",
};

type Fase = { texto: string; hecha: boolean; actual: boolean; pausa?: boolean; omitida?: boolean };

/** Las fases que ve el cliente según el tipo de servicio. «Inspección» siempre aparece antes de «Confirmado»:
 *  si la pidió, el servicio queda en pausa hasta aprobar y pagar el presupuesto; si no, se muestra como «No requerida» (paso saltado). */
function fases(o: Orden): Fase[] {
  const orden = ["solicitud_enviada", "tecnico_asignado", "cita_confirmada", "en_ruta", "en_progreso", "completado"];
  const i = orden.indexOf(o.estado);
  const base = o.tipo_servicio === "traslado" ? ["Confirmado", "En camino", "Entregado"]
    : o.tipo_servicio === "instalacion" ? ["Confirmado", "En camino", "Instalación"]
    : ["Confirmado", "En camino", "Entregado", "Instalación"];
  const conInspeccion = o.inspeccion.requerida;
  const nombres = ["Inspección", ...base];
  // cuántas fases van hechas según el estado del servidor
  let hechas = i >= 5 ? base.length : i === 4 ? base.length - 1 : i === 3 ? 1 : i === 2 ? 1 : 0;
  hechas = conInspeccion && o.pausa?.activa ? 0 : hechas + 1;
  return nombres.map((texto, k) => {
    if (k === 0 && !conInspeccion) return { texto, hecha: false, actual: false, omitida: true };
    return { texto, hecha: k < hechas, actual: k === hechas, pausa: conInspeccion && k === 0 && !!o.pausa?.activa };
  });
}

/** Rastreador a colores: verde con ✓ lo terminado, naranja lo que está pasando ahora, gris lo que falta. */
function Rastreador({ f }: { f: Fase[] }) {
  return (
    <Tarjeta style={{ paddingHorizontal: 8 }}>
      <View style={{ flexDirection: "row" }} accessibilityRole="progressbar"
        accessibilityLabel={`Estado: ${f.find((x) => x.actual)?.texto ?? "completado"}`}>
        {f.map((x, k) => {
          const linea = x.hecha ? C.ok : x.actual ? C.naranja : C.borde;
          const color = x.hecha ? C.ok : x.actual ? C.naranja : x.omitida ? "#9AA3B5" : C.borde;
          return (
            <View key={x.texto} style={{ flex: 1, alignItems: "center", gap: 8, zIndex: f.length - k }}>
              {k > 0 ? <View style={{ position: "absolute", top: 13, right: "50%", width: "100%", height: 4, backgroundColor: linea }} /> : null}
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", zIndex: 1,
                backgroundColor: color }}>
                {x.hecha ? <Ionicons name="checkmark" size={18} color={C.blanco} />
                  : x.omitida ? <Ionicons name="play-skip-forward" size={14} color={C.blanco} />
                  : x.pausa ? <Ionicons name="pause" size={15} color={C.blanco} />
                  : x.actual ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.blanco }} /> : null}
              </View>
              <Text style={{ fontSize: f.length > 4 ? 10.5 : 12, fontWeight: "700", color: x.hecha || x.actual ? C.texto : "#6B7789",
                textAlign: "center", paddingHorizontal: 1 }}>{x.texto}</Text>
              {x.omitida ? <Text style={{ marginTop: -6, fontSize: 9.5, fontWeight: "700", color: "#6B7789", textAlign: "center" }}>No requerida</Text> : null}
            </View>
          );
        })}
      </View>
    </Tarjeta>
  );
}

/** Código para cerrar el servicio: se lo dicta al técnico o se lo manda por el chat si no está en casa. */
function CodigoCierre({ id, token }: { id: number; token: string }) {
  const [enviado, setEnviado] = useState<string | null>(null);
  async function enviar() {
    try { await api(`/ordenes/${id}/chat`, { body: { texto: `🔐 Mi código para cerrar el servicio es ${token}`, foto: "" } }); setEnviado("Listo: se lo enviaste al técnico por el chat."); }
    catch (e: any) { setEnviado(e.message); }
  }
  return (
    <View style={{ backgroundColor: C.marino, borderRadius: 20, padding: 16, gap: 10 }}>
      <Text style={{ color: C.lima, fontWeight: "900", fontSize: 13, letterSpacing: 0.6 }}>CIERRE DEL SERVICIO · TU CÓDIGO</Text>
      <Text accessibilityLabel={`Código ${token.split("").join(" ")}`} style={{ color: C.blanco, fontSize: 42, fontWeight: "900", letterSpacing: 12, textAlign: "center" }}>{token}</Text>
      <Text style={{ color: "#DCDEF0", fontSize: 13.5 }}>
        Cuando el técnico termine y revises la instalación, díctale este código para cerrar el servicio. ¿No estás en casa? Envíaselo por el chat.
      </Text>
      <Boton titulo="Enviar el código por el chat" tipo="lima" icono="chatbubble-ellipses" onPress={enviar} />
      {enviado ? <Text style={{ color: C.lima, fontWeight: "700", fontSize: 13 }}>{enviado}</Text> : null}
    </View>
  );
}

function Estrellas({ valor, size = 16 }: { valor: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} size={size} color="#E8A317" name={valor >= n ? "star" : valor >= n - 0.5 ? "star-half" : "star-outline"} />
      ))}
    </View>
  );
}

/** Rastreo del pedido. Con `inicio`, es la pantalla de inicio del cliente (menú ☰ arriba y menú fijo abajo). */
export default function Rastreo({ id, inicio }: { id: number; inicio?: boolean }) {
  const nav = useNav();
  const [o, setO] = useState<Orden | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estrellas, setEstrellas] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { const r = await api<Orden>(`/ordenes/${id}`); setO(r); setEstrellas(r.calificacion ?? 0); } catch (e: any) { setError(e.message); }
  }, [id]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 20000); return () => clearInterval(t); }, [cargar]);

  async function calificar(n: number) {
    setEstrellas(n);
    try { await api(`/ordenes/${id}/calificar`, { body: { estrellas: n } }); setMsg("¡Gracias por calificar el servicio!"); } catch (e: any) { setError(e.message); }
  }
  async function cancelar() {
    try { setO(await api<Orden>(`/ordenes/${id}/cancelar`, { body: { motivo: "Cancelado por el cliente desde la app" } })); } catch (e: any) { setError(e.message); }
  }

  const marco = (hijos: React.ReactNode) => (
    <Pantalla titulo="AHA HOME" subtitulo="Rastreo de pedido e instalación" volver={!inicio}
      izquierda={inicio ? <HamburguesaCliente /> : undefined} derecha={<Campana />}
      abajo={<MenuCliente activo={inicio ? "inicio" : "pedidos"} />}>
      {hijos}
    </Pantalla>
  );
  if (!o) return marco(error ? <Aviso texto={error} /> : <Cargando />);

  const f = fases(o);
  const enCamino = ["en_ruta", "en_progreso", "completado"].includes(o.estado);
  const puedeCambiar = ["solicitud_enviada", "tecnico_asignado", "cita_confirmada"].includes(o.estado);
  const estadoCorto = o.estado === "cancelado" ? "Cancelado" : o.estado === "completado" ? "Completado" : o.estado === "entrega_fallida" ? "No entregado"
    : o.pausa?.activa ? "En pausa" : f.find((x) => x.actual)?.texto ?? "Completado";
  const colorEstado = o.estado === "completado" ? C.ok : ["cancelado", "entrega_fallida"].includes(o.estado) ? C.error : C.naranja;
  const p = o.presupuesto;
  // botón principal naranja según el momento: pagar presupuesto lo resuelve la tarjeta de inspección; aquí, programar
  const mostrarProgramar = (puedeCambiar && !o.pausa?.activa) || (o.estado === "entrega_fallida" && o.reprogramar?.puede);
  const pen = o.penalidad;

  return marco(
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Titulo>Rastreador de estado</Titulo>
        <Text style={{ fontSize: 14, fontWeight: "900", color: colorEstado }}>{estadoCorto}</Text>
      </View>
      <Rastreador f={f} />
      <Text style={{ fontSize: 12.5, color: C.gris, marginTop: -6 }}>{o.codigo} · {o.tipo_servicio_texto}</Text>

      {o.pausa?.activa ? (
        <View style={{ backgroundColor: C.naranjaSuave, borderRadius: 14, borderWidth: 1, borderColor: "#F3C9AE", padding: 12, flexDirection: "row", gap: 10 }}>
          <Ionicons name="pause-circle" size={22} color={C.naranja} />
          <Text style={{ flex: 1, color: C.texto, fontSize: 14 }}>
            <Text style={{ fontWeight: "800" }}>Tu servicio está en pausa por la inspección. </Text>
            {p ? "Revisa el presupuesto: cuando lo apruebes y pagues, seguimos con la confirmación del retiro."
              : "El técnico te visitará y te enviará el presupuesto aquí."}
            {o.pausa.vencida ? " Ya pasó el tiempo previsto: AHA HOME te contactará." : ""}
          </Text>
        </View>
      ) : null}
      {o.estado === "entrega_fallida" && pen ? (
        <Tarjeta style={{ borderColor: "#F3C9AE", backgroundColor: C.naranjaSuave }}>
          <Texto negrita size={16}>No pudimos entregar tu compra</Texto>
          <Texto gris size={14}>{pen.motivo}. La cuadrilla ya había retirado tu compra y salió hacia tu casa, así que regresó a la tienda y se cobra el servicio completo como penalidad.</Texto>
          {pen.estado === "pendiente" && pen.por_definir ? <Aviso tono="info" texto="AHA HOME está confirmando el monto de la penalidad. Te avisamos en breve." /> : null}
          {pen.estado === "pendiente" && !pen.por_definir ? (
            <FormPago titulo={`PENALIDAD USD ${pen.monto}`} boton="Registrar pago" usd={Number(pen.monto)}
              onEnviar={async (d) => { await api(`/ordenes/${id}/penalidad/pago`, { body: d }); cargar(); }} />
          ) : null}
          {pen.estado === "pago_registrado" ? <Aviso tono="info" texto="Registraste el pago. AHA HOME lo confirma y podrás reprogramar." /> : null}
          {pen.estado === "pagada" || pen.estado === "exonerada" ? <Aviso tono="ok" texto={pen.estado === "pagada" ? "Penalidad pagada. Ya puedes reprogramar tu servicio." : "AHA HOME exoneró la penalidad. Ya puedes reprogramar."} /> : null}
        </Tarjeta>
      ) : null}
      <InspeccionCliente o={o} recargar={cargar} />

      <Titulo>Tus artículos</Titulo>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {o.articulos.map((a) => {
          const listo = ["Entregado", "Instalado"].includes(a.estado);
          return (
            <View key={a.id} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: C.blanco, borderRadius: 16, borderWidth: 1, borderColor: C.linea, padding: 12, alignItems: "center", gap: 5 }}>
              {listo ? <View style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: C.ok, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark" size={15} color={C.blanco} /></View> : null}
              <View style={{ width: 84, height: 76, borderRadius: 14, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={ICONO[a.tipo] ?? "cube-outline"} size={42} color={C.marino} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "800", color: C.texto, textAlign: "center" }}>{a.nombre}</Text>
              {a.modelo ? <Text style={{ fontSize: 12, color: C.gris }}>{a.modelo}</Text> : null}
              <Text style={{ fontSize: 13, fontWeight: "800", color: listo ? C.ok : C.naranja }}>{a.estado}</Text>
              {a.instalar ? <Etiqueta texto="Con instalación" tono="lima" /> : <Etiqueta texto="En su caja" />}
            </View>
          );
        })}
      </View>

      <Titulo>{o.tipo_servicio === "traslado" ? "Tu técnico de entrega" : "Tu técnico de instalación"}</Titulo>
      <Tarjeta>
        {enCamino && o.tecnico ? (
          <>
            <PersonaFila p={o.tecnico} principal />
            {o.ayudantes.map((a) => <PersonaFila key={a.nombre} p={a} />)}
          </>
        ) : (
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="shield-checkmark-outline" size={28} color={C.marino} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Texto negrita>{o.tecnico_asignado ? "Técnico asignado" : "Asignando técnico…"}</Texto>
              <Texto gris size={13}>Por tu seguridad, verás la foto del técnico y de su ayudante cuando salgan con tu pedido.</Texto>
            </View>
          </View>
        )}
        <View style={{ height: 1, backgroundColor: C.linea }} />
        <Texto negrita size={16}>{o.tipo_servicio === "traslado" ? "Cita de entrega" : "Cita de instalación"}</Texto>
        <Texto>{o.articulos.map((a) => a.nombre).join(" y ")}</Texto>
        <Texto gris>Fecha: {o.fecha} · Hora: {o.franja.replace("-", " – ")}</Texto>
        <Texto gris size={13}>{o.cliente.tipo_inmueble_texto ? `${o.cliente.tipo_inmueble_texto} · ` : ""}{o.cliente.direccion}</Texto>
        {o.residuos?.aplica ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12 }}>
            <Ionicons name={o.residuos.retirar ? "leaf" : "cube-outline"} size={24} color={o.residuos.retirar ? C.ok : C.marino} />
            <View style={{ flex: 1 }}>
              <Texto negrita size={14}>Retiro de residuos para reciclar</Texto>
              <Texto gris size={12.5}>{o.residuos.retirar ? "Nos llevamos cajas, anime y plásticos." : "Te quedas con la caja y el empaque (garantía)."} Es opcional.</Texto>
            </View>
            {o.residuos.puede_cambiar ? (
              <Switch accessibilityLabel="Retirar residuos para reciclar" value={o.residuos.retirar} trackColor={{ true: C.ok, false: C.borde }}
                onValueChange={async (v) => { try { setO(await api<Orden>(`/ordenes/${id}/residuos`, { body: { retirar: v } })); } catch (e: any) { setError(e.message); } }} />
            ) : null}
          </View>
        ) : null}
        {o.pago_instalacion.pagado ? <PagoServicio pago={o.pago_instalacion} titulo="TU PAGO EN LA TIENDA" donde="pagado en la tienda" /> : null}
      </Tarjeta>

      {o.cierre?.token ? <CodigoCierre id={o.id} token={o.cierre.token} /> : o.estado === "en_ruta" ? (
        <View style={{ borderRadius: 20, borderWidth: 2, borderStyle: "dashed", borderColor: C.borde, padding: 16, gap: 4 }}>
          <Text style={{ color: C.marino, fontWeight: "900", fontSize: 13, letterSpacing: 0.6 }}>CIERRE DEL SERVICIO</Text>
          <Texto gris size={13.5}>Tu código para cerrar el servicio aparecerá aquí cuando el técnico llegue.</Texto>
        </View>
      ) : null}

      {o.estado === "completado" ? (
        <Tarjeta>
          <Texto negrita size={16}>¿Cómo fue el servicio?</Texto>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} accessibilityLabel={`${n} estrellas`} onPress={() => calificar(n)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={n <= estrellas ? "star" : "star-outline"} size={34} color={n <= estrellas ? "#E8A317" : "#9AA8BA"} />
              </Pressable>
            ))}
          </View>
          <Texto gris size={13}>Tu calificación ayuda a premiar a los mejores técnicos.</Texto>
          <Aviso texto={msg} tono="ok" />
        </Tarjeta>
      ) : null}

      <Aviso texto={error} />
      {puedeCambiar && !o.pausa?.activa && !o.reprogramar?.puede && o.reprogramar?.motivo ? <Aviso tono="info" texto={o.reprogramar.motivo} /> : null}
      {mostrarProgramar && o.reprogramar?.puede ? (
        <Boton titulo={o.tipo_servicio === "traslado" ? "PROGRAMAR ENTREGA" : "PROGRAMAR INSTALACIÓN"} tipo="naranja" icono="calendar-outline"
          onPress={() => nav.push("reprogramar", { id: o.id })} />
      ) : null}
      {puedeCambiar ? <Boton titulo="Cancelar pedido" tipo="peligro" onPress={cancelar} /> : null}
    </>
  );
}

function PersonaFila({ p, principal }: { p: Persona; principal?: boolean }) {
  if (!principal) {
    return (
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.fondo, borderRadius: 12, padding: 8 }}>
        <Avatar nombre={p.nombre} foto={p.foto} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: C.texto }}>{p.nombre}</Text>
          <Text style={{ fontSize: 12.5, color: C.gris }}>Ayudante · verificado por AHA HOME</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
      <Avatar nombre={p.nombre} foto={p.foto} size={68} borde={C.lima} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.texto }}>{p.nombre}</Text>
        {p.calificacion != null ? (
          <>
            <Text style={{ fontSize: 13, color: C.gris }}>Calificación {p.calificacion.toFixed(1)} ({p.calificaciones})</Text>
            <Estrellas valor={p.calificacion} />
          </>
        ) : <Text style={{ fontSize: 13, color: C.gris }}>Técnico verificado por AHA HOME</Text>}
      </View>
      <Ionicons name="thumbs-up" size={26} color={C.naranja} accessibilityLabel="Técnico recomendado" />
    </View>
  );
}
