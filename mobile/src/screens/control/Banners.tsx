import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, Switch, Text, View } from "react-native";

import { api, fileUrl, subirFoto } from "../../api";
import { tomarFoto } from "../../photo";
import { Aviso, Boton, C, Campo, Cargando, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";
import { COLOR_BANNER, TarjetaAliado, type Banner } from "../cliente/InicioActivo";

type BannerAdmin = Banner & { activo: boolean; orden: number; desde: string; hasta: string; clics: number };
const VACIO: Omit<BannerAdmin, "id" | "clics"> = { tipo: "aliado", etiqueta: "ALIADO", titulo: "", texto: "", boton: "VER OFERTA", enlace: "",
  imagen: null, color: "lima", activo: true, orden: 0, desde: "", hasta: "" };

/** Superadmin: banners del inicio del cliente (mensajes de AHA HOME y publicidad de aliados), sin actualizar la app. */
export default function Banners() {
  const [lista, setLista] = useState<BannerAdmin[] | null>(null);
  const [edit, setEdit] = useState<(Partial<BannerAdmin> & typeof VACIO) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    try { setLista(await api<BannerAdmin[]>("/admin/banners")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    if (!edit) return;
    setCargando(true); setError(null);
    try {
      await api(edit.id ? `/admin/banners/${edit.id}` : "/admin/banners", { method: edit.id ? "PUT" : "POST", body: edit });
      setEdit(null); await cargar();
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }
  async function activar(b: BannerAdmin, activo: boolean) {
    try { await api(`/admin/banners/${b.id}`, { method: "PUT", body: { ...b, activo } }); await cargar(); } catch (e: any) { setError(e.message); }
  }
  async function borrar(id: number) {
    try { await api(`/admin/banners/${id}`, { method: "DELETE" }); setEdit(null); await cargar(); } catch (e: any) { setError(e.message); }
  }
  async function logo() {
    const r = await tomarFoto({ galeria: true });
    if (!r || "error" in r || !edit) return;
    try { setEdit({ ...edit, imagen: await subirFoto(r.base64) }); } catch (e: any) { setError(e.message); }
  }

  if (edit) {
    const set = (k: keyof BannerAdmin) => (v: any) => setEdit({ ...edit, [k]: v });
    return (
      <Pantalla titulo={edit.id ? "Editar banner" : "Nuevo banner"} pie={<Boton titulo="Guardar" onPress={guardar} cargando={cargando} deshabilitado={edit.titulo.trim().length < 2} />}>
        <Seccion>VISTA PREVIA</Seccion>
        {edit.tipo === "aliado" ? <TarjetaAliado a={{ ...(edit as any), id: 0 }} ancho={330} /> : (
          <View style={{ borderRadius: 22, backgroundColor: C.marino, padding: 14 }}>
            <Text style={{ color: C.lima, fontWeight: "900", fontSize: 16 }}>{edit.titulo || "Título"}</Text>
            <Text style={{ color: "#DCDEF0" }}>{edit.texto}</Text>
          </View>
        )}
        <Tarjeta>
          <Seccion>TIPO</Seccion>
          <Fila><Opcion texto="Aliado (publicidad)" activo={edit.tipo === "aliado"} onPress={() => set("tipo")("aliado")} />
            <Opcion texto="Mensaje de AHA HOME" activo={edit.tipo === "aha"} onPress={() => set("tipo")("aha")} /></Fila>
          {edit.tipo === "aliado" ? <Campo etiqueta="Etiqueta (arriba, en mayúsculas)" value={edit.etiqueta} onChangeText={set("etiqueta")} /> : null}
          <Campo etiqueta="Título" value={edit.titulo} onChangeText={set("titulo")} />
          <Campo etiqueta="Texto" value={edit.texto} onChangeText={set("texto")} />
          {edit.tipo === "aliado" ? <Campo etiqueta="Texto del botón" value={edit.boton} onChangeText={set("boton")} /> : null}
          <Campo etiqueta="Enlace al tocarlo (https://…)" value={edit.enlace} onChangeText={set("enlace")} autoCapitalize="none" keyboardType="url" />
          {edit.tipo === "aliado" ? (
            <>
              <Seccion>COLOR</Seccion>
              <Fila wrap>{(Object.keys(COLOR_BANNER) as Banner["color"][]).map((c) => (
                <Pressable key={c} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ checked: edit.color === c }} onPress={() => set("color")(c)}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLOR_BANNER[c].fondo, borderWidth: edit.color === c ? 4 : 1, borderColor: edit.color === c ? C.marino : C.borde }} />
              ))}</Fila>
              <Boton titulo={edit.imagen ? "Cambiar logo del aliado" : "Subir logo del aliado"} tipo="secundario" icono="image-outline" onPress={logo} />
            </>
          ) : null}
          <Fila>
            <View style={{ flex: 1 }}><Campo etiqueta="Desde (AAAA-MM-DD)" value={edit.desde} onChangeText={set("desde")} placeholder="siempre" /></View>
            <View style={{ flex: 1 }}><Campo etiqueta="Hasta (AAAA-MM-DD)" value={edit.hasta} onChangeText={set("hasta")} placeholder="siempre" /></View>
          </Fila>
          <Campo etiqueta="Orden (menor sale primero)" value={String(edit.orden)} onChangeText={(v) => set("orden")(Number(v) || 0)} keyboardType="number-pad" />
        </Tarjeta>
        <Aviso texto={error} />
        <Boton titulo="Cancelar" tipo="secundario" onPress={() => setEdit(null)} />
        {edit.id ? <Boton titulo="Eliminar banner" tipo="peligro" onPress={() => borrar(edit.id!)} /> : null}
      </Pantalla>
    );
  }

  const grupo = (t: "aha" | "aliado") => (lista ?? []).filter((b) => b.tipo === t);
  const Fila_ = ({ b }: { b: BannerAdmin }) => (
    <Tarjeta style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
      <View style={{ width: 46, height: 46, borderRadius: 12, overflow: "hidden", backgroundColor: COLOR_BANNER[b.color]?.fondo ?? C.lima, alignItems: "center", justifyContent: "center" }}>
        {b.imagen ? <Image source={{ uri: fileUrl(b.imagen) ?? undefined }} style={{ width: 46, height: 46 }} resizeMode="contain" /> : null}
      </View>
      <Pressable style={{ flex: 1 }} onPress={() => setEdit(b)} accessibilityRole="button" accessibilityLabel={`Editar ${b.titulo}`}>
        <Text style={{ fontWeight: "800", color: C.texto }}>{b.titulo}</Text>
        <Text style={{ color: C.gris, fontSize: 12.5 }}>{b.clics} toques{b.desde || b.hasta ? ` · ${b.desde || "…"} → ${b.hasta || "…"}` : ""}{b.enlace ? " · con enlace" : ""}</Text>
      </Pressable>
      <Switch value={b.activo} onValueChange={(v) => activar(b, v)} accessibilityLabel={`Mostrar ${b.titulo}`} />
    </Tarjeta>
  );
  return (
    <Pantalla titulo="Banners y aliados" subtitulo="Inicio del cliente" onRefresh={cargar}>
      <Texto gris size={14}>Lo que cambies aquí se ve en el inicio de todos los clientes, sin actualizar la app. Toca un banner para editarlo.</Texto>
      <Boton titulo="Nuevo banner de aliado" tipo="lima" icono="add-circle-outline" onPress={() => setEdit({ ...VACIO })} />
      <Aviso texto={error} />
      {lista === null ? <Cargando /> : null}
      <Seccion>ALIANZAS Y BENEFICIOS ({grupo("aliado").length})</Seccion>
      {grupo("aliado").map((b) => <Fila_ key={b.id} b={b} />)}
      <Seccion>MENSAJES DE AHA HOME ({grupo("aha").length})</Seccion>
      {grupo("aha").map((b) => <Fila_ key={b.id} b={b} />)}
      <Boton titulo="Nuevo mensaje de AHA HOME" tipo="secundario" icono="megaphone-outline" onPress={() => setEdit({ ...VACIO, tipo: "aha", etiqueta: "", boton: "", color: "marino" })} />
    </Pantalla>
  );
}
