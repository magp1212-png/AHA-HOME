import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "../../api";
import { DetalleVisita, type Visita } from "../../components";
import { useNav } from "../../nav";
import { Aviso, Boton, C, Cargando, Pantalla, Tarjeta } from "../../ui";

/** Después de escanear el QR de la tienda: todo lo que va a retirar y el estado del OK de caja. */
export default function VisitaTienda() {
  const nav = useNav();
  const [v, setV] = useState<Visita | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try { setV(await api<Visita | null>("/tecnico/tienda/visita")); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 4000); return () => clearInterval(t); }, [cargar]);

  const est = v?.estado;
  const banda = est === "autorizada" ? { color: C.ok, icono: "checkmark-circle" as const, titulo: "RETIRO AUTORIZADO", texto: "Caja dio el OK. Ya vas en ruta: el cliente recibió tu foto." }
    : est === "rechazada" ? { color: C.error, icono: "close-circle" as const, titulo: "RETIRO NO AUTORIZADO", texto: v?.motivo || "Habla con la caja o con tu supervisor." }
    : est === "cancelada" ? { color: C.gris, icono: "remove-circle" as const, titulo: "VISITA CANCELADA", texto: "Escaneaste de nuevo el QR de la tienda." }
    : { color: C.naranja, icono: "hourglass" as const, titulo: "ESPERANDO EL OK DE CAJA", texto: "Muestra esta pantalla en caja. La persona de caja revisa y autoriza el retiro." };

  return (
    <Pantalla titulo="Retiro en tienda" subtitulo={v?.tienda.nombre}>
      {!v ? (error ? <Aviso texto={error} /> : <Cargando />) : (
        <>
          <View style={{ backgroundColor: banda.color, borderRadius: 18, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Ionicons name={banda.icono} size={40} color={C.blanco} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.blanco, fontWeight: "900", fontSize: 17 }}>{banda.titulo}</Text>
              <Text style={{ color: C.blanco, fontSize: 14 }}>{banda.texto}</Text>
            </View>
          </View>
          <Tarjeta><DetalleVisita v={v} /></Tarjeta>
          {est !== "pendiente" ? <Boton titulo={est === "autorizada" ? "Ir a mis órdenes" : "Volver"} icono={est === "autorizada" ? "car" : undefined} onPress={() => nav.reset("tecnico")} /> : null}
        </>
      )}
    </Pantalla>
  );
}
