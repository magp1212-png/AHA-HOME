import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { confirmarIdentidad, biometriaDisponible } from "../../biometria";
import { useGpsEnVivo } from "../../gps";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden, Persona } from "../../types";
import { Aviso, Avatar, Boton, C, Cargando, Etiqueta, Pantalla, Tarjeta, Texto, Titulo, tonoEstado } from "../../ui";

type Hoy = {
  fecha: string; rol: "tecnico" | "ayudante"; grupo: string | null; grupo_de_guardia_hoy: string; de_guardia: boolean; verificado: boolean;
  tienda: string; jefe: Persona | null; mis_ayudantes: Persona[]; supervisor: { nombre: string; telefono: string } | null;
  orden_activa: Orden | null; pendientes: Orden[]; completadas: number;
};

export default function InicioTecnico() {
  const nav = useNav();
  const { perfil, salir } = useSession();
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    try { setHoy(await api<Hoy>("/tecnico/hoy")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  async function accion(ruta: string) {
    setCargando(true); setError(null);
    try { await api(ruta, { body: {} }); await cargar(); } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  async function retirar() {
    // Fase B: confirma su identidad con la huella antes de escanear el QR del almacén
    if (await biometriaDisponible()) {
      const ok = await confirmarIdentidad("Confirma tu identidad para retirar el equipo");
      if (!ok) { setError("No se confirmó tu identidad."); return; }
    }
    nav.push("escaner");
  }

  function navegar(o: Orden, haciaTienda: boolean) {
    const destino = haciaTienda ? o.tienda.direccion || o.tienda.nombre : o.cliente.direccion;
    const q = encodeURIComponent(destino + ", Caracas");
    Linking.openURL(Platform.OS === "ios" ? `maps://?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
  }

  const esAyudante = perfil?.rol === "ayudante";
  const o = hoy?.orden_activa;
  useGpsEnVivo(!!o && ["en_ruta", "en_progreso"].includes(o.estado));
  return (
    <Pantalla titulo={`Hola, ${perfil?.nombre.split(" ")[0] ?? ""}`} subtitulo={hoy?.tienda} volver={false} onRefresh={cargar}
      derecha={<Pressable accessibilityLabel="Salir" onPress={salir} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="log-out-outline" size={22} color={C.blanco} /></Pressable>}>
      {!hoy ? (error ? <Aviso texto={error} /> : <Cargando />) : (
        <>
          {!hoy.verificado ? <Aviso tono="info" texto="Tu registro está listo. Pasa por la oficina para completar tu expediente y recibir el alta con tu grupo: después empezarás a recibir órdenes." /> : null}
          <Tarjeta oscura>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#C5C8E4", fontSize: 12 }}>Guardia de hoy: Grupo {hoy.grupo_de_guardia_hoy}</Text>
                <Text style={{ color: C.blanco, fontSize: 16, fontWeight: "800" }}>
                  {hoy.de_guardia ? "● ACTIVA" : "Descanso"} · {hoy.grupo === "RETEN" ? "Guardia Retén" : `Grupo ${hoy.grupo ?? "—"}`}
                </Text>
              </View>
              {hoy.supervisor ? (
                <Pressable onPress={() => Linking.openURL(`tel:${hoy.supervisor!.telefono}`)}
                  style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.alerta, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="call" size={18} color={C.blanco} /><Text style={{ color: C.blanco, fontWeight: "800" }}>Supervisor</Text>
                </Pressable>
              ) : null}
            </View>
            {esAyudante && hoy.jefe ? <Text style={{ color: "#DCDEF0" }}>Sales con: {hoy.jefe.nombre}</Text> : null}
          </Tarjeta>

          <Aviso texto={error} />
          {o ? (
            <Tarjeta>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Titulo>ORDEN ACTIVA · {o.codigo}</Titulo>
              </View>
              <Etiqueta texto={`${o.tipo_servicio_texto} · ${o.estado_texto}`} tono={tonoEstado(o.estado)} />
              <Texto gris size={13}>Cliente</Texto>
              <Texto negrita>{o.cliente.nombre} · {o.cliente.telefono}</Texto>
              <Texto gris size={13}>Dirección</Texto>
              <Texto>{o.cliente.direccion}{o.cliente.referencia ? ` (${o.cliente.referencia})` : ""}</Texto>
              <Texto gris size={13}>Artículos · {o.fecha} {o.franja}</Texto>
              {o.articulos.map((a) => <Texto key={a.id}>• {a.nombre} {a.modelo} — {a.instalar ? "instalar" : "entregar en su caja"}</Texto>)}
              {o.ayudantes.length ? <Texto gris>Ayudante: {o.ayudantes.map((a) => a.nombre).join(", ")}</Texto> : null}
              {!esAyudante ? (
                <View style={{ gap: 10, marginTop: 6 }}>
                  {o.estado === "tecnico_asignado" ? <Boton titulo="Confirmar cita" tipo="secundario" onPress={() => accion(`/tecnico/ordenes/${o.id}/confirmar`)} cargando={cargando} /> : null}
                  {["tecnico_asignado", "cita_confirmada"].includes(o.estado) && o.con_retiro_en_tienda ? (
                    <>
                      <Boton titulo="Ir a la tienda" tipo="secundario" icono="navigate" onPress={() => navegar(o, true)} />
                      <Boton titulo="Retiro en almacén: escanear QR" icono="qr-code" onPress={retirar} />
                    </>
                  ) : null}
                  {["tecnico_asignado", "cita_confirmada"].includes(o.estado) && !o.con_retiro_en_tienda ? (
                    <Boton titulo="Salir hacia el cliente" icono="car" onPress={() => accion(`/tecnico/ordenes/${o.id}/salir`)} cargando={cargando} />
                  ) : null}
                  {o.estado === "en_ruta" ? (
                    <>
                      <Boton titulo="Iniciar navegación" icono="navigate" tipo="secundario" onPress={() => navegar(o, false)} />
                      <Boton titulo="Llegué al domicilio" icono="home" onPress={() => accion(`/tecnico/ordenes/${o.id}/llegada`)} cargando={cargando} />
                    </>
                  ) : null}
                  {o.estado === "en_progreso" ? <Boton titulo="Checklist y cierre" icono="clipboard" tipo="exito" onPress={() => nav.push("checklist", { id: o.id })} /> : null}
                  <Boton titulo="Reportar incidencia" tipo="peligro" icono="warning" onPress={() => nav.push("incidencia", { id: o.id })} />
                </View>
              ) : null}
            </Tarjeta>
          ) : <Aviso tono="info" texto={hoy.completadas ? `¡Listo por hoy! Completaste ${hoy.completadas} orden(es).` : "No tienes órdenes para hoy."} />}

          {hoy.pendientes.length ? <Texto negrita>Órdenes pendientes de hoy</Texto> : null}
          {hoy.pendientes.map((p) => (
            <View key={p.id} style={{ backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12, flexDirection: "row", gap: 12 }}>
              <Text style={{ fontWeight: "800", color: C.texto, width: 92 }}>{p.franja}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: C.texto }}>{p.codigo} · {p.tipo_servicio_texto}</Text>
                <Text style={{ color: C.gris, fontSize: 13 }}>{p.cliente.direccion}</Text>
              </View>
            </View>
          ))}

          {!esAyudante ? (
            <Tarjeta>
              <Texto negrita>Mis ayudantes</Texto>
              {hoy.mis_ayudantes.map((a) => (
                <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar nombre={a.nombre} foto={a.foto} size={40} />
                  <Text style={{ flex: 1, color: C.texto, fontWeight: "600" }}>{a.nombre}</Text>
                </View>
              ))}
              <Boton titulo="Ver y agregar ayudantes" tipo="secundario" icono="people" onPress={() => nav.push("ayudantes")} />
            </Tarjeta>
          ) : null}
        </>
      )}
    </Pantalla>
  );
}
