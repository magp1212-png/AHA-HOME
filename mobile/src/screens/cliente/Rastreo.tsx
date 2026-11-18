import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { FormPago, InspeccionCliente } from "../../components";
import type { Orden, Persona } from "../../types";
import { Aviso, Avatar, Boton, C, Cargando, Etiqueta, Pantalla, Tarjeta, Texto, Titulo } from "../../ui";

const ICONO: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  nevera: "snow-outline", lavadora: "water-outline", secadora: "sunny-outline", aire_acondicionado: "thermometer-outline",
  cocina: "flame-outline", televisor: "tv-outline", otro: "cube-outline",
};

/** Las fases que ve el cliente según el tipo de servicio. Si pidió inspección, va primero
 *  «Inspección» (el servicio queda en pausa hasta aprobar y pagar el presupuesto); si no, se salta directo a «Confirmado». */
function fases(o: Orden): { texto: string; hecha: boolean; actual: boolean; pausa?: boolean }[] {
  const e = o.estado;
  const orden = ["solicitud_enviada", "tecnico_asignado", "cita_confirmada", "en_ruta", "en_progreso", "completado"];
  const i = orden.indexOf(e);
  const base = o.tipo_servicio === "traslado" ? ["Confirmado", "En camino", "Entregado"]
    : o.tipo_servicio === "instalacion" ? ["Confirmado", "En camino", "Instalación"]
    : ["Confirmado", "En camino", "Entregado", "Instalación"];
  const conInspeccion = o.inspeccion.requerida;
  const nombres = conInspeccion ? ["Inspección", ...base] : base;
  // cuántas fases van hechas según el estado del servidor
  let hechas = i >= 5 ? base.length : i === 4 ? base.length - 1 : i === 3 ? 1 : i === 2 ? 1 : 0;
  if (conInspeccion) hechas = o.pausa?.activa ? 0 : hechas + 1;
  return nombres.map((texto, k) => ({ texto, hecha: k < hechas, actual: k === hechas, pausa: conInspeccion && k === 0 && !!o.pausa?.activa }));
}

