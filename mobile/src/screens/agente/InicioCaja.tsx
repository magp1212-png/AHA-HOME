import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import { useSession } from "../../session";
import type { Orden } from "../../types";
import { BotonCuenta, Campana, Aviso, Boton, C, Cargando, Etiqueta, Pantalla, Texto, tonoEstado } from "../../ui";

export default function InicioCaja() {
  const nav = useNav();
  const { perfil, salir } = useSession();
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setOrdenes(await api<Orden[]>("/ordenes")); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <Pantalla titulo="AHA HOME · Caja" subtitulo={perfil?.nombre} volver={false} onRefresh={cargar}
      derecha={<><Campana /><BotonCuenta /></>}>
      <Boton titulo="Nueva orden de servicio" icono="add-circle" tipo="lima" onPress={() => nav.push("nuevaOrden")} />
      <Aviso texto={error} />
      <Texto negrita>Órdenes de la tienda</Texto>
      {ordenes === null ? <Cargando /> : null}
      {ordenes?.length === 0 ? <Texto gris>Todavía no hay órdenes.</Texto> : null}
      {ordenes?.map((o) => (
        <Pressable key={o.id} onPress={() => nav.push("ordenCaja", { id: o.id })}
          style={{ backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "800", color: C.texto }}>{o.codigo} · {o.cliente.nombre}</Text>
            <Etiqueta texto={o.estado_texto} tono={tonoEstado(o.estado)} />
          </View>
          <Text style={{ color: C.gris, fontSize: 13 }}>{o.tipo_servicio_texto} · {o.articulos.length} artículo(s) · {o.fecha} {o.franja}</Text>
          <Text style={{ color: C.gris, fontSize: 13 }}>{o.tecnico ? `${o.tecnico.nombre}${o.ayudantes.length ? " + " + o.ayudantes.map((a) => a.nombre).join(", ") : ""}` : "Sin técnico asignado"}</Text>
        </Pressable>
      ))}
    </Pantalla>
  );
}
