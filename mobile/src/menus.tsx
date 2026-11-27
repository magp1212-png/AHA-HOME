// Menú fijo abajo y menú ☰ del cliente y del técnico (diseño aprobado).
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { segunPanel, useInterfaz } from "./interfaz";
import { useNav } from "./nav";
import { useSession } from "./session";
import { C, type Icono, MenuHamburguesa, MenuInferior, useAvisos } from "./ui";

type ItemInferior = { id: string; icono: Icono; texto: string; activo?: boolean; onPress: () => void; aviso?: number };

export function MenuCliente({ activo }: { activo: "inicio" | "pedidos" | "avisos" | "cuenta" }) {
  const nav = useNav();
  const avisos = useAvisos();
  const ui = useInterfaz();
  return (
    <MenuInferior items={segunPanel<ItemInferior>("cliente", [
      { id: "inicio", icono: activo === "inicio" ? "home" : "home-outline", texto: "Inicio", activo: activo === "inicio", onPress: () => nav.reset("cliente") },
      { id: "pedidos", icono: "receipt-outline", texto: "Mis pedidos", activo: activo === "pedidos", onPress: () => activo !== "pedidos" && nav.push("misPedidos") },
      { id: "mensajes", icono: "chatbubbles-outline", texto: "Mensajes", activo: activo === "avisos", onPress: () => activo !== "avisos" && nav.push("mensajes") },
      { id: "cuenta", icono: "person-outline", texto: "Mi cuenta", activo: activo === "cuenta", onPress: () => activo !== "cuenta" && nav.push("miCuenta") },
    ], ui)} />
  );
}

export function HamburguesaCliente() {
  const nav = useNav();
  const { salir } = useSession();
  const ui = useInterfaz();
  return (
    <MenuHamburguesa opciones={[
      ...segunPanel("cliente_lateral", [
        { id: "inicio", icono: "home-outline" as const, texto: "Inicio", onPress: () => nav.reset("cliente") },
        { id: "pedidos", icono: "receipt-outline" as const, texto: "Mis pedidos", onPress: () => nav.push("misPedidos") },
        { id: "mensajes", icono: "chatbubbles-outline" as const, texto: "Mensajes", onPress: () => nav.push("mensajes") },
        { id: "avisos", icono: "notifications-outline" as const, texto: "Avisos", onPress: () => nav.push("notificaciones") },
        { id: "soporte", icono: "headset-outline" as const, texto: "Soporte AHA HOME", onPress: () => nav.push("soporte") },
        { id: "cuenta", icono: "person-outline" as const, texto: "Mi cuenta", onPress: () => nav.push("miCuenta") },
      ], ui),
      { icono: "log-out-outline", texto: "Cerrar sesión", onPress: salir, peligro: true },
    ]} />
  );
}

export function MenuTecnico({ activo }: { activo: "inicio" | "ordenes" | "mapa" | "perfil" }) {
  const nav = useNav();
  const ui = useInterfaz();
  return (
    <MenuInferior items={segunPanel<ItemInferior>("tecnico", [
      { id: "inicio", icono: activo === "inicio" ? "home" : "home-outline", texto: "Inicio", activo: activo === "inicio", onPress: () => nav.reset("tecnico") },
      { id: "ordenes", icono: "document-text-outline", texto: "Órdenes", activo: activo === "ordenes", onPress: () => activo !== "ordenes" && nav.push("ordenesTecnico") },
      { id: "mapa", icono: "location-outline", texto: "Mapa", activo: activo === "mapa", onPress: () => activo !== "mapa" && nav.push("mapaTecnico") },
      { id: "perfil", icono: "person-outline", texto: "Perfil", activo: activo === "perfil", onPress: () => activo !== "perfil" && nav.push("perfilTecnico") },
    ], ui)} />
  );
}

