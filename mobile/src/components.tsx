import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
// Piezas compartidas: presupuesto, métodos de pago y las dos monedas (USD y Bs a tasa oficial BCV).
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "./api";
import type { Presupuesto } from "./types";
import { Avatar, Aviso, Boton, C, Campo, Etiqueta, Fila, Opcion, Seccion, Tarjeta, Texto } from "./ui";

export function useMetodosPago() {
  const [m, setM] = useState<{ id: string; texto: string }[]>([]);
  useEffect(() => { api<{ id: string; texto: string }[]>("/metodos-pago").then(setM).catch(() => {}); }, []);
  return m;
}

// ---- Dos monedas ----
export type Tasa = { bs_por_usd: string | null; fecha: string | null; fuente: string };
export const METODOS_BS = ["pago_movil", "efectivo_bs", "punto_de_venta"];
export const monedaDe = (metodo?: string | null) => (!metodo ? "" : METODOS_BS.includes(metodo) ? "Bs" : "USD");
/** Formato venezolano: 1.234,56 */
export const fmtBs = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const aBs = (usd: number, tasa: Tasa | null) => (tasa?.bs_por_usd ? Math.round(usd * Number(tasa.bs_por_usd) * 100) / 100 : null);

export function useTasa() {
  const [t, setT] = useState<Tasa | null>(null);
  const cargar = () => api<Tasa>("/tasa").then(setT).catch(() => {});
  // la tasa que cargue el superadmin llega sola a la caja (se revisa cada 30 s)
  useEffect(() => { cargar(); const i = setInterval(cargar, 30000); return () => clearInterval(i); }, []);
  return { tasa: t, recargar: cargar };
}

/** «USD 10,00 · Bs 2.500,00» */
export function MontoDual({ usd, tasa, size = 15, negrita, moneda = "USD" }: { usd: number; tasa: Tasa | null; size?: number; negrita?: boolean; moneda?: Moneda }) {
  const bs = aBs(usd, tasa);
  const principal = moneda === "Bs" && bs !== null ? `Bs ${fmtBs(bs)}` : `USD ${fmtBs(usd)}`;
  const otra = moneda === "Bs" && bs !== null ? `USD ${fmtBs(usd)}` : bs !== null ? `Bs ${fmtBs(bs)}` : null;
  return (
    <Text style={{ fontSize: size, fontWeight: negrita ? "900" : "700", color: C.texto }}>
      {principal}{otra ? <Text style={{ color: C.gris, fontWeight: "700", fontSize: size - 2 }}>  ·  {otra}</Text> : null}
    </Text>
  );
}

export type Moneda = "Bs" | "USD";
const CLAVE_MONEDA = "ahahome.caja.moneda";
/** Moneda en la que la caja le muestra los precios al cliente (se recuerda en el equipo de la caja). */
export function useMonedaCaja(): [Moneda, (m: Moneda) => void] {
  const [m, setM] = useState<Moneda>("Bs");
  useEffect(() => { AsyncStorage.getItem(CLAVE_MONEDA).then((v) => { if (v === "Bs" || v === "USD") setM(v); }).catch(() => {}); }, []);
  const cambiar = (v: Moneda) => { setM(v); AsyncStorage.setItem(CLAVE_MONEDA, v).catch(() => {}); };
  return [m, cambiar];
}

