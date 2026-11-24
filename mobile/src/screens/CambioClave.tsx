import React from "react";

import { useSession } from "../session";
import { Boton, Pantalla, Texto } from "../ui";
import { Seguridad } from "./MiCuenta";

/** Primer ingreso con la clave que creó el CEO: la persona debe poner una propia antes de seguir. */
export default function CambioClave() {
  const { perfil, recargar, salir } = useSession();
  return (
    <Pantalla titulo="Crea tu propia clave" subtitulo={perfil?.nombre}>
      <Texto>Tu cuenta la creó el CEO con una clave temporal. Escribe esa clave y elige una nueva para continuar.</Texto>
      <Seguridad alCambiar={() => { recargar().catch(() => {}); }} />
      <Boton titulo="Cerrar sesión" tipo="secundario" onPress={salir} />
    </Pantalla>
  );
}