export default function Rastreo({ id }: { id: number }) {
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

  if (!o) return <Pantalla titulo="AHA HOME" subtitulo="Rastreo de pedido e instalación">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  const f = fases(o);
  const enCamino = ["en_ruta", "en_progreso", "completado"].includes(o.estado);
  const puedeCambiar = ["solicitud_enviada", "tecnico_asignado", "cita_confirmada"].includes(o.estado);
  const estadoCorto = o.estado === "cancelado" ? "Cancelado" : f.find((x) => x.actual)?.texto ?? "Completado";

  return (
    <Pantalla titulo="AHA HOME" subtitulo="Rastreo de pedido e instalación">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Titulo>Rastreador de estado</Titulo>
        <Etiqueta texto={o.estado === "completado" ? "Completado" : estadoCorto} tono={o.estado === "completado" ? "ok" : "lima"} />
      </View>
      <Tarjeta>
        <View style={{ flexDirection: "row" }}>
          {f.map((x, k) => (
            <View key={x.texto} style={{ flex: 1, alignItems: "center", gap: 8, zIndex: f.length - k }}>
              {k > 0 ? <View style={{ position: "absolute", top: 15, right: "50%", width: "100%", height: 4, backgroundColor: x.hecha || x.actual ? C.marino : C.linea }} /> : null}
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", zIndex: 1,
                backgroundColor: x.hecha ? C.ok : x.actual ? C.marino : C.blanco, borderWidth: x.hecha ? 0 : x.actual ? 4 : 3, borderColor: x.actual ? C.lima : C.borde }}>
                {x.hecha ? <Ionicons name="checkmark" size={18} color={C.blanco} /> : x.pausa ? <Ionicons name="pause" size={16} color={C.lima} /> : null}
              </View>
              <Text style={{ fontSize: f.length > 4 ? 10.5 : 12, fontWeight: "700", color: x.hecha || x.actual ? C.texto : "#6B7789", textAlign: "center", paddingHorizontal: 2 }}>{x.texto}</Text>
            </View>
          ))}
        </View>
      </Tarjeta>

      {o.pausa?.activa ? (
        <Aviso tono="info" texto={`Tu servicio está en pausa por la inspección. Cuando apruebes y pagues el presupuesto, seguimos con la confirmación del retiro.${o.pausa.vencida ? " Ya pasó el tiempo previsto: AHA HOME te contactará." : ""}`} />
      ) : null}
      <InspeccionCliente o={o} recargar={cargar} />

      <Titulo>Tus artículos</Titulo>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {o.articulos.map((a) => {
          const listo = ["Entregado", "Instalado"].includes(a.estado);
          return (
            <View key={a.id} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: C.blanco, borderRadius: 16, borderWidth: 1, borderColor: C.linea, padding: 12, alignItems: "center", gap: 6 }}>
              {listo ? <View style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: C.ok, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark" size={15} color={C.blanco} /></View> : null}
              <View style={{ width: 84, height: 76, borderRadius: 14, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={ICONO[a.tipo] ?? "cube-outline"} size={40} color={C.marino} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "800", color: C.texto, textAlign: "center" }}>{a.nombre}</Text>
              {a.modelo ? <Text style={{ fontSize: 12, color: C.gris }}>{a.modelo}</Text> : null}
              <Text style={{ fontSize: 13, fontWeight: "800", color: listo ? C.ok : C.marino }}>{a.estado}</Text>
              {a.instalar ? <Etiqueta texto="Con instalación" tono="lima" /> : <Etiqueta texto="En su caja" />}
            </View>
          );
        })}
      </View>

      <Titulo>Tu técnico de instalación</Titulo>
      <Tarjeta>
        {enCamino && o.tecnico ? (
          <>
            <PersonaFila p={o.tecnico} principal />
            {o.ayudantes.map((a) => <PersonaFila key={a.nombre} p={a} />)}
          </>
        ) : (
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="shield-checkmark-outline" size={26} color={C.marino} />
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
        <Texto gris size={13}>{o.cliente.direccion}</Texto>
      </Tarjeta>

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
          <Aviso texto={msg} tono="ok" />
        </Tarjeta>
      ) : null}

      {o.estado === "completado" ? (
        <Tarjeta>
          {o.propina.dada ? <Aviso tono="ok" texto={`¡Gracias! Le diste USD ${o.propina.monto} de propina a la cuadrilla.`} /> : (
            <>
              <Texto negrita size={16}>¿Quieres dar propina a la cuadrilla?</Texto>
              <Texto gris size={14}>Es opcional. Va completa al técnico y su ayudante.</Texto>
              <FormPago titulo="PROPINA" boton="Dar propina" conMonto
                onEnviar={async (d) => { await api(`/ordenes/${id}/propina`, { body: d }); cargar(); }} />
            </>
          )}
        </Tarjeta>
      ) : null}

      <Aviso texto={error} />
      {puedeCambiar ? (
        <>
          <Boton titulo="PROGRAMAR INSTALACIÓN" onPress={() => nav.push("reprogramar", { id: o.id })} />
          <Boton titulo="Cancelar pedido" tipo="peligro" onPress={cancelar} />
        </>
      ) : null}
    </Pantalla>
  );
}

function PersonaFila({ p, principal }: { p: Persona; principal?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
      <Avatar nombre={p.nombre} foto={p.foto} size={principal ? 68 : 46} borde={principal ? C.lima : undefined} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: principal ? 18 : 15, fontWeight: "800", color: C.texto }}>{p.nombre}</Text>
        <Text style={{ fontSize: 13, color: C.gris }}>{p.rol === "ayudante" ? "Ayudante asignado" : "Técnico asignado"} · verificado por AHA HOME</Text>
      </View>
    </View>
  );
}
