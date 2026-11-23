// Piezas compartidas: presupuesto, métodos de pago y propina.
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

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
      {Number(p.materiales) > 0 ? (
        <Text style={{ color: C.texto, fontWeight: "700" }}>
          Materiales: {p.materiales_compra === "cliente" ? "los compra el cliente" : "los compra el técnico"}
        </Text>
      ) : null}
      <Text style={{ color: C.gris }}>
        Materiales USD {p.materiales_compra === "cliente" ? `0.00 (referencia ${p.materiales})` : p.materiales} · Mano de obra USD {p.mano_obra}
        {Number(p.inspeccion) > 0 ? ` · Inspección USD ${p.inspeccion}` : ""}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "900", color: C.texto }}>Total a pagar USD {p.a_pagar}</Text>
      {p.notas ? <Texto gris size={14}>Nota del técnico: {p.notas}</Texto> : null}
      {p.motivo_rechazo ? <Aviso texto={`Rechazado por ${p.motivo_rechazo}`} /> : null}
      <Text style={{ fontSize: 12, color: C.gris }}>
        Cliente: {p.cliente_acepto ? "✓ aceptó" : "pendiente"} · Superadmin: {p.admin_aprobo ? "✓ aprobó" : "pendiente"}
      </Text>
    </View>
  );
}

/** ¿Quién compra los materiales? (técnico: van en el pago; cliente: solo paga la mano de obra). */
export function QuienCompra({ valor, onCambiar, paraTecnico }: { valor: "tecnico" | "cliente"; onCambiar: (v: "tecnico" | "cliente") => void; paraTecnico?: boolean }) {
  const ops: ["tecnico" | "cliente", string, string][] = paraTecnico
    ? [["tecnico", "Los compro yo (técnico)", "AHA HOME me los paga a mi cuenta registrada."],
       ["cliente", "Los compra el cliente", "Se le envía la lista y solo paga la mano de obra."]]
    : [["tecnico", "Los compra el técnico", "Incluidos en tu pago. AHA HOME se los paga al técnico."],
       ["cliente", "Los compro yo", "Tú los compras y los tienes listos el día de la instalación."]];
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: "800", color: C.texto }}>¿Quién compra los materiales?</Text>
      {ops.map(([k, t, d]) => {
        const on = valor === k;
        return (
          <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onCambiar(k)}
            style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", borderRadius: 12, padding: 10, minHeight: 44,
              borderWidth: on ? 2 : 1, borderColor: on ? C.marino : C.borde, backgroundColor: on ? C.limaSuave : C.blanco }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.marino, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.marino }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: C.texto }}>{t}</Text>
              <Text style={{ fontSize: 13, color: C.gris }}>{d}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Elegir método de pago y referencia (la referencia no hace falta en efectivo). */
export function FormPago({ titulo, boton, onEnviar, conMonto, onOmitir }: {
  titulo: string; boton: string; conMonto?: boolean; onEnviar: (d: { metodo: string; referencia: string; monto?: number }) => Promise<void>;
  onOmitir?: () => void;
}) {
  const metodos = useMetodosPago();
  const [metodo, setMetodo] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [monto, setMonto] = useState<number | null>(null);
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
      <Boton titulo={boton} tipo={conMonto ? "exito" : "principal"} onPress={enviar} cargando={cargando}
        deshabilitado={!metodo || (!efectivo && ref.trim().length < 2) || (!!conMonto && !(valor && valor > 0))} />
      {onOmitir ? <Boton titulo="Ahora no, gracias" tipo="secundario" onPress={onOmitir} /> : null}
    </View>
  );
}

