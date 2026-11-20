import React, { useState } from "react";

import { api } from "../../api";
import { useNav } from "../../nav";
import { Aviso, Boton, Campo, Pantalla, Tarjeta, Texto } from "../../ui";

export default function Incidencia({ id }: { id?: number }) {
  const nav = useNav();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    setCargando(true); setError(null);
    try { await api("/tecnico/incidencias", { body: { orden_id: id ?? null, texto } }); nav.back(); } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Reportar incidencia">
      <Tarjeta>
        <Texto gris size={14}>Le llega de inmediato al técnico supervisor y al equipo supervisor.</Texto>
        <Campo etiqueta="¿Qué pasó?" value={texto} onChangeText={setTexto} multiline placeholder="Ej. no hay llave de paso para conectar la lavadora" />
        <Aviso texto={error} />
        <Boton titulo="Enviar" tipo="peligro" onPress={enviar} cargando={cargando} deshabilitado={texto.trim().length < 3} />
      </Tarjeta>
    </Pantalla>
  );
}
