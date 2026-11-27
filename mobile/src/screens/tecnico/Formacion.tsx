import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";

import { api, subirFoto } from "../../api";
import { tomarFoto } from "../../photo";
import { useSession } from "../../session";
import { Aviso, Boton, C, Campo, Etiqueta, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

type Item = { id: number; codigo: string; tipo: string; tipo_texto: string; nombre: string; institucion: string; anio: string; area: string; area_texto: string; url: string };
const VACIO = { tipo: "curso", area: "general", nombre: "", institucion: "", anio: "" };

/** El profesional sube sus títulos y cursos (con foto del certificado) para la base interna de AHA HOME. */
export default function Formacion() {
  const { perfil } = useSession();
  const tec: any = (perfil as any)?.tecnico || {};
  const [lista, setLista] = useState<Item[]>([]);
  const [f, setF] = useState(VACIO);
  const [foto, setFoto] = useState<{ uri: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => { api<Item[]>("/tecnico/formacion").then(setLista).catch((e) => setError(e.message)); }, []);
  useEffect(cargar, [cargar]);

  async function tomar() {
    const r = await tomarFoto();
    if (!r) return;
    if ("error" in r) { setError(r.error); return; }
    setCargando(true);
    try { setFoto({ uri: r.uri, url: await subirFoto(r.base64) }); } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  async function guardar() {
    setCargando(true); setError(null);
    try {
      await api("/tecnico/formacion", { body: { ...f, url: foto?.url || "" } });
      setF(VACIO); setFoto(null); cargar();
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  async function quitar(id: number) {
    try { await api(`/tecnico/formacion/${id}`, { method: "DELETE" }); cargar(); } catch (e: any) { setError(e.message); }
  }

  const areas: [string, string][] = [["general", "General"], ...(tec.conduce !== false ? [["conductor", "Conductor"] as [string, string]] : []),
    ...(tec.instala !== false ? [["instalador", "Técnico instalador"] as [string, string]] : [])];

  return (
    <Pantalla titulo="Mis títulos y cursos" subtitulo="Para conocer tu preparación">
      {lista.map((x) => (
        <Tarjeta key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {x.url ? <Image source={{ uri: x.url }} style={{ width: 52, height: 52, borderRadius: 10 }} /> :
            <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}><Texto size={22}>{x.tipo === "titulo" ? "🎓" : "📜"}</Texto></View>}
          <View style={{ flex: 1, gap: 3 }}>
            <Texto negrita>{x.nombre}</Texto>
            <Texto gris size={13}>{[x.tipo_texto, x.institucion, x.anio].filter(Boolean).join(" · ")}</Texto>
            <Etiqueta texto={x.area_texto} />
          </View>
          <Pressable onPress={() => quitar(x.id)} hitSlop={10}><Texto color="#E5484D" size={13}>Quitar</Texto></Pressable>
        </Tarjeta>
      ))}
      <Tarjeta>
        <Seccion>AGREGAR</Seccion>
        <Fila><Opcion texto="Curso" activo={f.tipo === "curso"} onPress={() => setF({ ...f, tipo: "curso" })} />
          <Opcion texto="Título" activo={f.tipo === "titulo"} onPress={() => setF({ ...f, tipo: "titulo" })} /></Fila>
        <Campo etiqueta={f.tipo === "titulo" ? "Nombre del título" : "Nombre del curso"} value={f.nombre} onChangeText={(v) => setF({ ...f, nombre: v })} />
        <Campo etiqueta="Institución" value={f.institucion} onChangeText={(v) => setF({ ...f, institucion: v })} />
        <Campo etiqueta="Año" value={f.anio} onChangeText={(v) => setF({ ...f, anio: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={4} />
        <Texto gris size={13}>¿Para qué módulo?</Texto>
        <Fila wrap>{areas.map(([k, t]) => <Opcion key={k} texto={t} activo={f.area === k} onPress={() => setF({ ...f, area: k })} />)}</Fila>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {foto ? <Image source={{ uri: foto.uri }} style={{ width: 64, height: 64, borderRadius: 10 }} /> : null}
          <View style={{ flex: 1 }}><Boton titulo={foto ? "Repetir foto" : "Foto del certificado"} tipo="secundario" icono="camera" onPress={tomar} /></View>
        </View>
        <Aviso texto={error} />
        <Boton titulo="Agregar" onPress={guardar} cargando={cargando} deshabilitado={f.nombre.trim().length < 3 || (f.anio !== "" && f.anio.length !== 4)} />
      </Tarjeta>
    </Pantalla>
  );
}
