import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";

import { api, subirFoto } from "../../api";
import { tomarFoto } from "../../photo";
import type { Persona } from "../../types";
import { Aviso, Avatar, Boton, C, Campo, Casilla, Etiqueta, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

const CLAUSULA = "Declaro que esta persona es parte de mi equipo de trabajo y que queda bajo mi responsabilidad mientras me acompaña " +
  "en los servicios de AHA HOME: su conducta, el trato con los clientes y el cuidado de los artículos.";
const VACIO = { nombre: "", telefono: "", email: "", cedula: "" };

/** El profesional registra a sus ayudantes (nombre completo, teléfono, correo y foto de perfil). Cada ayudante queda bajo
 *  su responsabilidad como parte de su equipo; la oficina completa la verificación y le da el alta. */
export default function Ayudantes() {
  const [lista, setLista] = useState<(Persona & { alta: boolean })[]>([]);
  const [f, setF] = useState(VACIO);
  const [acepta, setAcepta] = useState(false);
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
      await api("/tecnico/ayudantes", { body: { nombre: f.nombre, telefono: f.telefono, email: f.email, cedula: f.cedula || null, foto: foto.url, acepta_clausula: acepta } });
      setF(VACIO); setFoto(null); setAcepta(false); cargar();
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
            {a.cedula ? <Texto gris size={13}>{a.cedula}</Texto> : null}
            <Etiqueta texto={a.alta ? "Alta lista: sale contigo" : "Pendiente de registro en la oficina"} tono={a.alta ? "ok" : "alerta"} />
          </View>
        </Tarjeta>
      ))}
      <Tarjeta>
        <Seccion>AGREGAR AYUDANTE</Seccion>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {foto ? <Image source={{ uri: foto.uri }} style={{ width: 72, height: 72, borderRadius: 36 }} /> :
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.limaSuave }} />}
          <View style={{ flex: 1 }}><Boton titulo={foto ? "Repetir foto" : "Tomar su foto de perfil"} tipo="secundario" icono="camera" onPress={tomar} /></View>
        </View>
        <Campo etiqueta="Nombre completo" value={f.nombre} onChangeText={(v) => setF({ ...f, nombre: v })} />
        <Campo etiqueta="Teléfono" value={f.telefono} onChangeText={(v) => setF({ ...f, telefono: v })} keyboardType="phone-pad" />
        <Campo etiqueta="Correo electrónico" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Campo etiqueta="Cédula (opcional, la completa la oficina)" value={f.cedula} onChangeText={(v) => setF({ ...f, cedula: v })} autoCapitalize="characters" />
        <View style={{ borderRadius: 12, padding: 12, backgroundColor: C.limaSuave, gap: 8 }}>
          <Texto negrita size={14}>Responsabilidad sobre tu equipo</Texto>
          <Texto size={13}>{CLAUSULA}</Texto>
          <Casilla texto="Acepto: este ayudante queda bajo mi responsabilidad" marcado={acepta} onPress={() => setAcepta(!acepta)} tono="obligatorio" />
        </View>
        <Aviso texto={error} />
        <Boton titulo="Registrar ayudante" onPress={guardar} cargando={cargando}
          deshabilitado={!foto || f.nombre.trim().length < 3 || f.telefono.length < 7 || !f.email.includes("@") || !acepta} />
        <Texto gris size={13}>Saldrá en tus órdenes cuando la oficina complete su verificación.</Texto>
      </Tarjeta>
    </Pantalla>
  );
}
