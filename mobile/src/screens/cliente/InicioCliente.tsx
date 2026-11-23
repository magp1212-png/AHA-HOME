import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import { HamburguesaCliente, MenuCliente } from "../../menus";
import type { Orden } from "../../types";
import { Campana, Aviso, C, Cargando, Etiqueta, Pantalla, Texto, Titulo, tonoEstado } from "../../ui";
import InicioActivo from "./InicioActivo";

/** Inicio del cliente: si tiene un pedido en curso, muestra directo su rastreo. Con `lista`, es «Mis pedidos». */
export default function InicioCliente({ lista }: { lista?: boolean }) {
  const nav = useNav();
  const { perfil, recargar } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  const horas = perfil?.verificacion_vence ? Math.max(0, Math.ceil((new Date(perfil.verificacion_vence).getTime() - Date.now()) / 3600000)) : null;

  async function reenviar() {
    try { await api("/auth/reenviar-verificacion", { body: {} }); setMsg(`Te enviamos otro correo a ${perfil?.email}.`); } catch (e: any) { setError(e.message); }
  }
  async function yaVerifique() {
    await recargar().catch(() => {});
    cargar();
  }
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [recientes, setRecientes] = useState(true);

  const cargar = useCallback(async () => {
    try { setOrdenes(await api<Orden[]>("/ordenes")); setError(null); } catch (e: any) { setError(e.message); }
    setRefrescando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const activas = (ordenes ?? []).filter((o) => !["completado", "cancelado"].includes(o.estado));
  const pasadas = (ordenes ?? []).filter((o) => ["completado", "cancelado"].includes(o.estado));
  if (!lista && ordenes && perfil?.email_verificado) {
    // el pedido en curso, o el último completado sin calificar, para que pueda calificar
    const sinCalificar = pasadas.find((x) => x.estado === "completado" && !x.calificacion);
    // primero la que va en camino o está en su casa; si no, la más próxima por fecha
    const PRIO: Record<string, number> = { en_progreso: 0, en_ruta: 1, entrega_fallida: 2, cita_confirmada: 3, tecnico_asignado: 4, solicitud_enviada: 5 };
    const principal = [...activas].sort((a, b) => (PRIO[a.estado] ?? 9) - (PRIO[b.estado] ?? 9) || a.fecha.localeCompare(b.fecha))[0];
    return <InicioActivo o={principal ?? sinCalificar ?? null} onRefrescar={cargar} />;
  }

  return (
    <Pantalla titulo={lista ? "Mis pedidos" : "AHA HOME"} subtitulo={lista ? undefined : "Rastreo de pedido e instalación"} volver={!!lista}
      izquierda={lista ? undefined : <HamburguesaCliente />}
      onRefresh={() => { setRefrescando(true); cargar(); }} refrescando={refrescando}
      derecha={<Campana />} abajo={<MenuCliente activo={lista ? "pedidos" : "inicio"} />}>
      {!lista ? (
        <View>
          <Texto gris>Hola,</Texto>
          <Titulo>{perfil?.nombre}</Titulo>
        </View>
      ) : null}
      {perfil && !perfil.email_verificado ? (
        <View style={{ backgroundColor: C.alertaSuave, borderRadius: 16, padding: 14, gap: 10 }}>
          <Text style={{ fontWeight: "800", color: "#9A3412", fontSize: 15 }}>Verifica tu correo{horas !== null ? ` · te quedan ${horas} h` : ""}</Text>
          <Text style={{ color: "#9A3412", fontSize: 14 }}>Abre el correo que te enviamos a {perfil.email} y toca «Verificar mi correo». Si no lo haces en 24 horas, tu registro se elimina.</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={reenviar} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: "#9A3412", justifyContent: "center" }}>
              <Text style={{ color: "#9A3412", fontWeight: "800" }}>Reenviar correo</Text></Pressable>
            <Pressable onPress={yaVerifique} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.marino, justifyContent: "center" }}>
              <Text style={{ color: C.blanco, fontWeight: "800" }}>Ya lo verifiqué</Text></Pressable>
          </View>
          {msg ? <Text style={{ color: "#0F5132" }}>{msg}</Text> : null}
        </View>
      ) : null}
      <Aviso texto={error} />
      {ordenes === null ? <Cargando /> : null}
      {ordenes && ordenes.length === 0 ? (
        <Aviso tono="info" texto="Aún no tienes pedidos. Cuando compres en Damasco y pidas AHA HOME en la caja, tu pedido aparecerá aquí con el mismo teléfono." />
      ) : null}
      {lista && ordenes?.length ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, paddingHorizontal: 12, minHeight: 48 }}>
            <Ionicons name="search" size={18} color={C.gris} />
            <TextInput value={buscar} onChangeText={setBuscar} placeholder="Tienda, orden, artículo o fecha" placeholderTextColor="#6B7789" style={{ flex: 1, fontSize: 15, color: C.texto }} />
            {buscar ? <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => setBuscar("")}><Ionicons name="close-circle" size={20} color={C.gris} /></Pressable> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setRecientes(!recientes)} style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name={recientes ? "arrow-down" : "arrow-up"} size={16} color={C.marino} /><Text style={{ fontWeight: "800", color: C.marino, fontSize: 13 }}>{recientes ? "Recientes" : "Antiguas"}</Text>
          </Pressable>
        </View>
      ) : null}
      {(() => {
        const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const palabras = norm(buscar).split(/\s+/).filter(Boolean);
        const pasa = (o: Orden) => { const t = norm([o.codigo, o.codigo.replace("-", ""), o.tienda?.nombre ?? "", o.fecha, o.tipo_servicio_texto, ...o.articulos.map((a) => `${a.nombre} ${a.marca} ${a.modelo}`)].join(" "));
          return palabras.every((p) => t.includes(p)); };
        const ord = (xs: Orden[]) => [...xs].filter(pasa).sort((a, b) => (recientes ? -1 : 1) * a.fecha.localeCompare(b.fecha));
        const act = ord(activas), pas = ord(pasadas);
        return (
          <>
            {lista && buscar ? <Texto gris size={13}>{act.length + pas.length} resultado(s)</Texto> : null}
            {lista && act.length ? <Text style={{ fontSize: 13, fontWeight: "800", color: C.gris }}>EN CURSO</Text> : null}
            {act.map((o) => <TarjetaOrden key={o.id} o={o} onPress={() => nav.push("rastreo", { id: o.id })} />)}
            {pas.length ? <Text style={{ fontSize: 13, fontWeight: "800", color: C.gris, marginTop: 8 }}>HISTORIAL</Text> : null}
            {pas.map((o) => <TarjetaOrden key={o.id} o={o} onPress={() => nav.push("rastreo", { id: o.id })} />)}
            {lista && pas.length ? <Texto gris size={12.5}>Si guardaste el empaque, consérvalo 30 días después del acta por si necesitas la garantía.</Texto> : null}
          </>
        );
      })()}
    </Pantalla>
  );
}

function TarjetaOrden({ o, onPress }: { o: Orden; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ backgroundColor: C.blanco, borderRadius: 16, borderWidth: 1, borderColor: C.linea, padding: 16, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: C.gris, letterSpacing: 0.5 }}>{o.codigo} · {o.tipo_servicio_texto.toUpperCase()}</Text>
        <Etiqueta texto={o.estado_texto} tono={tonoEstado(o.estado)} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: C.texto }}>{o.articulos.map((a) => a.nombre).join(" · ")}</Text>
      <Text style={{ fontSize: 14, color: C.gris }}>{o.fecha} · {o.franja.replace("-", " – ")}</Text>
    </Pressable>
  );
}
