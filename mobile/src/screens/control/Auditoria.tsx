import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../../api";
import { Aviso, C, Cargando, Etiqueta, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

type Persona = { id: number; nombre: string; rol: string; rol_texto: string; tienda: string | null; en_linea: boolean; ultimo_acceso: string | null; ip: string;
  acciones_hoy: number; ultima_accion: string | null; ultima_accion_en: string | null };
type Accion = { id: number; quien: string; rol: string; rol_texto: string; accion: string; estado: number; ip: string; en: string };
const ROLES: [string, string][] = [["", "Todos"], ["superadmin", "Superadmin"], ["supervisor", "Centro de control"], ["tecnico_supervisor", "Técnico supervisor"], ["agente", "Caja"]];
const cuando = (iso: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? "ahora" : min < 60 ? `hace ${min} min` : new Date(iso).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Centro de mando del CEO: quién del equipo está dentro y qué hizo cada uno. */
export default function Auditoria() {
  const [eq, setEq] = useState<{ en_linea: number; total: number; equipo: Persona[] } | null>(null);
  const [act, setAct] = useState<Accion[] | null>(null);
  const [rol, setRol] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try {
      setEq(await api("/ceo/equipo"));
      setAct(await api<Accion[]>("/ceo/actividad", { query: { rol: rol || undefined, usuario_id: persona?.id, limite: 150 } }));
    } catch (e: any) { setError(e.message); }
  }, [rol, persona]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 15000); return () => clearInterval(t); }, [cargar]);
  return (
    <Pantalla titulo="Centro de mando" subtitulo="Auditoría del equipo · solo CEO" onRefresh={cargar}>
      <Aviso texto={error} />
      <Tarjeta>
        <Seccion>QUIÉN ESTÁ DENTRO</Seccion>
        {!eq ? <Cargando /> : <Text style={{ fontSize: 22, fontWeight: "900", color: C.texto }}>{eq.en_linea} en línea <Text style={{ fontSize: 14, color: C.gris, fontWeight: "600" }}>de {eq.total} personas del equipo</Text></Text>}
        {eq?.equipo.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => setPersona(persona?.id === p.id ? null : p)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.linea, backgroundColor: persona?.id === p.id ? C.limaSuave : "transparent", borderRadius: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.en_linea ? C.ok : "#CBD5E1" }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: C.texto }}>{p.nombre} <Text style={{ color: C.gris, fontWeight: "600", fontSize: 12.5 }}>· {p.rol_texto}{p.tienda ? ` · ${p.tienda}` : ""}</Text></Text>
              <Text style={{ color: C.gris, fontSize: 12.5 }} numberOfLines={1}>{p.en_linea ? "En línea" : `Último acceso ${cuando(p.ultimo_acceso)}`}{p.ultima_accion ? ` · ${p.ultima_accion}` : ""}</Text>
            </View>
            <Etiqueta texto={`${p.acciones_hoy} hoy`} tono={p.acciones_hoy ? "lima" : "neutro"} />
          </Pressable>
        ))}
      </Tarjeta>
      <Seccion>{persona ? `LO QUE HIZO ${persona.nombre.toUpperCase()}` : "LO QUE HIZO EL EQUIPO"}</Seccion>
      {!persona ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {ROLES.map(([k, t]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: rol === k }} onPress={() => setRol(k)}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: rol === k ? C.marino : C.borde, backgroundColor: rol === k ? C.marino : C.blanco, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }}>
              <Text style={{ fontWeight: "800", fontSize: 13, color: rol === k ? C.lima : C.marino }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      ) : <Pressable onPress={() => setPersona(null)}><Text style={{ color: C.marino, fontWeight: "800" }}>← Ver a todo el equipo</Text></Pressable>}
      {act === null ? <Cargando /> : act.length === 0 ? <Texto gris>Sin actividad registrada.</Texto> : null}
      {act?.map((a) => (
        <View key={a.id} style={{ backgroundColor: C.blanco, borderRadius: 14, borderWidth: 1, borderColor: a.estado >= 400 ? "#F5C2C0" : C.linea, padding: 12, gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontWeight: "800", color: C.texto, flex: 1 }}>{a.quien} <Text style={{ color: C.gris, fontWeight: "600", fontSize: 12.5 }}>· {a.rol_texto}</Text></Text>
            <Text style={{ color: C.gris, fontSize: 12 }}>{cuando(a.en)}</Text>
          </View>
          <Text style={{ color: a.estado >= 400 ? C.error : C.texto, fontSize: 14 }}>{a.accion}</Text>
          {a.ip ? <Text style={{ color: C.gris, fontSize: 11.5 }}>IP {a.ip}</Text> : null}
        </View>
      ))}
    </Pantalla>
  );
}
