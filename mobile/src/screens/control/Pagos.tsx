import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "../../api";
import { DetallePresupuesto } from "../../components";
import { useSession } from "../../session";
import type { CuentaPago, Presupuesto } from "../../types";
import { Aviso, Boton, C, Campo, Cargando, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

type Penalidad = { orden_id: number; codigo: string; cliente: string; tecnico: string | null; estado: string; motivo: string;
                  monto: string; por_definir: boolean; metodo: string | null; referencia: string };
type Propina = { orden_id: number; codigo: string; monto: string; metodo: string; referencia: string; tecnico: string | null; cuenta_tecnico: CuentaPago | null };

function Cuenta({ c }: { c?: CuentaPago | null }) {
  if (!c) return null;
  return (
    <View style={{ backgroundColor: C.limaSuave, borderRadius: 10, padding: 10 }}>
      <Text style={{ fontWeight: "800", color: C.marino }}>Cuenta del técnico</Text>
      {c.numero ? <Text style={{ color: C.texto }}>{c.banco} · {c.tipo} · {c.numero} · {c.titular} · {c.cedula}</Text> : null}
      {c.pago_movil_telefono ? <Text style={{ color: C.texto }}>Pago móvil: {c.pago_movil_banco} · {c.pago_movil_telefono} · {c.cedula}</Text> : null}
      {!c.registrada ? <Text style={{ color: C.error }}>Sin cuenta registrada</Text> : null}
    </View>
  );
}

/** Centro de control: presupuestos por aprobar, pagos por confirmar, materiales y propinas por pagar al técnico. */
export default function Pagos() {
  const { perfil } = useSession();
  const esSuper = perfil?.rol === "superadmin";
  const [ps, setPs] = useState<Presupuesto[] | null>(null);
  const [props, setProps] = useState<Propina[]>([]);
  const [pens, setPens] = useState<Penalidad[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setPs(await api<Presupuesto[]>("/supervisor/presupuestos"));
      setPens(await api<Penalidad[]>("/supervisor/penalidades"));
      if (perfil?.rol !== "tecnico_supervisor") setProps(await api<Propina[]>("/supervisor/propinas-pendientes"));
      setError(null);
    } catch (e: any) { setError(e.message); }
  }, [perfil?.rol]);
  useEffect(() => { cargar(); }, [cargar]);

  async function hacer(ruta: string, body: any = {}) {
    setError(null);
    try { await api(ruta, { body }); await cargar(); } catch (e: any) { setError(e.message); }
  }

  const grupo = (estado: string) => (ps ?? []).filter((p) => p.estado === estado);
  const ref = (k: string) => refs[k] ?? "";
  const setRef = (k: string) => (v: string) => setRefs({ ...refs, [k]: v });

  return (
    <Pantalla titulo="Presupuestos y pagos" onRefresh={cargar}>
      <Aviso texto={error} />
      {ps === null ? <Cargando /> : null}

      <Seccion>POR APROBAR ({grupo("enviado").length})</Seccion>
      {grupo("enviado").map((p) => (
        <Tarjeta key={p.id}>
          <Texto negrita>{p.codigo} · {p.cliente} · técnico {p.tecnico}</Texto>
          <DetallePresupuesto p={p} />
          {esSuper && !p.admin_aprobo ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Boton titulo="Aprobar" tipo="exito" onPress={() => hacer(`/supervisor/presupuestos/${p.id}/aprobar`, { acepta: true })} /></View>
              <View style={{ flex: 1 }}><Boton titulo="Rechazar" tipo="peligro" onPress={() => hacer(`/supervisor/presupuestos/${p.id}/aprobar`, { acepta: false, motivo: "Revisar precios" })} /></View>
            </View>
          ) : !esSuper ? <Texto gris size={13}>Lo aprueba el superadministrador.</Texto> : null}
        </Tarjeta>
      ))}

      <Seccion>PAGOS DEL CLIENTE POR CONFIRMAR ({grupo("pago_registrado").length})</Seccion>
      {grupo("pago_registrado").map((p) => (
        <Tarjeta key={p.id}>
          <Texto negrita>{p.codigo} · USD {p.a_pagar} · {p.pago.metodo} · ref. {p.pago.referencia}</Texto>
          {p.materiales_compra === "cliente" && Number(p.materiales) > 0 ? <Texto gris size={13}>Materiales a cargo del cliente: al confirmar, queda listo para instalar.</Texto> : null}
          {perfil?.rol !== "tecnico_supervisor" ? <Boton titulo="Confirmar que llegó el pago" onPress={() => hacer(`/supervisor/presupuestos/${p.id}/confirmar-pago`)} /> : null}
        </Tarjeta>
      ))}

      <Seccion>MATERIALES POR PAGAR AL TÉCNICO ({grupo("pagado").length})</Seccion>
      {grupo("pagado").map((p) => (
        <Tarjeta key={p.id}>
          <Texto negrita>{p.codigo} · {p.tecnico} · materiales USD {p.materiales}</Texto>
          <Cuenta c={p.cuenta_tecnico} />
          {esSuper ? (
            <>
              <Campo etiqueta="Referencia de la transferencia" value={ref(`m${p.id}`)} onChangeText={setRef(`m${p.id}`)} />
              <Boton titulo="Materiales pagados: autorizar instalación" tipo="exito" deshabilitado={ref(`m${p.id}`).trim().length < 2}
                onPress={() => hacer(`/supervisor/presupuestos/${p.id}/pagar-materiales`, { referencia: ref(`m${p.id}`) })} />
            </>
          ) : <Texto gris size={13}>Lo paga el superadministrador.</Texto>}
        </Tarjeta>
      ))}

      {props.length ? <Seccion>PROPINAS POR TRANSFERIR AL TÉCNICO ({props.length})</Seccion> : null}
      {props.map((p) => (
        <Tarjeta key={p.orden_id}>
          <Texto negrita>{p.codigo} · {p.tecnico} · USD {p.monto} ({p.metodo}, ref. {p.referencia})</Texto>
          <Cuenta c={p.cuenta_tecnico} />
          {esSuper ? (
            <>
              <Campo etiqueta="Referencia de la transferencia" value={ref(`p${p.orden_id}`)} onChangeText={setRef(`p${p.orden_id}`)} />
              <Boton titulo="Propina transferida" deshabilitado={ref(`p${p.orden_id}`).trim().length < 2}
                onPress={() => hacer(`/supervisor/ordenes/${p.orden_id}/propina-entregada`, { referencia: ref(`p${p.orden_id}`) })} />
            </>
          ) : null}
        </Tarjeta>
      ))}

      {pens.length ? <Seccion>PENALIDADES POR ENTREGA FALLIDA ({pens.length})</Seccion> : null}
      {pens.map((x) => (
        <Tarjeta key={x.orden_id}>
          <Texto negrita>{x.codigo} · {x.cliente} · {x.tecnico ?? ""}</Texto>
          <Texto gris size={13}>{x.motivo} · {x.estado === "pago_registrado" ? `pagó USD ${x.monto} por ${x.metodo} ${x.referencia}` : x.por_definir ? "monto por definir" : `USD ${x.monto} por cobrar`}</Texto>
          {perfil?.rol !== "tecnico_supervisor" ? (
            x.estado === "pago_registrado" ? <Boton titulo="Confirmar pago de la penalidad" onPress={() => hacer(`/supervisor/ordenes/${x.orden_id}/penalidad/confirmar`)} /> : (
              <>
                <Campo etiqueta="Monto del servicio completo (USD)" value={ref(`pen${x.orden_id}`)} onChangeText={setRef(`pen${x.orden_id}`)} keyboardType="decimal-pad" />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Boton titulo="Fijar monto" deshabilitado={!(Number(ref(`pen${x.orden_id}`).replace(",", ".")) > 0)}
                    onPress={() => hacer(`/supervisor/ordenes/${x.orden_id}/penalidad/monto`, { monto: Number(ref(`pen${x.orden_id}`).replace(",", ".")) })} /></View>
                  <View style={{ flex: 1 }}><Boton titulo="Exonerar" tipo="secundario" onPress={() => hacer(`/supervisor/ordenes/${x.orden_id}/penalidad/monto`, { monto: 0 })} /></View>
                </View>
              </>
            )
          ) : null}
        </Tarjeta>
      ))}

      <Seccion>LISTOS PARA INSTALAR ({grupo("materiales_pagados").length})</Seccion>
      {grupo("materiales_pagados").slice(0, 10).map((p) => (
        <Texto key={p.id} gris>{p.codigo} · {p.tecnico} · USD {p.a_pagar}{p.materiales_compra === "cliente" && Number(p.materiales) > 0 ? " · materiales los compra el cliente" : ""}</Texto>
      ))}
    </Pantalla>
  );
}
