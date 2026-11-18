import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden } from "../../types";
import { Campana, Aviso, C, Cargando, Etiqueta, Pantalla, Texto, Titulo, tonoEstado } from "../../ui";

export default function InicioCliente() {
  const nav = useNav();
  const { perfil, salir, recargar } = useSession();
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

  const cargar = useCallback(async () => {
    try { setOrdenes(await api<Orden[]>("/ordenes")); setError(null); } catch (e: any) { setError(e.message); }
    setRefrescando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const activas = (ordenes ?? []).filter((o) => !["completado", "cancelado"].includes(o.estado));
  const pasadas = (ordenes ?? []).filter((o) => ["completado", "cancelado"].includes(o.estado));

  return (
    <Pantalla titulo="AHA HOME" subtitulo="Rastreo de pedido e instalación" volver={false} onRefresh={() => { setRefrescando(true); cargar(); }} refrescando={refrescando}
      derecha={<><Campana /><Pressable accessibilityLabel="Salir" onPress={salir} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="log-out-outline" size={22} color={C.blanco} /></Pressable></>}>
      <View>
        <Texto gris>Hola,</Texto>
        <Titulo>{perfil?.nombre}</Titulo>
      </View>
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
      {activas.map((o) => <TarjetaOrden key={o.id} o={o} onPress={() => nav.push("rastreo", { id: o.id })} />)}
      {pasadas.length ? <Text style={{ fontSize: 13, fontWeight: "800", color: C.gris, marginTop: 8 }}>ANTERIORES</Text> : null}
      {pasadas.map((o) => <TarjetaOrden key={o.id} o={o} onPress={() => nav.push("rastreo", { id: o.id })} />)}
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
