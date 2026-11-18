import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden } from "../../types";
import { Aviso, C, Cargando, Etiqueta, Pantalla, Texto, Titulo, tonoEstado } from "../../ui";

export default function InicioCliente() {
  const nav = useNav();
  const { perfil, salir } = useSession();
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
      derecha={<Pressable accessibilityLabel="Salir" onPress={salir} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="log-out-outline" size={22} color={C.blanco} /></Pressable>}>
      <View>
        <Texto gris>Hola,</Texto>
        <Titulo>{perfil?.nombre}</Titulo>
      </View>
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
