import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getServer } from "../api";
import { useNav } from "../nav";
import { Boton, C, Logo } from "../ui";

export default function Inicio() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.marino, paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
      <View style={{ alignItems: "center", gap: 14 }}>
        <Logo size={96} conFondo={false} />
        <Text style={{ color: C.blanco, fontSize: 38, fontWeight: "900", letterSpacing: 1 }}>AHA HOME</Text>
        <Text style={{ color: C.lima, fontSize: 17, fontWeight: "700" }}>Hacemos todo por ti</Text>
        <Text style={{ color: "#DCDEF0", fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: 6 }}>
          Retiramos tu compra en Damasco, la llevamos a tu casa, la instalamos y nos llevamos las cajas y el anime.
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: 12 }}>
        <Boton titulo="Entrar" tipo="lima" onPress={() => nav.push("login")} />
        <Boton titulo="Soy técnico o ayudante" tipo="secundario" icono="finger-print" onPress={() => nav.push("loginTecnico")} />
        <Pressable accessibilityRole="button" onPress={() => nav.push("registroCliente")} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.blanco, fontSize: 15 }}>¿Nuevo en AHA HOME? <Text style={{ fontWeight: "800", color: C.lima }}>Regístrate</Text></Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => nav.push("servidor")} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#9EA3CF", fontSize: 12 }}>Servidor: {getServer()}</Text>
        </Pressable>
      </View>
    </View>
  );
}
