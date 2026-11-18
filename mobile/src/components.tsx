// Piezas compartidas: presupuesto, métodos de pago y propina.
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "./api";
import type { Presupuesto } from "./types";
import { Aviso, Boton, C, Campo, Etiqueta, Fila, Opcion, Seccion, Tarjeta, Texto } from "./ui";

export function useMetodosPago() {
  const [m, setM] = useState<{ id: string; texto: string }[]>([]);
  useEffect(() => { api<{ id: string; texto: string }[]>("/metodos-pago").then(setM).catch(() => {}); }, []);
  return m;
}

export function DetallePresupuesto({ p }: { p: Presupuesto }) {
  const tono = p.estado === "materiales_pagados" ? "ok" : p.estado === "rechazado" ? "error" : "alerta";
  return (
    <View style={{ gap: 8 }}>
      <Etiqueta texto={p.estado_texto} tono={tono} />
      {p.items.map((i, k) => (
        <View key={k} style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ flex: 1, color: C.texto }}>
            {i.cantidad} × {i.descripcion} <Text style={{ color: C.gris, fontSize: 12 }}>({i.tipo === "material" ? "material" : "mano de obra"})</Text>
          </Text>
          <Text style={{ fontWeight: "700", color: C.texto }}>USD {i.subtotal}</Text>
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: C.linea }} />
      <Text style={{ color: C.gris }}>Materiales USD {p.materiales} · Mano de obra USD {p.mano_obra}</Text>
      <Text style={{ fontSize: 20, fontWeight: "900", color: C.texto }}>Total USD {p.total}</Text>
      {p.notas ? <Texto gris size={14}>Nota del técnico: {p.notas}</Texto> : null}
      {p.motivo_rechazo ? <Aviso texto={`Rechazado por ${p.motivo_rechazo}`} /> : null}
      <Text style={{ fontSize: 12, color: C.gris }}>
        Cliente: {p.cliente_acepto ? "✓ aceptó" : "pendiente"} · Superadmin: {p.admin_aprobo ? "✓ aprobó" : "pendiente"}
      </Text>
    </View>
  );
}

/** Elegir método de pago y referencia (la referencia no hace falta en efectivo). */
export function FormPago({ titulo, boton, onEnviar, conMonto }: {
  titulo: string; boton: string; conMonto?: boolean; onEnviar: (d: { metodo: string; referencia: string; monto?: number }) => Promise<void>;
}) {
  const metodos = useMetodosPago();
  const [metodo, setMetodo] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [monto, setMonto] = useState<number | null>(conMonto ? 5 : null);
  const [otro, setOtro] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const efectivo = !!metodo?.startsWith("efectivo");
  const valor = conMonto ? (otro ? Number(otro.replace(",", ".")) : monto) : undefined;

  async function enviar() {
    if (!metodo) return;
    setCargando(true); setError(null);
    try { await onEnviar({ metodo, referencia: ref, monto: valor ?? undefined }); } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <View style={{ gap: 10 }}>
      <Seccion>{titulo}</Seccion>
      {conMonto ? (
        <>
          <Fila wrap>{[2, 5, 10, 20].map((m) => <Opcion key={m} texto={`USD ${m}`} activo={!otro && monto === m} onPress={() => { setOtro(""); setMonto(m); }} />)}</Fila>
          <Campo etiqueta="Otro monto (USD)" value={otro} onChangeText={setOtro} keyboardType="decimal-pad" />
        </>
      ) : null}
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.texto }}>¿Cómo vas a pagar?</Text>
      <Fila wrap>{metodos.map((m) => <Opcion key={m.id} texto={m.texto} activo={metodo === m.id} onPress={() => setMetodo(m.id)} />)}</Fila>
      {metodo && !efectivo ? <Campo etiqueta="Referencia del pago" value={ref} onChangeText={setRef} /> : null}
      {efectivo && conMonto ? <Aviso tono="info" texto="Entrégala en mano a la cuadrilla." /> : null}
      <Aviso texto={error} />
      <Boton titulo={boton} onPress={enviar} cargando={cargando}
        deshabilitado={!metodo || (!efectivo && ref.trim().length < 2) || (!!conMonto && !(valor && valor > 0))} />
    </View>
  );
}

/** Vista del cliente: pedir inspección, ver y aceptar el presupuesto, pagarlo. */
export function InspeccionCliente({ o, recargar }: { o: any; recargar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const p: Presupuesto | null = o.presupuesto;
  const antes = ["solicitud_enviada", "tecnico_asignado", "cita_confirmada"].includes(o.estado);
  const hacer = async (ruta: string, body: any) => { setError(null); try { await api(ruta, { body }); recargar(); } catch (e: any) { setError(e.message); } };

  if (!o.inspeccion.requerida) {
    if (!antes || !o.articulos.some((a: any) => a.instalar)) return null;
    return (
      <Tarjeta>
        <Texto negrita>¿Quieres que el técnico revise antes?</Texto>
        <Texto gris size={14}>Te visita, revisa dónde va el equipo y te da un presupuesto de materiales e instalación antes de retirar tu compra.</Texto>
        <Boton titulo="Solicitar inspección" tipo="secundario" icono="search" onPress={() => hacer(`/ordenes/${o.id}/inspeccion`, {})} />
        <Aviso texto={error} />
      </Tarjeta>
    );
  }
  return (
    <Tarjeta>
      <Seccion>INSPECCIÓN Y PRESUPUESTO</Seccion>
      <Texto gris size={14}>Visita: {o.inspeccion.fecha} · {o.inspeccion.franja}</Texto>
      {!p ? <Aviso tono="info" texto="El técnico te visitará y te enviará el presupuesto aquí." /> : <DetallePresupuesto p={p} />}
      {p?.estado === "enviado" && !p.cliente_acepto ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Boton titulo="Aceptar" tipo="exito" onPress={() => hacer(`/ordenes/${o.id}/presupuesto/responder`, { acepta: true })} /></View>
          <View style={{ flex: 1 }}><Boton titulo="Rechazar" tipo="peligro" onPress={() => hacer(`/ordenes/${o.id}/presupuesto/responder`, { acepta: false, motivo: "No lo acepto" })} /></View>
        </View>
      ) : null}
      {p?.estado === "enviado" && p.cliente_acepto ? <Aviso tono="info" texto="Aceptaste. Falta la aprobación de AHA HOME." /> : null}
      {p?.estado === "aprobado" ? (
        <FormPago titulo={`PAGAR USD ${p.total}`} boton="Registrar mi pago"
          onEnviar={async (d) => { await api(`/ordenes/${o.id}/presupuesto/pago`, { body: d }); recargar(); }} />
      ) : null}
      <Aviso texto={error} />
    </Tarjeta>
  );
}
