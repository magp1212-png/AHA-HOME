import React, { useState } from "react";

import { api } from "../api";
import { useNav } from "../nav";
import { useSession } from "../session";
import type { Perfil } from "../types";
import { Aviso, Boton, Campo, Pantalla, Tarjeta, Texto } from "../ui";

export default function Login() {
  const nav = useNav();
  const { entrar } = useSession();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    setError(null); setCargando(true);
    try {
      const r = await api<{ token: string; usuario: Perfil }>("/auth/login", { body: { usuario, password: clave } });
      await entrar(r.token, r.usuario);
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Entrar" subtitulo="Clientes, caja y supervisión">
      <Tarjeta>
        <Campo etiqueta="Teléfono o correo" value={usuario} onChangeText={setUsuario} autoCapitalize="none" keyboardType="email-address" placeholder="0414 000 0000" />
        <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry placeholder="••••••••" />
        <Aviso texto={error} />
        <Boton titulo="Entrar" onPress={enviar} cargando={cargando} deshabilitado={!usuario || !clave} />
      </Tarjeta>
      <Texto gris size={14}>¿Eres técnico o ayudante? Entra con tu huella o tu PIN desde «Soy técnico o ayudante».</Texto>
      <Boton titulo="Crear cuenta de cliente" tipo="secundario" onPress={() => nav.push("registroCliente")} />
    </Pantalla>
  );
}
