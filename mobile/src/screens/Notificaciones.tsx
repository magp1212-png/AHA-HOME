import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../api";
import { useNav } from "../nav";
import { useSession } from "../session";
import { MenuCliente, MenuTecnico } from "../menus";
import { Aviso, C, Cargando, Pantalla, Texto } from "../ui";

type N = { id: number; titulo: string; texto: string; orden_id: number | null; leida: boolean; fecha: string };

/** Bandeja de avisos: lo mismo que llega por push, guardado para verlo después. */
export default function Notificaciones() {
  const nav = useNav();
  const { perfil } = useSession();
  const [lista, setLista] = useState<N[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setLista(await api<N[]>("/notificaciones")); await api("/notificaciones/leer", { body: {} }); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function abrir(n: N) {
    if (!n.orden_id) return;
    const r = perfil?.rol;
    if (r === "cliente") nav.push("rastreo", { id: n.orden_id });
    else if (r === "agente") nav.push("ordenCaja", { id: n.orden_id });
  }

  return (
    <Pantalla titulo="Notificaciones" onRefresh={cargar} abajo={perfil?.rol === "cliente" ? <MenuCliente activo="avisos" /> : (perfil?.rol === "tecnico" || perfil?.rol === "ayudante") ? <MenuTecnico activo="inicio" /> : undefined}>
      <Aviso texto={error} />
      {lista === null ? <Cargando /> : null}
      {lista?.length === 0 ? <Texto gris>No tienes avisos todavía.</Texto> : null}
      {lista?.map((n) => (
        <Pressable key={n.id} onPress={() => abrir(n)}
          style={{ backgroundColor: n.leida ? C.blanco : C.limaSuave, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 14, flexDirection: "row", gap: 12 }}>
          <Ionicons name={n.titulo.toLowerCase().includes("falta") || n.titulo.toLowerCase().includes("incidencia") ? "warning" : "notifications"} size={22} color={C.marino} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontWeight: "800", color: C.texto }}>{n.titulo}</Text>
            <Text style={{ color: C.texto }}>{n.texto}</Text>
            <Text style={{ fontSize: 12, color: C.gris }}>{new Date(n.fecha).toLocaleString("es-VE")}</Text>
          </View>
        </Pressable>
      ))}
    </Pantalla>
  );
}