/** Vista del cliente: pedir inspección, ver y aceptar el presupuesto, pagarlo. */
export function InspeccionCliente({ o, recargar }: { o: any; recargar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const p: Presupuesto | null = o.presupuesto;
  const [compra, setCompra] = useState<"tecnico" | "cliente">(p?.materiales_compra ?? "tecnico");
  useEffect(() => { if (p) setCompra(p.materiales_compra); }, [p?.id, p?.materiales_compra]);
  const hayMateriales = !!p && Number(p.materiales) > 0;
  const aPagar = p ? (compra === "cliente" && hayMateriales ? (Number(p.mano_obra) + Number(p.inspeccion ?? 0)).toFixed(2) : p.total) : "0";
  const listaCompra = p ? p.items.filter((i) => i.tipo === "material").map((i) => `${i.cantidad} × ${i.descripcion}`).join(", ") : "";
  const antes = ["solicitud_enviada", "tecnico_asignado", "cita_confirmada"].includes(o.estado);
  const hacer = async (ruta: string, body: any) => { setError(null); try { await api(ruta, { body }); recargar(); } catch (e: any) { setError(e.message); } };

  if (!o.inspeccion.requerida) {
    if (!antes || !o.articulos.some((a: any) => a.instalar)) return null;
    return (
      <Tarjeta>
        <Texto negrita>¿Quieres que el técnico revise antes?</Texto>
        <Texto gris size={14}>Te visita, revisa dónde va el equipo y te da un presupuesto de materiales e instalación antes de retirar tu compra.</Texto>
        <Texto negrita size={14}>Costo de la inspección: USD {o.inspeccion.costo} (se suma al pago del presupuesto).</Texto>
        <Boton titulo="Solicitar inspección" tipo="secundario" icono="search" onPress={() => hacer(`/ordenes/${o.id}/inspeccion`, {})} />
        <Aviso texto={error} />
      </Tarjeta>
    );
  }
  return (
    <Tarjeta>
      <Seccion>INSPECCIÓN Y PRESUPUESTO</Seccion>
      <Texto gris size={14}>Visita: {o.inspeccion.fecha} · {o.inspeccion.franja}</Texto>
      <Texto gris size={14}>
        Costo de la inspección: USD {o.inspeccion.costo}{o.inspeccion.pagada_en_tienda ? " · ✓ pagada en la tienda" : " · se suma al pago del presupuesto"}
      </Texto>
      {!p ? <Aviso tono="info" texto="El técnico te visitará y te enviará el presupuesto aquí." /> : <DetallePresupuesto p={p} />}
      {p?.estado === "enviado" && !p.cliente_acepto ? (
        <View style={{ gap: 10 }}>
          {hayMateriales ? <QuienCompra valor={compra} onCambiar={setCompra} /> : null}
          <Text style={{ fontSize: 18, fontWeight: "900", color: C.texto }}>Total a pagar USD {aPagar}</Text>
          <Boton titulo="Aceptar presupuesto" tipo="naranja" onPress={() => hacer(`/ordenes/${o.id}/presupuesto/responder`, { acepta: true, materiales_compra: compra })} />
          <Boton titulo="Rechazar" tipo="secundario" onPress={() => hacer(`/ordenes/${o.id}/presupuesto/responder`, { acepta: false, motivo: "No lo acepto" })} />
        </View>
      ) : null}
      {p && p.materiales_compra === "cliente" && hayMateriales && p.estado !== "rechazado" && p.cliente_acepto ? (
        <Aviso tono="info" texto={`Lista para comprar: ${listaCompra} (precio de referencia USD ${p.materiales}). Tenlos listos antes de la cita.`} />
      ) : null}
      {p?.estado === "enviado" && p.cliente_acepto ? <Aviso tono="info" texto="Aceptaste. Falta la aprobación de AHA HOME." /> : null}
      {p?.estado === "aprobado" ? (
        <FormPago titulo={`PAGAR USD ${p.a_pagar}`} boton={`Pagar USD ${p.a_pagar}`}
          onEnviar={async (d) => { await api(`/ordenes/${o.id}/presupuesto/pago`, { body: d }); recargar(); }} />
      ) : null}
      <Aviso texto={error} />
    </Tarjeta>
  );
}