/** Selector grande [ Bs | $ ]: cambia todos los precios de la pantalla al instante. */
export function MonedaToggle({ moneda, onCambiar, tasa }: { moneda: Moneda; onCambiar: (m: Moneda) => void; tasa: Tasa | null }) {
  const sinTasa = !tasa?.bs_por_usd;
  return (
    <View style={{ gap: 6 }}>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: "#EEF2F7", borderRadius: 16, padding: 4 }}>
        {([["Bs", "Bs  Bolívares"], ["USD", "$  Dólares"]] as const).map(([k, t]) => {
          const on = (sinTasa ? "USD" : moneda) === k;
          return (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: k === "Bs" && sinTasa }} disabled={k === "Bs" && sinTasa}
              onPress={() => onCambiar(k)} style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
                backgroundColor: on ? C.marino : "transparent", opacity: k === "Bs" && sinTasa ? 0.4 : 1 }}>
              <Text style={{ fontWeight: "900", fontSize: 16, color: on ? C.lima : C.marino }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ fontSize: 12.5, color: C.gris, textAlign: "center" }}>
        {sinTasa ? "Sin tasa del día: solo dólares (el superadmin debe cargar la tasa BCV)." : `Tasa oficial BCV: Bs ${fmtBs(Number(tasa!.bs_por_usd))} por USD · ${tasa!.fecha}`}
      </Text>
    </View>
  );
}

export type PrecioCaja = { id: number; clave: string; nombre: string; categoria: string; tipo_equipo: string; traslado: string | null; instalacion: string | null; combo: string | null };
export type ServicioArt = "traslado" | "instalacion" | "combo";

/** Tabulación de precios del superadmin, la que usa la caja para cobrar. */
export function usePreciosCaja() {
  const [r, setR] = useState<{ inspeccion: number; items: PrecioCaja[] }>({ inspeccion: 10, items: [] });
  useEffect(() => {
    // lo que el superadmin cambie en la tabulación se ve en la caja en menos de un minuto, sin cerrar la app
    const cargar = () => api<{ inspeccion: string; items: PrecioCaja[] }>("/caja/precios").then((x) => setR({ inspeccion: Number(x.inspeccion), items: x.items })).catch(() => {});
    cargar();
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, []);
  return r;
}

/** Precio (USD) de un artículo según el servicio; null = por definir. */
export function precioDe(p: PrecioCaja | undefined, servicio: ServicioArt): number | null {
  const v = p ? p[servicio] : null;
  return v && Number(v) > 0 ? Number(v) : null;
}

/** Inicio de la caja: tasa del día, tabulación de precios y calculadora, en la moneda que pida el cliente. */
export function PreciosCaja() {
  const { tasa } = useTasa();
  const [moneda, setMoneda] = useMonedaCaja();
  const { inspeccion, items } = usePreciosCaja();
  const [monto, setMonto] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const mon: Moneda = tasa?.bs_por_usd ? moneda : "USD";
  const m = useMoneda(mon, tasa);
  const ver = (v: string | null) => (v && Number(v) > 0 ? m(Number(v)) : "—");
  const valor = Number(monto.replace(/\./g, "").replace(",", ".")) || 0;
  const conv = mon === "Bs" ? (tasa?.bs_por_usd ? valor / Number(tasa.bs_por_usd) : null) : aBs(valor, tasa);
  const categorias = [...new Set(items.map((i) => i.categoria))];
  const conPrecio = items.some((i) => precioDe(i, "traslado") || precioDe(i, "instalacion") || precioDe(i, "combo"));
  return (
    <Tarjeta>
      <Seccion>PRECIOS · ¿EN QUÉ MONEDA LO PIDE EL CLIENTE?</Seccion>
      <MonedaToggle moneda={moneda} onCambiar={setMoneda} tasa={tasa} />
      <Fila><Texto>Inspección del técnico</Texto><View style={{ flex: 1 }} /><Texto negrita>{m(inspeccion)}</Texto></Fila>
      {!conPrecio ? <Texto gris size={13}>Traslado e instalación: precios por definir. El superadmin los carga en la tabulación de precios.</Texto> : null}
      <View style={{ flexDirection: "row", paddingTop: 4 }}>
        <View style={{ flex: 1.6 }}><Texto gris size={12}>Artículo</Texto></View>
        {["Traslado", "Instalación", "Ambos"].map((t) => <Text key={t} style={{ flex: 1, textAlign: "right", fontSize: 12, color: C.gris }}>{t}</Text>)}
      </View>
      {categorias.map((cat) => (
        <View key={cat} style={{ gap: 4 }}>
          <Pressable onPress={() => setAbierto(abierto === cat ? null : cat)} style={{ flexDirection: "row", alignItems: "center", minHeight: 36 }}>
            <View style={{ flex: 1 }}><Texto negrita size={14}>{cat}</Texto></View><Texto gris>{abierto === cat ? "▲" : "▼"}</Texto>
          </Pressable>
          {abierto === cat ? items.filter((i) => i.categoria === cat).map((i) => (
            <View key={i.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3 }}>
              <View style={{ flex: 1.6 }}><Texto size={13}>{i.nombre}</Texto></View>
              {[i.traslado, i.instalacion, i.combo].map((v, k) => <Text key={k} style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: "700", color: C.texto }}>{ver(v)}</Text>)}
            </View>
          )) : null}
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: C.linea }} />
      <Texto negrita size={14}>Calculadora</Texto>
      <Campo etiqueta={mon === "Bs" ? "Monto en bolívares" : "Monto en dólares"} value={monto} onChangeText={setMonto} keyboardType="decimal-pad" />
      {valor > 0 && conv !== null ? (
        <Text style={{ fontSize: 22, fontWeight: "900", color: C.marino }}>= {mon === "Bs" ? `USD ${fmtBs(conv)}` : `Bs ${fmtBs(conv)}`}</Text>
      ) : null}
    </Tarjeta>
  );
}

