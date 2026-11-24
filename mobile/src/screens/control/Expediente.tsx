import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";

import { api, fileUrl, subirFoto } from "../../api";
import { tomarFoto } from "../../photo";
import { Aviso, Boton, C, Campo, Cargando, Etiqueta, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

type Exp = {
  id: number; nombre: string; rol: string; cedula: string | null; telefono: string; email: string | null; tienda: string; grupo: string | null; jefe: string | null;
  foto_rostro: string | null; selfie_cedula: string | null; huella_registrada: boolean;
  verificacion_facial?: { resultado: string; similitud: number; similitud_cedula: number | null }; verificado: boolean; alta_en: string | null;
  documentos: { id: number; tipo: string; tipo_texto: string; url: string }[]; documentos_faltantes: string[]; tipos_documento: Record<string, string>;
  cuenta_pago: { banco: string; tipo: string; numero: string; titular: string; cedula: string; pago_movil_telefono: string; pago_movil_banco: string; registrada: boolean };
};

/** En la oficina: expediente completo (foto de perfil, cédula, licencia, vehículo, otros) y alta con el grupo. */
export default function Expediente({ id }: { id: number }) {
  const [e, setE] = useState<Exp | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cta, setCta] = useState({ banco: "", tipo: "", numero: "", titular: "", cedula: "", pago_movil_telefono: "", pago_movil_banco: "" });
  useEffect(() => { if (e?.cuenta_pago) { const { registrada, ...rest } = e.cuenta_pago; setCta(rest); } }, [e?.cuenta_pago?.numero, e?.cuenta_pago?.pago_movil_telefono]);

  async function guardarCuenta() {
    setError(null);
    try { await api(`/supervisor/tecnicos/${id}/cuenta-bancaria`, { method: "PUT", body: cta }); setMsg("Cuenta de pago guardada."); cargar(); } catch (x: any) { setError(x.message); }
  }

  const cargar = useCallback(() => { api<Exp>(`/supervisor/tecnicos/${id}/expediente`).then(setE).catch((x) => setError(x.message)); }, [id]);
  useEffect(cargar, [cargar]);

  async function agregar(tipo: string) {
    const r = await tomarFoto();
    if (!r) return;
    if ("error" in r) { setError(r.error); return; }
    setSubiendo(tipo);
    try { await api(`/supervisor/tecnicos/${id}/documentos`, { body: { tipo, url: await subirFoto(r.base64) } }); cargar(); } catch (x: any) { setError(x.message); }
    setSubiendo(null);
  }

  async function alta() {
    setError(null);
    try {
      await api(`/supervisor/tecnicos/${id}/alta`, { body: e?.rol === "ayudante" ? {} : { grupo } });
      setMsg("Alta lista. Ya puede recibir órdenes."); cargar();
    } catch (x: any) { setError(x.faltan ? `${x.message}: ${x.faltan.join(", ")}` : x.message); }
  }

  if (!e) return <Pantalla titulo="Expediente">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  const tienen = new Set(e.documentos.map((d) => d.tipo));
  return (
    <Pantalla titulo="Expediente" subtitulo={e.nombre}>
      <Tarjeta>
        <Texto negrita size={17}>{e.nombre} · {e.rol === "ayudante" ? "Ayudante" : "Técnico"}</Texto>
        <Texto gris size={14}>{e.cedula} · {e.telefono} · {e.email ?? "sin correo"} · {e.tienda}</Texto>
        {e.jefe ? <Texto gris size={14}>Sale con: {e.jefe}</Texto> : null}
        <Etiqueta texto={e.verificado ? `Alta · Grupo ${e.grupo}` : "Pendiente de alta"} tono={e.verificado ? "ok" : "alerta"} />
      </Tarjeta>
      <Tarjeta>
        <Seccion>REGISTRO EN LA APP</Seccion>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {e.foto_rostro ? <Image source={{ uri: fileUrl(e.foto_rostro) }} style={{ width: 100, height: 100, borderRadius: 12 }} /> : <Texto gris>Sin escaneo facial</Texto>}
          {e.selfie_cedula ? <Image source={{ uri: fileUrl(e.selfie_cedula) }} style={{ width: 100, height: 100, borderRadius: 12 }} /> : <Texto gris>Sin foto con cédula</Texto>}
        </View>
        <Texto>{e.huella_registrada ? "✓ Huella registrada" : "✗ Huella sin registrar"}</Texto>
        <Texto>{e.verificacion_facial?.resultado === "coincide" ? `✓ Verificación facial aprobada (la foto con la cédula y el escaneo son la misma persona · similitud ${e.verificacion_facial.similitud.toFixed(2)}${e.verificacion_facial.similitud_cedula ? ` · cédula ${e.verificacion_facial.similitud_cedula.toFixed(2)}` : ""})`
          : e.verificacion_facial?.resultado === "revision_manual" ? "⚠ Verificación facial: revisar a mano en la oficina"
          : e.verificacion_facial?.resultado === "no_coincide" ? "✗ Verificación facial: las caras no coinciden" : "Verificación facial pendiente"}</Texto>
      </Tarjeta>
      <Tarjeta>
        <Seccion>EXPEDIENTE EN OFICINA</Seccion>
        {Object.entries(e.tipos_documento).map(([tipo, texto]) => (
          <View key={tipo} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
            <Texto color={tienen.has(tipo) ? C.ok : C.gris}>{tienen.has(tipo) ? "✓" : "○"}</Texto>
            <View style={{ flex: 1 }}><Texto>{texto}{["foto_perfil", "cedula"].includes(tipo) ? " *" : ""}</Texto></View>
            <Boton titulo={subiendo === tipo ? "…" : tienen.has(tipo) ? "Otra" : "Foto"} tipo="secundario" onPress={() => agregar(tipo)} />
          </View>
        ))}
        <Texto gris size={12}>* Obligatorios para dar el alta.</Texto>
      </Tarjeta>
      {e.rol !== "ayudante" ? (
        <Tarjeta>
          <Seccion>DATOS BANCARIOS (PAGO DE SERVICIOS, MATERIALES Y PROPINAS)</Seccion>
          {e.cuenta_pago.registrada ? <Etiqueta texto="Cuenta registrada" tono="ok" /> : <Etiqueta texto="Obligatoria para el alta" tono="alerta" />}
          <Campo etiqueta="Banco" value={cta.banco} onChangeText={(v) => setCta({ ...cta, banco: v })} />
          <Fila>{["corriente", "ahorro"].map((x) => <Opcion key={x} texto={x === "corriente" ? "Corriente" : "Ahorro"} activo={cta.tipo === x} onPress={() => setCta({ ...cta, tipo: x })} />)}</Fila>
          <Campo etiqueta="Número de cuenta (20 dígitos)" value={cta.numero} onChangeText={(v) => setCta({ ...cta, numero: v })} keyboardType="number-pad" />
          <Campo etiqueta="Titular" value={cta.titular} onChangeText={(v) => setCta({ ...cta, titular: v })} />
          <Campo etiqueta="Cédula del titular" value={cta.cedula} onChangeText={(v) => setCta({ ...cta, cedula: v })} />
          <Campo etiqueta="Pago móvil: teléfono" value={cta.pago_movil_telefono} onChangeText={(v) => setCta({ ...cta, pago_movil_telefono: v })} keyboardType="phone-pad" />
          <Campo etiqueta="Pago móvil: banco" value={cta.pago_movil_banco} onChangeText={(v) => setCta({ ...cta, pago_movil_banco: v })} />
          <Boton titulo="Guardar datos bancarios" tipo="secundario" onPress={guardarCuenta} />
        </Tarjeta>
      ) : null}
      {!e.verificado ? (
        <Tarjeta>
          <Seccion>ALTA</Seccion>
          {e.rol !== "ayudante" ? <Fila>{["A", "B", "C", "RETEN"].map((g) => <Opcion key={g} texto={g === "RETEN" ? "Retén" : g} activo={grupo === g} onPress={() => setGrupo(g)} />)}</Fila>
            : <Texto gris>El ayudante toma el grupo de su técnico.</Texto>}
          <Boton titulo="Dar de alta ahora" onPress={alta} deshabilitado={e.rol !== "ayudante" && !grupo} />
        </Tarjeta>
      ) : null}
      <Aviso texto={error} />
      <Aviso texto={msg} tono="ok" />
    </Pantalla>
  );
}
