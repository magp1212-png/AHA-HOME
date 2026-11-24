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
    try { setLista(await api<N[]>("/notificaciones")); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function leerTodas() { try { await api("/notificaciones/leer", { body: {} }); cargar(); } catch (e: any) { setError(e.message); } }
  function abrir(n: N) {
    if (!n.leida) { api(`/notificaciones/${n.id}/leer`, { body: {} }).catch(() => {}); setLista((l) => l?.map((x) => (x.id === n.id ? { ...x, leida: true } : x)) ?? null); }
    if (!n.orden_id) return;
    const r = perfil?.rol;
    if (r === "cliente") nav.push("rastreo", { id: n.orden_id });
    else if (r === "agente") nav.push("ordenCaja", { id: n.orden_id });
  }

  return (
    <Pantalla titulo="Notificaciones" onRefresh={cargar} abajo={perfil?.rol === "cliente" ? <MenuCliente activo="inicio" /> : (perfil?.rol === "tecnico" || perfil?.rol === "ayudante") ? <MenuTecnico activo="inicio" /> : undefined}>
      <Aviso texto={error} />
      {lista === null ? <Cargando /> : null}
      {lista?.length === 0 ? <Texto gris>No tienes avisos todavía.</Texto> : null}
      {(() => {
        const hace = (f: string) => { const m = Math.round((Date.now() - new Date(f).getTime()) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : new Date(f).toLocaleDateString("es-VE"); };
        const fila = (n: N) => (
          <Pressable key={n.id} onPress={() => abrir(n)}
            style={{ backgroundColor: n.leida ? C.blanco : C.limaSuave, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 14, flexDirection: "row", gap: 12 }}>
            {!n.leida ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.naranja, marginTop: 7 }} /> : null}
            <Ionicons name={n.titulo.toLowerCase().includes("código") ? "key" : n.titulo.toLowerCase().includes("incidencia") ? "warning" : "notifications"} size={22} color={C.marino} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontWeight: "800", color: C.texto }}>{n.titulo}</Text>
              <Text style={{ color: C.texto }}>{n.texto}</Text>
              <Text style={{ fontSize: 12, color: C.gris }}>{hace(n.fecha)}</Text>
            </View>
          </Pressable>
        );
        const nuevas = (lista ?? []).filter((n) => !n.leida), leidas = (lista ?? []).filter((n) => n.leida);
        return (
          <>
            {nuevas.length ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "900", color: C.marino, fontSize: 13, letterSpacing: 0.5 }}>RECIENTES ({nuevas.length})</Text>
                <Pressable accessibilityRole="button" onPress={leerTodas}><Text style={{ color: C.naranja, fontWeight: "800" }}>Marcar todas como leídas</Text></Pressable>
              </View>
            ) : null}
            {nuevas.map(fila)}
            {leidas.length ? <Text style={{ fontWeight: "900", color: C.gris, fontSize: 13, letterSpacing: 0.5, marginTop: 6 }}>LEÍDAS</Text> : null}
            {leidas.map(fila)}
          </>
        );
      })()}
    </Pantalla>
  );
}