/** Formatea un monto en USD en la moneda elegida. */
export function useMoneda(moneda: Moneda, tasa: Tasa | null) {
  return (usd: number) => (moneda === "Bs" && tasa?.bs_por_usd ? `Bs ${fmtBs(aBs(usd, tasa)!)}` : `USD ${fmtBs(usd)}`);
}

export type InfoPago = { metodo: string | null; metodo_texto: string; moneda: string; monto_usd: string; monto_bs: string | null; tasa: string | null; cobrado: string | null; referencia?: string; pagado_en?: string | null };

/** Cómo se pagó: lo ven el cliente, la caja, la cuadrilla y el centro de control. */
export function PagoServicio({ pago, titulo = "PAGO DEL SERVICIO", donde }: { pago: InfoPago; titulo?: string; donde?: string }) {
  if (!pago.metodo) return null;
  const enBs = pago.moneda === "Bs";
  return (
    <View style={{ gap: 6, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12, backgroundColor: "#F7F9FC" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Seccion>{titulo}</Seccion>
        <Etiqueta texto={enBs ? "BOLÍVARES" : "DÓLARES"} tono={enBs ? "lima" : "ok"} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: "900", color: C.texto }}>
        {enBs && pago.monto_bs ? `Bs ${fmtBs(Number(pago.monto_bs))}` : `USD ${fmtBs(Number(pago.monto_usd))}`}
      </Text>
      <Text style={{ color: C.gris, fontSize: 13 }}>
        {enBs ? `Equivale a USD ${fmtBs(Number(pago.monto_usd))} · tasa oficial BCV Bs ${fmtBs(Number(pago.tasa))} por USD`
          : pago.monto_bs ? `Referencia en bolívares: Bs ${fmtBs(Number(pago.monto_bs))} (tasa BCV ${fmtBs(Number(pago.tasa))})` : "Pagado en dólares"}
      </Text>
      <Text style={{ color: C.texto, fontSize: 14, fontWeight: "700" }}>
        {pago.metodo_texto}{donde ? ` · ${donde}` : ""}{pago.referencia ? ` · ref. ${pago.referencia}` : ""}
      </Text>
    </View>
  );
}

