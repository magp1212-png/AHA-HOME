import React, { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";

import { api } from "../../api";
import { MenuTecnico } from "../../menus";
import { Aviso, C, Cargando, Pantalla, Seccion } from "../../ui";
import { FilaPendiente, type Hoy } from "./InicioTecnico";

/** Pestaña «Órdenes» del técnico: todas las de hoy, en orden de hora. */
export default function OrdenesTecnico() {
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try { setHoy(await api<Hoy>("/tecnico/hoy")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const lista = hoy ? [...(hoy.orden_activa ? [hoy.orden_activa] : []), ...hoy.pendientes] : [];
  return (
    <Pantalla titulo="Mis órdenes" subtitulo={hoy ? `Hoy ${hoy.fecha}` : undefined} onRefresh={cargar} abajo={<MenuTecnico activo="ordenes" />}>
      <Aviso texto={error} />
      {!hoy ? <Cargando /> : (
        <>
          <Seccion>POR HACER ({lista.length})</Seccion>
          {lista.length ? lista.map((o) => <FilaPendiente key={o.id} o={o} />) : <Aviso tono="info" texto="No tienes órdenes pendientes hoy." />}
          <Text style={{ color: C.gris }}>Completadas hoy: {hoy.completadas}</Text>
        </>
      )}
    </Pantalla>
  );
}
