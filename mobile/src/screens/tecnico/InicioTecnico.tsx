import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { api } from "../../api";
import { confirmarIdentidad, biometriaDisponible } from "../../biometria";
import { useGpsEnVivo } from "../../gps";
import { HamburguesaTecnico, MenuTecnico } from "../../menus";
import { BotonChat } from "../cliente/InicioActivo";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden, Persona } from "../../types";
import { Aviso, Boton, C, Campana, Cargando, Etiqueta, MenuHamburguesa, Pantalla, Tarjeta, Texto, Titulo } from "../../ui";

export type Hoy = {
  fecha: string; rol: "tecnico" | "ayudante"; grupo: string | null; grupo_de_guardia_hoy: string; de_guardia: boolean; verificado: boolean;
  respaldo: boolean; respaldo_activo: boolean; ausente: boolean;
  tienda: string; jefe: Persona | null; mis_ayudantes: Persona[]; supervisor: { nombre: string; telefono: string } | null;
  orden_activa: Orden | null; pendientes: Orden[]; completadas: number;
};

export function navegarA(o: Orden, haciaTienda: boolean) {
  const destino = haciaTienda ? o.tienda.direccion || o.tienda.nombre : o.cliente.direccion;
  const coord = !haciaTienda && o.cliente.lat && o.cliente.lng ? `${o.cliente.lat},${o.cliente.lng}` : null;
  const q = encodeURIComponent(coord ?? destino + ", Caracas");
  Linking.openURL(Platform.OS === "ios" ? `maps://?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
}

/** Miniatura de mapa junto a la dirección: al tocarla abre la navegación. */
export function MiniMapa({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir navegación" onPress={onPress}
      style={{ width: 70, height: 58, borderRadius: 10, overflow: "hidden", backgroundColor: "#DCE9D5", borderWidth: 1, borderColor: C.linea }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 30, height: 7, backgroundColor: C.blanco, transform: [{ rotate: "-12deg" }] }} />
      <View style={{ position: "absolute", left: 40, top: -10, width: 6, height: 90, backgroundColor: "#F7F3E8", transform: [{ rotate: "18deg" }] }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="location" size={26} color="#D93025" />
      </View>
    </Pressable>
  );
}

export default function InicioTecnico() {
  const nav = useNav();
  const { perfil } = useSession();
  const { width } = useWindowDimensions();
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    try { setHoy(await api<Hoy>("/tecnico/hoy")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  async function accion(ruta: string, body: any = {}) {
    setCargando(true); setError(null);
    try { await api(ruta, { body }); await cargar(); } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  async function retirar() {
    // confirma su identidad con la huella antes de escanear el QR del almacén
    if (await biometriaDisponible()) {
      const ok = await confirmarIdentidad("Confirma tu identidad para retirar el equipo");
      if (!ok) { setError("No se confirmó tu identidad."); return; }
    }
    nav.push("escaner");
  }

  const esAyudante = perfil?.rol === "ayudante";
  const o = hoy?.orden_activa;
  useGpsEnVivo(!!o && ["en_ruta", "en_progreso"].includes(o.estado));
  const anchoTarjeta = Math.min(width, 560) - 32 - (hoy?.pendientes.length ? 28 : 0);
  const estadoGuardia = !hoy ? "" : hoy.ausente ? "NO DISPONIBLE" : hoy.respaldo_activo ? "RESPALDO ACTIVO" : hoy.de_guardia ? "ACTIVA" : "DESCANSO";
  const colorGuardia = !hoy ? C.gris : hoy.ausente ? C.error : hoy.de_guardia || hoy.respaldo_activo ? C.ok : C.gris;

  return (
    <Pantalla titulo="AHA HOME Técnico" subtitulo={hoy?.tienda} volver={false} onRefresh={cargar}
      izquierda={<HamburguesaTecnico />} derecha={<Campana />} abajo={<MenuTecnico activo="inicio" />}>
      {!hoy ? (error ? <Aviso texto={error} /> : <Cargando />) : (
        <>
          <View>
            <Texto gris>Hola, {perfil?.nombre.split(" ")[0]}</Texto>
            <Titulo>Resumen y contacto</Titulo>
          </View>
          {!hoy.verificado ? <Aviso tono="info" texto="Tu registro está listo. Pasa por la oficina para completar tu expediente y recibir el alta con tu grupo: después empezarás a recibir órdenes." /> : null}

          <Tarjeta style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.gris, fontSize: 12.5 }}>Guardia de hoy: Grupo {hoy.grupo_de_guardia_hoy}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorGuardia }} />
                <Text style={{ color: colorGuardia, fontSize: 16, fontWeight: "900" }}>{estadoGuardia}</Text>
                <Text style={{ color: C.texto, fontSize: 14, fontWeight: "700" }}>· {hoy.grupo === "RETEN" ? "Retén" : `Grupo ${hoy.grupo ?? "—"}`}</Text>
              </View>
              {esAyudante && hoy.jefe ? <Text style={{ color: C.gris, fontSize: 13 }}>Sales con: {hoy.jefe.nombre}</Text> : null}
            </View>
            {hoy.supervisor ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Llamar al supervisor ${hoy.supervisor.nombre}`}
                onPress={() => Linking.openURL(`tel:${hoy.supervisor!.telefono}`)}
                style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.naranja, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="call" size={17} color={C.blanco} /><Text style={{ color: C.blanco, fontWeight: "900", fontSize: 13 }}>SUPERVISOR</Text>
              </Pressable>
            ) : null}
          </Tarjeta>

          {!esAyudante && hoy.verificado ? (
            hoy.de_guardia || hoy.respaldo_activo ? (
              hoy.ausente ? (
                <Tarjeta>
                  <Texto negrita>Avisaste que hoy no puedes trabajar.</Texto>
                  <Boton titulo="Ya puedo trabajar" tipo="secundario" onPress={() => accion("/tecnico/ausencia", { disponible: true })} />
                </Tarjeta>
              ) : null
            ) : (
              <Tarjeta>
                <Texto negrita>Hoy estás de descanso</Texto>
                <Texto gris size={14}>Si puedes trabajar, ofrécete como respaldo: el centro de control te activa si faltan técnicos.</Texto>
                <Boton titulo={hoy.respaldo ? "Ya no estoy disponible hoy" : "Estoy disponible como respaldo hoy"} tipo={hoy.respaldo ? "secundario" : "lima"}
                  icono={hoy.respaldo ? "close" : "hand-right"} onPress={() => accion("/tecnico/respaldo", { disponible: !hoy.respaldo })} />
                {hoy.respaldo ? <Etiqueta texto="Ofrecido como respaldo · esperando activación" tono="ok" /> : null}
              </Tarjeta>
            )
          ) : null}
          <Aviso texto={error} />

          {o ? (
            <ScrollView horizontal snapToInterval={anchoTarjeta + 10} decelerationRate="fast" showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              <TarjetaOrden o={o} activa ancho={anchoTarjeta} esAyudante={esAyudante} cargando={cargando}
                accion={accion} retirar={retirar} />
              {hoy.pendientes.map((p) => (
                <TarjetaOrden key={p.id} o={p} ancho={anchoTarjeta} esAyudante={esAyudante} cargando={cargando} accion={accion} retirar={retirar} />
              ))}
            </ScrollView>
          ) : <Aviso tono="info" texto={hoy.completadas ? `¡Listo por hoy! Completaste ${hoy.completadas} orden(es).` : "No tienes órdenes para hoy."} />}

          {hoy.pendientes.length ? (
            <Text style={{ fontSize: 15, fontWeight: "900", color: C.texto }}>ÓRDENES PENDIENTES <Text style={{ fontWeight: "500", color: C.gris }}>(hoy)</Text></Text>
          ) : null}
          {hoy.pendientes.map((p) => <FilaPendiente key={p.id} o={p} />)}

          {!esAyudante && hoy.verificado && (hoy.de_guardia || hoy.respaldo_activo) && !hoy.ausente ? (
            <Boton titulo="No puedo trabajar hoy" tipo="peligro" icono="close-circle" onPress={() => accion("/tecnico/ausencia", { disponible: false, motivo: "Avisado desde la app" })} />
          ) : null}
        </>
      )}
    </Pantalla>
  );
}