/** Tasa oficial del día. El superadmin la actualiza; los demás la ven. */
export function TasaDelDia({ editable }: { editable?: boolean }) {
  const { tasa, recargar } = useTasa();
  const [valor, setValor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function guardar() {
    setMsg(null);
    try { await api("/admin/tasa", { method: "PUT", body: { bs_por_usd: Number(valor.replace(/\./g, "").replace(",", ".")) } }); setValor(""); recargar(); setMsg("Tasa actualizada."); }
    catch (e: any) { setMsg(e.message); }
  }
  return (
    <Tarjeta>
      <Seccion>TASA OFICIAL BCV DEL DÍA</Seccion>
      <Text style={{ fontSize: 22, fontWeight: "900", color: C.texto }}>
        {tasa?.bs_por_usd ? `Bs ${fmtBs(Number(tasa.bs_por_usd))} por USD` : "Sin cargar"}
      </Text>
      <Texto gris size={13}>{tasa?.fecha ? `Del ${tasa.fecha} · fuente ${tasa.fuente}` : "Sin tasa no se puede cobrar en bolívares."}</Texto>
      {editable ? (
        <>
          <Campo etiqueta="Nueva tasa (Bs por USD)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
          <Boton titulo="Guardar tasa del día" tipo="lima" onPress={guardar} deshabilitado={!(Number(valor.replace(/\./g, "").replace(",", ".")) > 0)} />
          {msg ? <Aviso tono={msg.startsWith("Tasa") ? "ok" : "error"} texto={msg} /> : null}
        </>
      ) : null}
    </Tarjeta>
  );
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
      {(p as any).pago?.metodo ? <PagoServicio pago={(p as any).pago} titulo="PAGO DEL PRESUPUESTO" /> : null}
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
export function FormPago({ titulo, boton, onEnviar, conMonto, onOmitir, usd }: {
  titulo: string; boton: string; conMonto?: boolean; onEnviar: (d: { metodo: string; referencia: string; monto?: number }) => Promise<void>;
  onOmitir?: () => void; usd?: number;
}) {
  const metodos = useMetodosPago();
  const { tasa } = useTasa();
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
      {metodo && usd ? (
        <Aviso tono="info" texto={monedaDe(metodo) === "Bs"
          ? (tasa?.bs_por_usd ? `Pagas Bs ${fmtBs(aBs(usd, tasa)!)} (USD ${fmtBs(usd)} a la tasa oficial BCV de Bs ${fmtBs(Number(tasa.bs_por_usd))})` : "Falta la tasa oficial del día para pagar en bolívares.")
          : `Pagas USD ${fmtBs(usd)} en dólares.`} />
      ) : null}
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
        <FormPago titulo={`PAGAR USD ${p.a_pagar}`} boton="Registrar pago" usd={Number(p.a_pagar)}
          onEnviar={async (d) => { await api(`/ordenes/${o.id}/presupuesto/pago`, { body: d }); recargar(); }} />
      ) : null}
      <Aviso texto={error} />
    </Tarjeta>
  );
}


// ---- Retiro en tienda con el QR de la tienda ----
export type Visita = {
  id: number; estado: "pendiente" | "autorizada" | "rechazada" | "cancelada"; motivo: string; creado: string; resuelto_en: string | null;
  tienda: { id: number; nombre: string };
  tecnico: { nombre: string; cedula: string; foto: string | null; grupo: string } ;
  ayudantes: { nombre: string; cedula: string; foto: string | null }[];
  ordenes: { id: number; codigo: string; tipo_servicio: string; tipo_servicio_texto: string; retiro: string; cliente: string; zona: string; inmueble: string;
    fecha: string; franja: string; numero_factura: string; articulos: { nombre: string; modelo: string; serial: string; instalar: boolean }[] }[];
  total_articulos: number;
};

