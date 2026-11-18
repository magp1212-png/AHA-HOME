import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../api";
import { tomarFoto } from "../photo";
import { useSession } from "../session";
import type { Perfil } from "../types";
import { Aviso, Boton, C, Campo, Pantalla, Tarjeta, Texto } from "../ui";

/** Registro rápido del cliente: foto, cédula, teléfono y correo. Le llega un correo de verificación que dura 24 horas. */
export default function RegistroCliente() {
  const { entrar } = useSession();
  const [f, setF] = useState({ nombre: "", cedula: "", telefono: "", email: "", password: "" });
  const [foto, setFoto] = useState<{ uri: string; base64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function selfie() {
    setError(null);
    const r = await tomarFoto({ frontal: true });
    if (!r) return;
    if ("error" in r) setError(r.error); else setFoto(r);
  }

  async function enviar() {
    if (!foto) return;
    setError(null); setCargando(true);
    try {
      const r = await api<{ token: string; usuario: Perfil }>("/auth/registro", { body: { ...f, foto: foto.base64 } });
      await entrar(r.token, r.usuario);
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Crear cuenta" subtitulo="Registro rápido · 1 minuto">
      <Tarjeta style={{ alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tomar mi foto" onPress={selfie}
          style={{ width: 120, height: 120, borderRadius: 60, overflow: "hidden", backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center",
            borderWidth: 3, borderColor: foto ? C.lima : C.borde }}>
          {foto ? <Image source={{ uri: foto.uri }} style={{ width: 120, height: 120 }} /> : <Ionicons name="camera" size={40} color={C.marino} />}
        </Pressable>
        <Text onPress={selfie} style={{ fontWeight: "700", color: C.marino, paddingVertical: 10 }}>{foto ? "Repetir foto" : "Toca para tomar tu foto"}</Text>
      </Tarjeta>
      <Tarjeta>
        <Campo etiqueta="Nombre y apellido" value={f.nombre} onChangeText={set("nombre")} />
        <Campo etiqueta="Número de cédula" value={f.cedula} onChangeText={set("cedula")} placeholder="V-12.345.678" autoCapitalize="characters" />
        <Campo etiqueta="Teléfono" value={f.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" placeholder="0414 000 0000" />
        <Campo etiqueta="Correo" value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <Campo etiqueta="Contraseña (mínimo 6)" value={f.password} onChangeText={set("password")} secureTextEntry />
        <View style={{ backgroundColor: C.limaSuave, borderRadius: 12, padding: 12 }}>
          <Texto size={14}>Te enviaremos un correo para verificar tu cuenta. <Text style={{ fontWeight: "800" }}>Tienes 24 horas</Text>: si no lo verificas, tu registro se elimina.</Texto>
        </View>
        <Aviso texto={error} />
        <Boton titulo="Crear mi cuenta" onPress={enviar} cargando={cargando}
          deshabilitado={!foto || !f.nombre || !f.cedula || !f.telefono || !f.email.includes("@") || f.password.length < 6} />
      </Tarjeta>
      <Texto gris size={13}>Usa el mismo teléfono que diste en la caja de Damasco: al verificar tu correo verás tus pedidos.</Texto>
    </Pantalla>
  );
}