export function FilaPendiente({ o }: { o: Orden }) {
  return (
    <View style={{ backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12, gap: 2 }}>
      <Text style={{ fontWeight: "800", color: C.texto }}>{o.codigo} · {o.articulos.map((a) => a.nombre).join(", ")}</Text>
      <Text style={{ color: C.texto, fontSize: 13.5 }}>{o.franja.replace("-", " – ")} · {o.tipo_servicio_texto}</Text>
      <Text style={{ color: C.gris, fontSize: 13 }}>{o.cliente.direccion}</Text>
    </View>
  );
}

/** Tarjeta de una orden con encabezado oscuro, miniatura del mapa y botones grandes con un color por acción. */
function TarjetaOrden({ o, activa, ancho, esAyudante, cargando, accion, retirar }: {
  o: Orden; activa?: boolean; ancho: number; esAyudante: boolean; cargando: boolean;
  accion: (ruta: string, body?: any) => void; retirar: () => void;
}) {
  const nav = useNav();
  const antes = ["tecnico_asignado", "cita_confirmada"].includes(o.estado);
  const opciones = [
    { icono: "chatbubble-ellipses-outline" as const, texto: "Chat con el cliente", onPress: () => nav.push("chat", { id: o.id }) },
    { icono: "warning-outline" as const, texto: "Reportar incidencia", onPress: () => nav.push("incidencia", { id: o.id }), peligro: true },
    ...(!o.inspeccion.requerida && o.articulos.some((a) => a.instalar) && antes
      ? [{ icono: "pause-circle-outline" as const, texto: "Pausar: hace falta inspección", onPress: () => accion(`/ordenes/${o.id}/inspeccion`) }] : []),
    { icono: "call-outline" as const, texto: "Llamar al cliente", onPress: () => Linking.openURL(`tel:${o.cliente.telefono}`) },
    ...(["en_ruta", "en_progreso"].includes(o.estado) ? [
      { icono: "return-up-back-outline" as const, texto: "No se pudo entregar: cliente ausente", peligro: true,
        onPress: () => accion(`/tecnico/ordenes/${o.id}/entrega-fallida`, { motivo: "El cliente no estaba en casa" }) },
      { icono: "close-circle-outline" as const, texto: "No se pudo entregar: no recibió", peligro: true,
        onPress: () => accion(`/tecnico/ordenes/${o.id}/entrega-fallida`, { motivo: "El cliente no recibió la compra" }) },
    ] : []),
  ];
  return (
    <View style={{ width: ancho, backgroundColor: C.blanco, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.linea, opacity: activa ? 1 : 0.92 }}>
      <View style={{ backgroundColor: C.marino, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: C.blanco, fontSize: 17, fontWeight: "900" }}>{activa ? "ORDEN ACTIVA" : "SIGUIENTE"}: {o.codigo}</Text>
          <Text style={{ color: "#DCDEF0", fontSize: 12.5 }}>Hora: {o.franja.replace("-", " – ")} · {o.tipo_servicio_texto}</Text>
        </View>
        {!esAyudante ? <MenuHamburguesa icono="ellipsis-vertical" etiqueta="Más opciones de la orden" opciones={opciones} /> : <View style={{ width: 44 }} />}
      </View>
      <View style={{ padding: 12, gap: 8 }}>
        <Etiqueta texto={o.estado_texto} tono={o.estado === "en_ruta" || o.estado === "en_progreso" ? "alerta" : "lima"} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.gris, fontSize: 12 }}>Cliente</Text>
            <Text style={{ color: C.texto, fontWeight: "800", fontSize: 15 }}>{o.cliente.nombre} · {o.cliente.telefono}</Text>
          </View>
          <BotonChat id={o.id} n={0} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.gris, fontSize: 12 }}>Dirección</Text>
            <Text style={{ color: C.texto, fontSize: 14 }}>{o.cliente.direccion}{o.cliente.referencia ? ` (${o.cliente.referencia})` : ""}</Text>
          </View>
          <MiniMapa onPress={() => navegarA(o, false)} />
        </View>
        <View style={{ height: 1, backgroundColor: C.linea }} />
        {o.articulos.map((a) => (
          <Text key={a.id} style={{ color: C.texto, fontSize: 14 }}>
            <Text style={{ fontWeight: "800" }}>{a.nombre}{a.modelo ? ` ${a.modelo}` : ""}</Text> — {a.instalar ? "instalar" : "entregar en su caja"}
          </Text>
        ))}
        {o.ayudantes.length ? <Text style={{ color: C.gris, fontSize: 13 }}>Ayudante: {o.ayudantes.map((a) => a.nombre).join(", ")}</Text> : null}

        {!esAyudante ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            {o.inspeccion.requerida && antes ? (
              <View style={{ gap: 8, backgroundColor: C.naranjaSuave, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: C.texto, fontWeight: "800" }}>En pausa: inspección antes del retiro · {o.inspeccion.fecha} {o.inspeccion.franja}</Text>
                <Text style={{ color: C.gris, fontSize: 13 }}>
                  {o.presupuesto ? `Presupuesto USD ${o.presupuesto.total}: ${o.presupuesto.estado_texto}` : "Visita al cliente, revisa y envía el presupuesto."}
                </Text>
                <Boton titulo={o.presupuesto ? "Ver presupuesto" : "Hacer presupuesto"} icono="calculator" tipo={o.presupuesto ? "secundario" : "naranja"}
                  onPress={() => nav.push("presupuesto", { id: o.id })} />
              </View>
            ) : null}
            {o.estado === "tecnico_asignado" ? <Boton titulo="Confirmar cita" tipo="secundario" icono="checkmark-circle-outline" onPress={() => accion(`/tecnico/ordenes/${o.id}/confirmar`)} cargando={cargando} /> : null}
            {activa && antes && o.listo_para_instalar && o.con_retiro_en_tienda ? (
              <>
                <Boton titulo="NAVEGAR A LA TIENDA" tipo="naranja" icono="navigate" onPress={() => navegarA(o, true)} />
                <Boton titulo="RETIRO EN ALMACÉN: ESCANEAR QR" icono="qr-code" onPress={retirar} />
              </>
            ) : null}
            {activa && antes && o.listo_para_instalar && !o.con_retiro_en_tienda ? (
              <Boton titulo="SALIR HACIA EL CLIENTE" icono="car" onPress={() => accion(`/tecnico/ordenes/${o.id}/salir`)} cargando={cargando} />
            ) : null}
            {o.estado === "en_ruta" ? (
              <>
                <Boton titulo="NAVEGAR" tipo="naranja" icono="navigate" onPress={() => navegarA(o, false)} />
                <Boton titulo="LLEGUÉ AL DOMICILIO" icono="home" onPress={() => accion(`/tecnico/ordenes/${o.id}/llegada`)} cargando={cargando} />
              </>
            ) : null}
            {o.estado === "en_progreso" ? (
              <Boton titulo={o.tipo_servicio === "traslado" ? "CHECKLIST DE ENTREGA" : "CHECKLIST DE INSTALACIÓN"} tipo="exito" icono="clipboard"
                onPress={() => nav.push("checklist", { id: o.id })} />
            ) : null}
            {!activa && antes ? <Text style={{ color: C.gris, fontSize: 12.5, textAlign: "center" }}>Desliza para volver a tu orden activa</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
