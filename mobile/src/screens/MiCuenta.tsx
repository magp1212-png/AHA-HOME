import React, { useState } from "react";
import { Linking } from "react-native";

import { api, getServer } from "../api";
import { useSession } from "../session";
import { Aviso, Avatar, Boton, C, Pantalla, Tarjeta, Texto } from "../ui";

const ROL: Record<string, string> = { cliente: "Cliente", agente: "Agente en caja", tecnico: "Técnico", ayudante: "Ayudante",
  tecnico_supervisor: "Técnico supervisor", supervisor: "Supervisor", superadmin: "Superadministrador" };

/** Mi cuenta: datos, términos, privacidad, cerrar sesión y eliminar la cuenta (lo exigen Apple y Google). */
export default function MiCuenta() {
  const { perfil, salir } = useSession();
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    try { await api("/yo/eliminar", { body: {} }); await salir(); } catch (e: any) { setError(e.message); }
  }

  if (!perfil) return null;
  return (
    <Pantalla titulo="Mi cuenta">
      <Tarjeta style={{ alignItems: "center" }}>
        <Avatar nombre={perfil.nombre} foto={perfil.foto ?? undefined} size={84} borde={C.lima} />
        <Texto negrita size={18}>{perfil.nombre}</Texto>
        <Texto gris>{ROL[perfil.rol] ?? perfil.rol}</Texto>
        {perfil.cedula ? <Texto gris>{perfil.cedula}</Texto> : null}
        <Texto gris>{[perfil.telefono, perfil.email].filter(Boolean).join(" · ")}</Texto>
      </Tarjeta>
      <Boton titulo="Términos de uso" tipo="secundario" icono="document-text-outline" onPress={() => Linking.openURL(getServer() + "/legal/terminos")} />
      <Boton titulo="Política de privacidad" tipo="secundario" icono="shield-checkmark-outline" onPress={() => Linking.openURL(getServer() + "/legal/privacidad")} />
      <Boton titulo="Cerrar sesión" icono="log-out-outline" onPress={salir} />
      <Tarjeta>
        <Texto negrita>Eliminar mi cuenta</Texto>
        <Texto gris size={14}>
          {perfil.rol === "cliente" ? "Se borran tu foto y tus datos. Tus pedidos quedan registrados sin tu nombre de usuario, para la garantía."
            : "Tu acceso se desactiva. La oficina conserva tu expediente según la ley laboral."}
        </Texto>
        {confirmar ? <Boton titulo="Sí, eliminar definitivamente" tipo="peligro" onPress={eliminar} />
          : <Boton titulo="Eliminar mi cuenta" tipo="peligro" icono="trash-outline" onPress={() => setConfirmar(true)} />}
        <Aviso texto={error} />
      </Tarjeta>
    </Pantalla>
  );
}
