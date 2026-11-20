import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";

import { api } from "../api";
import { biometriaDisponible, confirmarIdentidad } from "../biometria";
import { useNav } from "../nav";
import { useSession } from "../session";
import type { Perfil } from "../types";
import { Aviso, Boton, Campo, Pantalla, Tarjeta, Texto } from "../ui";

/** Acceso del técnico o ayudante: primero la huella o el rostro del teléfono, luego su PIN personal. */
export default function LoginTecnico() {
  const nav = useNav();
  const { entrar } = useSession();
  const [tel, setTel] = useState("");
  const [pin, setPin] = useState("");
  const [bio, setBio] = useState(false);
  const [verificado, setVerificado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("ahahome.telTecnico").then((t) => t && setTel(t)).catch(() => {});
    biometriaDisponible().then(setBio);
  }, []);

  async function huella() {
    setError(null);
    const ok = await confirmarIdentidad("Confirma que eres tú");
    if (ok) setVerificado(true); else setError("No se pudo confirmar tu huella. Intenta de nuevo.");
  }

  async function enviar() {
    setError(null); setCargando(true);
    try {
      const r = await api<{ token: string; usuario: Perfil }>("/auth/login-pin", { body: { telefono: tel, pin } });
      await AsyncStorage.setItem("ahahome.telTecnico", tel).catch(() => {});
      await entrar(r.token, r.usuario);
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Técnicos y ayudantes" subtitulo="Acceso protegido">
      {bio && !verificado ? (
        <Tarjeta>
          <Texto negrita>1. Confirma tu identidad</Texto>
          <Texto gris size={14}>Usa la huella o el rostro registrados en tu teléfono.</Texto>
          <Boton titulo="Usar mi huella" icono="finger-print" onPress={huella} />
        </Tarjeta>
      ) : null}
      {(!bio || verificado) ? (
        <Tarjeta>
          <Texto negrita>{bio ? "2. Tu teléfono y PIN" : "Tu teléfono y PIN"}</Texto>
          <Campo etiqueta="Teléfono" value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="0424 000 0000" />
          <Campo etiqueta="PIN personal" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="••••" />
          <Boton titulo="Entrar" onPress={enviar} cargando={cargando} deshabilitado={!tel || pin.length < 4} />
        </Tarjeta>
      ) : null}
      <Aviso texto={error} />
      <Boton titulo="Registrarme como técnico o ayudante" tipo="secundario" onPress={() => nav.push("registroTecnico")} />
    </Pantalla>
  );
}
