import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api";
import { useNav } from "../nav";
import { Boton, C, Logo } from "../ui";

const PASOS: { icono: React.ComponentProps<typeof Ionicons>["name"]; titulo: string; detalle: string }[] = [
  { icono: "storefront-outline", titulo: "Retiramos tu compra", detalle: "en la tienda" },
  { icono: "car-outline", titulo: "La llevamos a tu casa", detalle: "con seguimiento en vivo" },
  { icono: "construct-outline", titulo: "Desembalamos e instalamos", detalle: "técnicos verificados" },
  { icono: "trash-outline", titulo: "Nos llevamos los desechos", detalle: "cajas, anime y plásticos" },
];

/** Portada para el cliente: logotipo, qué hacemos en 4 pasos y dos botones para empezar. */
export default function Inicio() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  // En pruebas internas (modo equipo) solo entran la caja, el centro de control, el superadmin y el CEO
  const [soloEquipo, setSoloEquipo] = useState(false);
  useEffect(() => { api<{ solo_equipo?: boolean }>("/salud").then((r) => setSoloEquipo(!!r.solo_equipo)).catch(() => {}); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.blanco }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16, paddingHorizontal: 22, gap: 10 }}>
        {/* tocar y mantener el logotipo abre la configuración del servidor (solo para pruebas) */}
        <Pressable accessibilityRole="image" accessibilityLabel="AHA HOME" onLongPress={() => nav.push("servidor")} delayLongPress={1500}
          style={{ alignItems: "center", gap: 6 }}>
          <Logo size={96} conFondo={false} />
          <Text style={{ color: C.marino, fontSize: 36, fontWeight: "900", letterSpacing: 1 }}>AHA HOME</Text>
        </Pressable>
        <Text style={{ color: C.marino, fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 8 }}>Hacemos todo por ti</Text>
        <Text style={{ color: C.gris, fontSize: 15, textAlign: "center", lineHeight: 21 }}>
          Desde la caja de Damasco hasta tu casa, con tu compra instalada y sin cajas que botar.
        </Text>
        <View style={{ gap: 8, marginTop: 6 }}>
          {PASOS.map((p) => (
            <View key={p.titulo} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.fondo, borderWidth: 1, borderColor: C.linea,
              borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.lima, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={p.icono} size={22} color={C.marino} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.texto, fontWeight: "800", fontSize: 15 }}>{p.titulo}</Text>
                <Text style={{ color: C.gris, fontSize: 13 }}>{p.detalle}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, minHeight: 16 }} />
        <View style={{ gap: 10 }}>
          {soloEquipo ? (
            <>
              <Text style={{ color: C.gris, fontSize: 14, textAlign: "center" }}>Versión de pruebas para el equipo: caja, centro de control y superadministrador.</Text>
              <Boton titulo="ENTRAR · EQUIPO AHA HOME" onPress={() => nav.push("login")} />
            </>
          ) : <>
          <Boton titulo="CREAR MI CUENTA" tipo="naranja" onPress={() => nav.push("registroCliente")} />
          <Boton titulo="YA TENGO CUENTA · ENTRAR" onPress={() => nav.push("login")} />
          <Pressable accessibilityRole="button" onPress={() => nav.push("loginTecnico")} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.gris, fontSize: 14 }}>¿Eres técnico o ayudante? <Text style={{ fontWeight: "800", color: C.marino, textDecorationLine: "underline" }}>Entra aquí</Text></Text>
          </Pressable>
          </>}
        </View>
      </ScrollView>
    </View>
  );
}
