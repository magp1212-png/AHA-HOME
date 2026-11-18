import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";

import { api, subirFoto } from "../../api";
import { tomarFoto } from "../../photo";
import type { Persona } from "../../types";
import { Aviso, Avatar, Boton, C, Campo, Etiqueta, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

/** El técnico anota a sus ayudantes con foto y nombre; la oficina completa su registro y les da el alta. */
export default function Ayudantes() {
  const [lista, setLista] = useState<(Persona & { alta: boolean })[]>([]);
  const [f, setF] = useState({ nombre: "", cedula: "", telefono: "" });
  const [foto, setFoto] = useState<{ uri: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => { api<(Persona & { alta: boolean })[]>("/tecnico/ayudantes").then(setLista).catch((e) => setError(e.message)); }, []);
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
    if (!foto) return;
    setCargando(true); setError(null);
    try {
      await api("/tecnico/ayudantes", { body: { nombre: f.nombre, cedula: f.cedula, telefono: f.telefono || null, foto: foto.url } });
      setF({ nombre: "", cedula: "", telefono: "" }); setFoto(null); cargar();
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Mis ayudantes">
      {lista.map((a) => (
        <Tarjeta key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar nombre={a.nombre} foto={a.foto} size={52} />
          <View style={{ flex: 1, gap: 4 }}>
            <Texto negrita>{a.nombre}</Texto>
            <Texto gris size={13}>{a.cedula}</Texto>
            <Etiqueta texto={a.alta ? "Alta lista: sale contigo" : "Pendiente de registro en la oficina"} tono={a.alta ? "ok" : "alerta"} />
          </View>
        </Tarjeta>
      ))}
      <Tarjeta>
        <Seccion>AGREGAR AYUDANTE</Seccion>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {foto ? <Image source={{ uri: foto.uri }} style={{ width: 72, height: 72, borderRadius: 36 }} /> :
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.limaSuave }} />}
          <View style={{ flex: 1 }}><Boton titulo={foto ? "Repetir foto" : "Tomar su foto"} tipo="secundario" icono="camera" onPress={tomar} /></View>
        </View>
        <Campo etiqueta="Nombre y apellido" value={f.nombre} onChangeText={(v) => setF({ ...f, nombre: v })} />
        <Campo etiqueta="Cédula" value={f.cedula} onChangeText={(v) => setF({ ...f, cedula: v })} autoCapitalize="characters" />
        <Campo etiqueta="Teléfono (opcional)" value={f.telefono} onChangeText={(v) => setF({ ...f, telefono: v })} keyboardType="phone-pad" />
        <Aviso texto={error} />
        <Boton titulo="Agregar ayudante" onPress={guardar} cargando={cargando} deshabilitado={!foto || !f.nombre || !f.cedula} />
        <Texto gris size={13}>Saldrá en tus órdenes cuando la oficina complete su registro.</Texto>
      </Tarjeta>
    </Pantalla>
  );
}
