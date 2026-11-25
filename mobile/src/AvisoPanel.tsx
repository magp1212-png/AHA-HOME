import React from "react";

import { useInterfaz } from "./interfaz";
import { useSession } from "./session";
import { Aviso } from "./ui";

/** Aviso que publica el superadmin desde el panel (por ejemplo, un feriado). Se muestra arriba del inicio de cada perfil elegido. */
export function AvisoPanel() {
  const ui = useInterfaz();
  const { perfil } = useSession();
  const rol = perfil?.rol === "ayudante" ? "tecnico" : perfil?.rol || "cliente";
  if (!ui?.aviso?.activo || !ui.aviso.para.includes(rol)) return null;
  return <Aviso tono={ui.aviso.tono === "alerta" ? "error" : ui.aviso.tono === "ok" ? "ok" : "info"} texto={ui.aviso.texto} />;
}
