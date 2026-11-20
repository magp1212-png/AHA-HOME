import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "../../api";
import MapaReal from "../../MapaReal";
import { MenuTecnico } from "../../menus";
import { Aviso, Boton, C, Cargando, Pantalla, Tarjeta } from "../../ui";
import { MiniMapa, navegarA, type Hoy } from "./InicioTecnico";

/** Pestaña «Mapa» del técnico: su ruta de hoy, parada por parada, con navegación. */
export default function MapaTecnico() {
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try { setHoy(await api<Hoy>("/tecnico/hoy")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const lista = hoy ? [...(hoy.orden_activa ? [hoy.orden_activa] : []), ...hoy.pendientes] : [];
  return (
    <Pantalla titulo="Mi ruta de hoy" subtitulo={hoy?.tienda} onRefresh={cargar} abajo={<MenuTecnico activo="mapa" />}>
      <Aviso texto={error} />
      {!hoy ? <Cargando /> : lista.length === 0 ? <Aviso tono="info" texto="No tienes paradas pendientes hoy." /> : null}
      {lista.length ? (
        <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.linea }}>
          <MapaReal alto={300} puntos={[
            ...(lista[0].tienda.lat && lista[0].tienda.lng ? [{ lat: lista[0].tienda.lat!, lng: lista[0].tienda.lng!, tipo: "tienda" as const, titulo: lista[0].tienda.nombre, destacado: true }] : []),
            ...lista.filter((o) => o.cliente.lat && o.cliente.lng).map((o, i) => ({ lat: o.cliente.lat!, lng: o.cliente.lng!, tipo: "casa" as const,
              titulo: `${i + 1}. ${o.codigo} · ${o.franja}`, detalle: o.cliente.direccion })),
          ]} rutas={lista.filter((o) => o.cliente.lat && o.cliente.lng && o.tienda.lat && o.tienda.lng).slice(0, 1)
            .map((o) => ({ desde: [o.tienda.lat!, o.tienda.lng!] as [number, number], hasta: [o.cliente.lat!, o.cliente.lng!] as [number, number] }))} />
        </View>
      ) : null}
      {lista.map((o, i) => (
        <Tarjeta key={o.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: i === 0 ? C.naranja : C.marino, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: C.blanco, fontWeight: "900" }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: C.texto }}>{o.codigo} · {o.franja.replace("-", " – ")}</Text>
              <Text style={{ color: C.gris, fontSize: 13 }}>{o.cliente.direccion}</Text>
            </View>
            <MiniMapa onPress={() => navegarA(o, false)} />
          </View>
          {o.con_retiro_en_tienda && ["tecnico_asignado", "cita_confirmada"].includes(o.estado) ? (
            <Boton titulo={`Retiro: ${o.tienda.nombre}`} tipo="secundario" icono="storefront-outline" onPress={() => navegarA(o, true)} />
          ) : null}
          <Boton titulo="NAVEGAR AL CLIENTE" tipo="naranja" icono="navigate" onPress={() => navegarA(o, false)} />
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
