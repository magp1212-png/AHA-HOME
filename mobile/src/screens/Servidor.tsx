import React, { useState } from "react";

import { api, getServer, setServer } from "../api";
import { useNav } from "../nav";
import { Aviso, Boton, Campo, Pantalla, Tarjeta, Texto } from "../ui";

/** Cambiar la dirección del servidor (por ejemplo al mudarse al servidor físico). */
export default function Servidor() {
  const nav = useNav();
  const [url, setUrl] = useState(getServer());
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  async function probar() {
    await setServer(url);
    try {
      const r = await api<{ app: string; version: string }>("/salud");
      setMsg({ t: `Conectado: ${r.app} ${r.version}`, ok: true });
    } catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }

  return (
    <Pantalla titulo="Servidor">
      <Tarjeta>
        <Texto gris size={14}>Dirección del servidor de AHA HOME, por ejemplo https://api-home.aha-go.com</Texto>
        <Campo etiqueta="Dirección" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
        <Aviso texto={msg?.t} tono={msg?.ok ? "ok" : "error"} />
        <Boton titulo="Guardar y probar" onPress={probar} />
        <Boton titulo="Volver" tipo="secundario" onPress={nav.back} />
      </Tarjeta>
    </Pantalla>
  );
}
