import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { api } from "../../api";
import type { Orden } from "../../types";
import { PagoServicio } from "../../components";
import { Aviso, Boton, Cargando, Etiqueta, Pantalla, QR, Seccion, Tarjeta, Texto, tonoEstado } from "../../ui";

/** Detalle de la orden en caja: el QR de retiro para el almacén, la cuadrilla y los artículos. */
export default function OrdenCaja({ id }: { id: number }) {
  const [o, setO] = useState<Orden | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Orden>(`/ordenes/${id}`).then(setO).catch((e) => setError(e.message)); }, [id]);

  async function cancelar() {
    try { setO(await api<Orden>(`/ordenes/${id}/cancelar`, { body: { motivo: "Cancelada en caja" } })); } catch (e: any) { setError(e.message); }
  }

  if (!o) return <Pantalla titulo="Orden">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  return (
    <Pantalla titulo={o.codigo} subtitulo={o.tipo_servicio_texto}>
      <Etiqueta texto={o.estado_texto} tono={tonoEstado(o.estado)} />
      {o.qr ? (
        <Tarjeta style={{ alignItems: "center" }}>
          <Seccion>QR DE RETIRO EN ALMACÉN</Seccion>
          <QR valor={o.qr} size={230} />
          <Texto gris size={13}>El técnico asignado lo escanea en el área de despacho.</Texto>
        </Tarjeta>
      ) : <Aviso tono="info" texto="Solo instalación: no hay retiro en almacén." />}
      <Tarjeta>
        <Seccion>CUADRILLA</Seccion>
        {o.tecnico ? (
          <View style={{ gap: 4 }}>
            <Texto negrita>{o.tecnico.nombre} · Grupo {o.tecnico.grupo}</Texto>
            {o.ayudantes.map((a) => <Texto key={a.nombre} gris>Ayudante: {a.nombre}</Texto>)}
          </View>
        ) : <Aviso texto="Sin técnico de guardia disponible: el supervisor ya fue avisado." />}
      </Tarjeta>
      <Tarjeta>
        <Seccion>CLIENTE Y ARTÍCULOS</Seccion>
        <Texto negrita>{o.cliente.nombre} · {o.cliente.telefono}</Texto>
        <Texto gris>{o.cliente.tipo_inmueble_texto ? `${o.cliente.tipo_inmueble_texto} · ` : ""}{o.cliente.direccion}</Texto>
        {o.articulos.map((a) => <Texto key={a.id}>• {a.nombre} {a.modelo} {a.instalar ? "— con instalación" : "— en su caja"}</Texto>)}
        <Texto gris>Cita: {o.fecha} · {o.franja}</Texto>
        {o.pago_instalacion.pagado ? <PagoServicio pago={o.pago_instalacion as any} titulo="COBRADO EN CAJA" donde="pagado en la tienda" />
          : <Texto gris>Instalación: {o.pago_instalacion.precio_por_definir ? "precio por definir" : "no aplica"}</Texto>}
      </Tarjeta>
      <Aviso texto={error} />
      {["solicitud_enviada", "tecnico_asignado", "cita_confirmada"].includes(o.estado) ? <Boton titulo="Cancelar orden" tipo="peligro" onPress={cancelar} /> : null}
    </Pantalla>
  );
}
