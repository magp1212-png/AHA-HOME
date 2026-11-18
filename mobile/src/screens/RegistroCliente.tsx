import React, { useState } from "react";

import { api } from "../api";
import { useSession } from "../session";
import type { Perfil } from "../types";
import { Aviso, Boton, Campo, Pantalla, Tarjeta, Texto } from "../ui";

export default function RegistroCliente() {
  const { entrar } = useSession();
  const [f, setF] = useState({ nombre: "", telefono: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function enviar() {
    setError(null); setCargando(true);
    try {
      const r = await api<{ token: string; usuario: Perfil }>("/auth/registro", { body: { ...f, email: f.email || null } });
      await entrar(r.token, r.usuario);
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Crear cuenta" subtitulo="Cliente">
      <Texto gris size={14}>Usa el mismo teléfono que diste en la caja de Damasco: así verás tus pedidos al entrar.</Texto>
      <Tarjeta>
        <Campo etiqueta="Nombre y apellido" value={f.nombre} onChangeText={set("nombre")} />
        <Campo etiqueta="Teléfono" value={f.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" placeholder="0414 000 0000" />
        <Campo etiqueta="Correo (opcional)" value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <Campo etiqueta="Contraseña (mínimo 6)" value={f.password} onChangeText={set("password")} secureTextEntry />
        <Aviso texto={error} />
        <Boton titulo="Crear mi cuenta" onPress={enviar} cargando={cargando} deshabilitado={!f.nombre || !f.telefono || f.password.length < 6} />
      </Tarjeta>
    </Pantalla>
  );
}
