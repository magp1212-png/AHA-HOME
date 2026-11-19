import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "../../api";
import { MenuCliente } from "../../menus";
import type { Orden } from "../../types";
import { Aviso, C, Cargando, Etiqueta, Pantalla } from "../../ui";

const ICONO: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  nevera: "snow-outline", lavadora: "water-outline", secadora: "sunny-outline", aire_acondicionado: "thermometer-outline",
  cocina: "flame-outline", televisor: "tv-outline", otro: "cube-outline",
};

/** Mis equipos: lo que AHA HOME ya entregó o instaló, con su fecha y su orden (para la garantía). */
export default function MisEquipos() {
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Orden[]>("/ordenes").then(setOrdenes).catch((e) => setError(e.message)); }, []);
  const hechos = (ordenes ?? []).filter((o) => o.estado === "completado").flatMap((o) => o.articulos.map((a) => ({ a, o })));
  return (
    <Pantalla titulo="Mis equipos" abajo={<MenuCliente activo="inicio" />}>
      <Aviso texto={error} />
      {ordenes === null ? <Cargando /> : hechos.length === 0 ? <Aviso tono="info" texto="Aquí aparecerán los equipos que te entreguemos o instalemos, con su fecha para la garantía." /> : null}
      {hechos.map(({ a, o }) => (
        <View key={`${o.id}-${a.id}`} style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.blanco, borderRadius: 16, borderWidth: 1, borderColor: C.linea, padding: 12 }}>
          <View style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={ICONO[a.tipo] ?? "cube-outline"} size={28} color={C.marino} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: "800", color: C.texto, fontSize: 15 }}>{a.nombre}{a.modelo ? ` ${a.modelo}` : ""}</Text>
            <Text style={{ color: C.gris, fontSize: 13 }}>{o.codigo} · {o.fecha}{a.serial ? ` · serial ${a.serial}` : ""}</Text>
          </View>
          <Etiqueta texto={a.instalar ? "Instalado" : "Entregado"} tono="ok" />
        </View>
      ))}
    </Pantalla>
  );
}