export function HamburguesaTecnico() {
  const nav = useNav();
  const { salir, perfil } = useSession();
  const esAyudante = perfil?.rol === "ayudante";
  return (
    <MenuHamburguesa opciones={[
      { icono: "home-outline", texto: "Inicio", onPress: () => nav.reset("tecnico") },
      { icono: "document-text-outline", texto: "Mis órdenes", onPress: () => nav.push("ordenesTecnico") },
      { icono: "notifications-outline", texto: "Avisos", onPress: () => nav.push("notificaciones") },
      ...(!esAyudante ? [
        { icono: "people-outline" as const, texto: "Mis ayudantes", onPress: () => nav.push("ayudantes") },
        { icono: "school-outline" as const, texto: "Mis títulos y cursos", onPress: () => nav.push("formacion") },
        { icono: "card-outline" as const, texto: "Mi cuenta de pago", onPress: () => nav.push("cuentaPago") },
      ] : []),
      { icono: "headset-outline", texto: "Hablar con AHA HOME", onPress: () => nav.push("soporte") },
      { icono: "person-outline", texto: "Mi perfil", onPress: () => nav.push("perfilTecnico") },
      { icono: "log-out-outline", texto: "Cerrar sesión", onPress: salir, peligro: true },
    ]} />
  );
}

/** Menú flotante de vidrio (estilo iOS reciente) con el botón naranja al centro, que abre el rastreo en vivo. */
export function MenuFlotanteCliente({ activo, onCentro }: { activo: "inicio" | "pedidos" | "avisos" | "cuenta"; onCentro: () => void }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const avisos = useAvisos();
  const ui = useInterfaz();
  const items = segunPanel<{ id: string; k: typeof activo; icono: React.ComponentProps<typeof Ionicons>["name"]; texto: string; ir: () => void; n?: number }>("cliente", [
    { id: "inicio", k: "inicio", icono: "home-outline", texto: "Inicio", ir: () => nav.reset("cliente") },
    { id: "pedidos", k: "pedidos", icono: "receipt-outline", texto: "Pedidos", ir: () => nav.push("misPedidos") },
    { id: "mensajes", k: "avisos", icono: "chatbubbles-outline", texto: "Mensajes", ir: () => nav.push("mensajes") },
    { id: "cuenta", k: "cuenta", icono: "person-outline", texto: "Cuenta", ir: () => nav.push("miCuenta") },
  ], ui);
  const mitad = Math.ceil(items.length / 2);
  const Item = ({ it }: { it: (typeof items)[number] }) => {
    const on = it.k === activo;
    return (
      <Pressable accessibilityRole="tab" accessibilityLabel={it.texto} accessibilityState={{ selected: on }} onPress={() => !on && it.ir()}
        style={{ flex: 1, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: on ? "rgba(33,36,77,0.08)" : "transparent" }}>
        <View>
          <Ionicons name={on ? (it.icono.replace("-outline", "") as any) : it.icono} size={24} color={on ? C.marino : "#6B7789"} />
          {it.n ? <View style={{ position: "absolute", top: -4, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: C.naranja,
            alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}><Text style={{ color: C.blanco, fontSize: 10, fontWeight: "900" }}>{it.n > 9 ? "9+" : it.n}</Text></View> : null}
        </View>
        <Text style={{ fontSize: 10.5, fontWeight: on ? "800" : "600", color: on ? C.marino : "#6B7789" }}>{it.texto}</Text>
      </Pressable>
    );
  };
  const contenido = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, height: 70 }}>
      {items.slice(0, mitad).map((it) => <Item key={it.id} it={it} />)}<View style={{ flex: 1 }} />{items.slice(mitad).map((it) => <Item key={it.id} it={it} />)}
    </View>
  );
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 14, right: 14, bottom: insets.bottom + 12, alignItems: "center" }}>
      <View style={{ width: "100%", maxWidth: 520, borderRadius: 35, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)",
        shadowColor: "#21244D", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8,
        backgroundColor: Platform.OS === "android" ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.55)" }}>
        {Platform.OS === "android" ? contenido : <BlurView intensity={60} tint="light">{contenido}</BlurView>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Rastreo de mi pedido en vivo" onPress={onCentro}
        style={({ pressed }) => ({ position: "absolute", top: -28, width: 74, height: 74, borderRadius: 37, backgroundColor: C.naranja,
          borderWidth: 4, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: C.naranja, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 })}>
        <Ionicons name="car" size={32} color={C.blanco} />
      </Pressable>
    </View>
  );
}
