import React, { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { api, ApiError, fileUrl, subirFoto } from "../../api";
import { useNav } from "../../nav";
import { tomarFoto } from "../../photo";
import type { Orden } from "../../types";
import { Aviso, Boton, C, Cargando, Casilla, Pantalla, RESIDUOS, Seccion, Tarjeta, TEXTO_CHECK, TEXTO_FOTO } from "../../ui";

/** Checklist digital obligatorio según el tipo de servicio, fotos de evidencia y cierre. */
export default function Checklist({ id }: { id: number }) {
  const nav = useNav();
  const [o, setO] = useState<Orden | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => { api<Orden>(`/ordenes/${id}`).then(setO).catch((e) => setError(e.message)); }, [id]);

  async function marcar(k: string) {
    if (!o) return;
    try { setO(await api<Orden>(`/tecnico/ordenes/${id}/checklist`, { method: "PUT", body: { items: { [k]: !o.checklist[k] } } })); }
    catch (e: any) { setError(e.message); }
  }

  async function foto(k: string) {
    setError(null);
    const r = await tomarFoto();
    if (!r) return;
    if ("error" in r) { setError(r.error); return; }
    setSubiendo(k);
    try {
      const url = await subirFoto(r.base64);
      setO(await api<Orden>(`/tecnico/ordenes/${id}/fotos`, { method: "PUT", body: { fotos: { [k]: url } } }));
    } catch (e: any) { setError(e.message); }
    setSubiendo(null);
  }

  async function cerrar() {
    setCerrando(true); setError(null);
    try { await api(`/tecnico/ordenes/${id}/completar`, { body: {} }); nav.back(); }
    catch (e: any) { setError(e instanceof ApiError && e.faltan ? `${e.message}: faltan ${e.faltan.length} punto(s).` : e.message); }
    setCerrando(false);
  }

  if (!o) return <Pantalla titulo="Checklist">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  const req = o.checklist_requerido;
  const entrega = req.filter((k) => ["entrega_en_empaque_original", "ubicado_en_sitio"].includes(k));
  const inst = req.filter((k) => !entrega.includes(k) && !RESIDUOS.includes(k));
  const res = req.filter((k) => RESIDUOS.includes(k));
  const hechos = req.filter((k) => o.checklist[k]).length + o.fotos_requeridas.filter((k) => o.fotos[k]).length;
  const total = req.length + o.fotos_requeridas.length;

  return (
    <Pantalla titulo={`Checklist · ${o.codigo}`} subtitulo={`${hechos} de ${total} · ${o.tipo_servicio_texto}`}
      pie={<Boton titulo="Completar orden" tipo="exito" onPress={cerrar} cargando={cerrando} deshabilitado={hechos < total} />}>
      {entrega.length ? (
        <Tarjeta>
          <Seccion>ENTREGA EN SU CAJA</Seccion>
          {entrega.map((k) => <Casilla key={k} texto={TEXTO_CHECK[k] ?? k} marcado={!!o.checklist[k]} onPress={() => marcar(k)} />)}
        </Tarjeta>
      ) : null}
      {inst.length ? (
        <Tarjeta>
          <Seccion>INSTALACIÓN</Seccion>
          {inst.map((k) => <Casilla key={k} texto={TEXTO_CHECK[k] ?? k} marcado={!!o.checklist[k]} onPress={() => marcar(k)} />)}
        </Tarjeta>
      ) : null}
      {res.length ? (
        <Tarjeta>
          <Seccion color={C.alerta}>RETIRO DE RESIDUOS · OBLIGATORIO</Seccion>
          {res.map((k) => <Casilla key={k} texto={TEXTO_CHECK[k] ?? k} marcado={!!o.checklist[k]} onPress={() => marcar(k)} tono="obligatorio" />)}
        </Tarjeta>
      ) : null}
      <Tarjeta>
        <Seccion>EVIDENCIA FOTOGRÁFICA</Seccion>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {o.fotos_requeridas.map((k) => (
            <Pressable key={k} onPress={() => foto(k)} style={{ flexBasis: "47%", flexGrow: 1, height: 120, borderRadius: 14, overflow: "hidden",
              borderWidth: 2, borderStyle: o.fotos[k] ? "solid" : "dashed", borderColor: o.fotos[k] ? C.ok : "#9EB3CC", alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
              {o.fotos[k] ? <Image source={{ uri: fileUrl(o.fotos[k]) }} style={{ position: "absolute", width: "100%", height: "100%" }} /> : null}
              <View style={{ backgroundColor: o.fotos[k] ? "rgba(22,122,69,0.9)" : "transparent", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontWeight: "800", color: o.fotos[k] ? C.blanco : C.gris, fontSize: 13 }}>{subiendo === k ? "Subiendo…" : TEXTO_FOTO[k] ?? k}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Tarjeta>
      <Aviso texto={error} />
    </Pantalla>
  );
}