/** Toda la información del retiro: la ve el técnico en su pantalla y la caja para autorizar. */
export function DetalleVisita({ v }: { v: Visita }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar nombre={v.tecnico.nombre} foto={v.tecnico.foto} size={58} borde={C.lima} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "900", fontSize: 17, color: C.texto }}>{v.tecnico.nombre}</Text>
          <Text style={{ color: C.gris, fontSize: 13 }}>Técnico · C.I. {v.tecnico.cedula} · Grupo {v.tecnico.grupo}</Text>
          {v.ayudantes.map((a) => <Text key={a.cedula} style={{ color: C.gris, fontSize: 13 }}>Ayudante: {a.nombre} · C.I. {a.cedula}</Text>)}
        </View>
      </View>
      <Text style={{ fontWeight: "800", color: C.texto }}>{v.tienda.nombre} · {v.ordenes.length} orden(es) · {v.total_articulos} artículo(s)</Text>
      {v.ordenes.map((o) => (
        <View key={o.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12, gap: 4, backgroundColor: "#F7F9FC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <Text style={{ fontWeight: "900", color: C.texto, fontSize: 15 }}>{o.codigo}</Text>
            <Etiqueta texto={o.retiro.toUpperCase()} tono={o.tipo_servicio === "traslado" ? "neutro" : "lima"} />
          </View>
          <Text style={{ color: C.gris, fontSize: 13 }}>Cliente: {o.cliente}{o.inmueble ? ` · ${o.inmueble}` : ""} · zona {o.zona} · cita {o.fecha} {o.franja}{o.numero_factura ? ` · factura ${o.numero_factura}` : ""}</Text>
          {o.articulos.map((a, k) => (
            <Text key={k} style={{ color: C.texto, fontSize: 14 }}>
              • <Text style={{ fontWeight: "800" }}>{a.nombre}{a.modelo ? ` ${a.modelo}` : ""}</Text>{a.serial ? ` · serial ${a.serial}` : ""} — {a.instalar ? "para instalar" : "en su caja"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Caja: técnicos que escanearon el QR de la tienda y esperan el OK. */
export function VisitasPendientes({ onCambio }: { onCambio?: () => void }) {
  const [vs, setVs] = useState<Visita[]>([]);
  const [motivo, setMotivo] = useState<Record<number, string>>({});
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = async () => { try { setVs(await api<Visita[]>("/caja/visitas")); } catch (e: any) { setError(e.message); } };
  useEffect(() => { cargar(); const t = setInterval(cargar, 6000); return () => clearInterval(t); }, []);
  const hacer = async (ruta: string, body?: any) => {
    setError(null);
    try { await api(ruta, { body: body ?? {} }); setRechazando(null); await cargar(); onCambio?.(); } catch (e: any) { setError(e.message); }
  };
  if (!vs.length && !error) return null;
  return (
    <View style={{ gap: 10 }}>
      {vs.map((v) => (
        <View key={v.id} style={{ backgroundColor: C.blanco, borderRadius: 18, borderWidth: 3, borderColor: C.naranja, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="notifications" size={22} color={C.naranja} />
            <Text style={{ flex: 1, fontWeight: "900", color: C.naranja, fontSize: 15 }}>TÉCNICO EN CAJA · ESPERA TU OK PARA RETIRAR</Text>
          </View>
          <DetalleVisita v={v} />
          {rechazando === v.id ? (
            <>
              <Campo etiqueta="Motivo (lo verá el técnico)" value={motivo[v.id] ?? ""} onChangeText={(t) => setMotivo({ ...motivo, [v.id]: t })} />
              <Boton titulo="Confirmar: no autorizar" tipo="peligro" deshabilitado={(motivo[v.id] ?? "").trim().length < 3}
                onPress={() => hacer(`/caja/visitas/${v.id}/rechazar`, { motivo: motivo[v.id] })} />
              <Boton titulo="Volver" tipo="secundario" onPress={() => setRechazando(null)} />
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Boton titulo="No autorizar" tipo="secundario" onPress={() => setRechazando(v.id)} /></View>
              <View style={{ flex: 1.4 }}><Boton titulo="OK, autorizar retiro" tipo="exito" icono="checkmark-circle" onPress={() => hacer(`/caja/visitas/${v.id}/autorizar`)} /></View>
            </View>
          )}
        </View>
      ))}
      <Aviso texto={error} />
    </View>
  );
}
