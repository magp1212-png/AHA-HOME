import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, fileUrl, subirFoto } from "../api";
import { useNav } from "../nav";
import { tomarFoto } from "../photo";
import { useSession } from "../session";
import { Avatar, C } from "../ui";

type Msg = { id: number; texto: string; foto: string | null; creado: string; mio: boolean; sistema: boolean; autor: string | null; rol: string | null; control: boolean };
type Llamada = { texto: string; detalle?: string; telefono: string };
type Chat = { orden_id: number; codigo: string; abierto: boolean; llamar?: Llamada[]; estado_texto: string; con: { nombre: string; foto: string | null; rol: string }; mensajes: Msg[]; monitoreo?: { activo: boolean; texto: string } };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

/** Chat de la orden: cliente ↔ técnico y ayudante, supervisado por el centro de control. */
export default function ChatOrden({ id }: { id: number }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { perfil } = useSession();
  const [chat, setChat] = useState<Chat | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [menuLlamar, setMenuLlamar] = useState(false);
  const llamadas = chat?.llamar ?? [];
  const llamar = (l: Llamada) => { setMenuLlamar(false); Linking.openURL(`tel:${l.telefono}`).catch(() => setError("No se pudo abrir el teléfono.")); };
  const scroll = useRef<ScrollView>(null);
  const esCliente = perfil?.rol === "cliente";
  const esControl = ["tecnico_supervisor", "supervisor", "superadmin"].includes(perfil?.rol ?? "");

  const cargar = useCallback(async () => {
    try { setChat(await api<Chat>(`/ordenes/${id}/chat`)); setError(null); } catch (e: any) { setError(e.message); }
  }, [id]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 8000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }, [chat?.mensajes.length]);

  async function enviar(t: string, foto = "") {
    if (!t.trim() && !foto) return;
    setEnviando(true); setError(null);
    try { await api(`/ordenes/${id}/chat`, { body: { texto: t, foto } }); setTexto(""); await cargar(); } catch (e: any) { setError(e.message); }
    setEnviando(false);
  }
  async function foto() {
    const r = await tomarFoto();
    if (!r || "error" in r) return;
    try { await enviar("", await subirFoto(r.base64)); } catch (e: any) { setError(e.message); }
  }

  const rapidas = esCliente ? ["¿Cuánto falta?", "Ya estoy en casa", "Estoy en camino a casa"]
    : esControl ? ["Seguimos tu servicio en vivo", "¿Todo bien con el servicio?"] : ["Voy en camino", "Llegué a la dirección", "¿Me confirma el piso?"];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#EEF1F7" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.92)",
        borderBottomWidth: 1, borderBottomColor: C.linea, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={nav.back} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={28} color={C.marino} />
        </Pressable>
        <Avatar nombre={chat?.con.nombre ?? "?"} foto={chat?.con.foto} size={42} borde={C.lima} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 16, color: C.texto }} numberOfLines={1}>{chat ? `${chat.con.nombre} · ${chat.con.rol}` : "Chat"}</Text>
          <Text style={{ fontSize: 12.5, color: chat?.abierto ? C.ok : C.gris, fontWeight: "700" }}>{chat ? `● ${chat.estado_texto} · ${chat.codigo}` : ""}</Text>
        </View>
        {llamadas.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Llamar" onPress={() => (llamadas.length === 1 && !llamadas[0].detalle ? llamar(llamadas[0]) : setMenuLlamar(!menuLlamar))}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.ok, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="call" size={22} color={C.blanco} />
          </Pressable>
        ) : null}
      </View>
      {menuLlamar ? (
        <View style={{ backgroundColor: C.blanco, borderBottomWidth: 1, borderBottomColor: C.linea, padding: 10, gap: 8 }}>
          {llamadas.map((l) => (
            <Pressable key={l.texto} accessibilityRole="button" onPress={() => llamar(l)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: C.linea, padding: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.ok, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="call" size={20} color={C.blanco} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", color: C.texto, fontSize: 15 }}>{l.texto}</Text>
                {l.detalle ? <Text style={{ color: C.gris, fontSize: 12.5 }}>{l.detalle}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8, backgroundColor: C.limaSuave, borderWidth: 1, borderColor: "#DDE27A", borderRadius: 14, padding: 10 }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={C.marino} />
          <Text style={{ flex: 1, fontSize: 12.5, color: C.marino }}>
            <Text style={{ fontWeight: "800" }}>Conversación supervisada. </Text>
            El centro de control y los supervisores de AHA HOME pueden ver y participar en este chat. No compartas datos bancarios.
          </Text>
        </View>
        {chat?.monitoreo?.activo ? (
          <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#E3F7EF", borderWidth: 1, borderColor: "#8ED9BD", borderRadius: 14, padding: 10 }}>
            <Ionicons name="eye-outline" size={20} color="#138A62" />
            <Text style={{ flex: 1, fontSize: 12.5, color: "#0F5C43", fontWeight: "700" }}>{chat.monitoreo.texto}</Text>
          </View>
        ) : null}
        {error ? <Text style={{ color: C.error }}>{error}</Text> : null}
        {chat && chat.mensajes.length === 0 ? <Text style={{ alignSelf: "center", color: C.gris, marginTop: 10 }}>Escribe el primer mensaje.</Text> : null}
        {chat?.mensajes.map((m) => m.sistema ? (
          <Text key={m.id} style={{ alignSelf: "center", fontSize: 12, fontWeight: "700", color: C.marino, backgroundColor: "rgba(207,215,42,0.35)",
            borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" }}>{m.texto}</Text>
        ) : (
          <View key={m.id} style={{ maxWidth: "80%", alignSelf: m.mio ? "flex-end" : "flex-start", borderRadius: 18, padding: 10,
            borderBottomRightRadius: m.mio ? 6 : 18, borderBottomLeftRadius: m.mio ? 18 : 6,
            backgroundColor: m.mio ? C.marino : C.blanco, shadowColor: "#21244D", shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
            {!m.mio ? <Text style={{ fontSize: 11.5, fontWeight: "800", color: m.control ? C.ok : C.naranja, marginBottom: 2 }}>{m.autor?.split(" ")[0]} · {m.rol}</Text> : null}
            {m.foto ? <Image source={{ uri: fileUrl(m.foto) ?? undefined }} style={{ width: 200, height: 150, borderRadius: 12, marginBottom: m.texto ? 6 : 0 }} /> : null}
            {m.texto ? <Text style={{ fontSize: 15, color: m.mio ? C.blanco : C.texto }}>{m.texto}</Text> : null}
            <Text style={{ fontSize: 10.5, color: m.mio ? "#C5C8E4" : C.gris, alignSelf: "flex-end", marginTop: 3 }}>{hora(m.creado)}</Text>
          </View>
        ))}
      </ScrollView>

      {chat?.abierto ? (
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 6 }}>
            {rapidas.map((r) => (
              <Pressable key={r} accessibilityRole="button" onPress={() => enviar(r)}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: C.borde, backgroundColor: C.blanco, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }}>
                <Text style={{ fontWeight: "700", color: C.marino, fontSize: 13 }}>{r}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ marginHorizontal: 12, minHeight: 54, borderRadius: 27, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea,
            flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 6, paddingRight: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Enviar foto" onPress={foto} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="camera-outline" size={24} color={C.marino} />
            </Pressable>
            <TextInput value={texto} onChangeText={setTexto} placeholder="Escribe un mensaje…" placeholderTextColor="#6B7789" multiline
              style={{ flex: 1, fontSize: 15, color: C.texto, maxHeight: 100, paddingVertical: 10 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Enviar" disabled={enviando || !texto.trim()} onPress={() => enviar(texto)}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: texto.trim() ? C.naranja : C.borde, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="send" size={18} color={C.blanco} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={{ textAlign: "center", color: C.gris, padding: 14, paddingBottom: insets.bottom + 14 }}>El servicio terminó: el chat queda guardado en el historial.</Text>
      )}
    </KeyboardAvoidingView>
  );
}
