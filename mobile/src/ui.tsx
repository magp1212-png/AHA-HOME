// Piezas de interfaz de AHA HOME: colores de AHA VOY (azul marino y verde lima) y la casita de Anunciate.
import { Ionicons } from "@expo/vector-icons";
import QRCode from "qrcode";
import React, { useMemo } from "react";
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { G, Path, Rect } from "react-native-svg";

import { fileUrl } from "./api";
import { useNav } from "./nav";

export const C = {
  marino: "#21244D", marinoOscuro: "#1A1C3D", marinoSuave: "#2E3266", lima: "#CFD72A", limaSuave: "#F1F3D4",
  fondo: "#F4F7FB", blanco: "#FFFFFF", texto: "#1A1C3D", gris: "#4A5568", linea: "#E2E8F0", borde: "#CBD5E1",
  ok: "#167A45", okSuave: "#E7F6EE", alerta: "#C2410C", alertaSuave: "#FFF1E8", error: "#B42318", errorSuave: "#FDECEC",
};

export type Icono = React.ComponentProps<typeof Ionicons>["name"];

/** La casita de Anunciate con los colores de AHA VOY. */
export function Logo({ size = 48, conFondo = true }: { size?: number; conFondo?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {conFondo && <Rect width={100} height={100} rx={24} fill={C.marino} />}
      <G transform={conFondo ? "translate(12 10) scale(0.76)" : undefined}>
        <Path d="M50 13 L85 38.5 Q87.5 40.3 87.5 43.4 L87.5 69 Q87.5 76 80.5 76 L45 76 L29.5 88.5 Q26.5 90.8 26.5 87 L26.5 76 L19.5 76 Q12.5 76 12.5 69 L12.5 43.4 Q12.5 40.3 15 38.5 Z"
          fill={C.lima} stroke={C.lima} strokeWidth={5} strokeLinejoin="round" />
        <Path d="M33 50 L45 62 L67.5 39.5" fill="none" stroke={C.marino} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/** Pantalla con encabezado azul marino, botón de volver y contenido desplazable. */
export function Pantalla({ titulo, subtitulo, children, volver = true, derecha, onRefresh, refrescando, pie, fondo = C.fondo }: {
  titulo: string; subtitulo?: string; children: React.ReactNode; volver?: boolean; derecha?: React.ReactNode;
  onRefresh?: () => void; refrescando?: boolean; pie?: React.ReactNode; fondo?: string;
}) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: fondo }}>
      <View style={{ backgroundColor: C.marino, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        {volver && nav.canGoBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={nav.back} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-back" size={26} color={C.blanco} />
          </Pressable>
        ) : <View style={{ width: 44, alignItems: "center" }}><Logo size={30} conFondo={false} /></View>}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: C.blanco, fontSize: 19, fontWeight: "800", letterSpacing: 0.3 }} numberOfLines={1}>{titulo}</Text>
          {subtitulo ? <Text style={{ color: "#DCDEF0", fontSize: 13, marginTop: 2 }} numberOfLines={1}>{subtitulo}</Text> : null}
        </View>
        <View style={{ minWidth: 44, alignItems: "center", flexDirection: "row", justifyContent: "flex-end" }}>{derecha}</View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refrescando} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
      {pie ? <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: C.linea, backgroundColor: C.blanco }}>{pie}</View> : null}
    </View>
  );
}

export function Tarjeta({ children, style, oscura }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; oscura?: boolean }) {
  return (
    <View style={[{ backgroundColor: oscura ? C.marino : C.blanco, borderRadius: 16, padding: 16, gap: 10,
      borderWidth: oscura ? 0 : 1, borderColor: C.linea }, style]}>{children}</View>
  );
}

export function Titulo({ children, color = C.texto }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ fontSize: 18, fontWeight: "800", color }}>{children}</Text>;
}

export function Seccion({ children, color = C.marino }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.7, color, marginTop: 4 }}>{children}</Text>;
}

export function Texto({ children, gris, negrita, size = 15, color }: { children: React.ReactNode; gris?: boolean; negrita?: boolean; size?: number; color?: string }) {
  return <Text style={{ fontSize: size, color: color ?? (gris ? C.gris : C.texto), fontWeight: negrita ? "700" : "400", lineHeight: size * 1.35 }}>{children}</Text>;
}

export function Boton({ titulo, onPress, tipo = "principal", icono, cargando, deshabilitado }: {
  titulo: string; onPress: () => void; tipo?: "principal" | "secundario" | "peligro" | "lima" | "exito"; icono?: Icono;
  cargando?: boolean; deshabilitado?: boolean;
}) {
  const estilos = {
    principal: { bg: C.marino, fg: C.blanco, borde: C.marino },
    secundario: { bg: C.blanco, fg: C.marino, borde: C.marino },
    peligro: { bg: C.blanco, fg: C.error, borde: C.borde },
    lima: { bg: C.lima, fg: C.marino, borde: C.lima },
    exito: { bg: C.ok, fg: C.blanco, borde: C.ok },
  }[tipo];
  const off = deshabilitado || cargando;
  return (
    <Pressable accessibilityRole="button" disabled={off} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, borderRadius: 26, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        backgroundColor: off ? C.linea : estilos.bg, borderWidth: 1.5, borderColor: off ? C.linea : estilos.borde, opacity: pressed ? 0.85 : 1 })}>
      {cargando ? <ActivityIndicator color={estilos.fg} /> : icono ? <Ionicons name={icono} size={20} color={off ? C.gris : estilos.fg} /> : null}
      <Text style={{ color: off ? C.gris : estilos.fg, fontSize: 16, fontWeight: "800" }}>{titulo}</Text>
    </Pressable>
  );
}

export function Campo({ etiqueta, ...props }: TextInputProps & { etiqueta: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.texto }}>{etiqueta}</Text>
      <TextInput placeholderTextColor="#6B7789" {...props}
        style={[{ minHeight: 48, borderWidth: 1, borderColor: C.borde, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: C.texto, backgroundColor: C.blanco },
          props.multiline ? { minHeight: 90, paddingTop: 12, textAlignVertical: "top" } : null, props.style]} />
    </View>
  );
}

/** Opción seleccionable (tipo de artículo, franja, método de pago, grupo…). */
export function Opcion({ texto, activo, onPress, icono }: { texto: string; activo: boolean; onPress: () => void; icono?: Icono }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: activo }} onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: activo ? 2 : 1, borderColor: activo ? C.marino : C.borde,
        backgroundColor: activo ? C.limaSuave : C.blanco, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
      {icono ? <Ionicons name={icono} size={18} color={C.marino} /> : null}
      <Text style={{ fontSize: 15, fontWeight: activo ? "800" : "500", color: C.texto }}>{texto}</Text>
    </Pressable>
  );
}

export function Fila({ children, gap = 8, wrap }: { children: React.ReactNode; gap?: number; wrap?: boolean }) {
  return <View style={{ flexDirection: "row", gap, flexWrap: wrap ? "wrap" : "nowrap", alignItems: "center" }}>{children}</View>;
}

export function Etiqueta({ texto, tono = "neutro" }: { texto: string; tono?: "neutro" | "ok" | "alerta" | "error" | "lima" }) {
  const t = { neutro: ["#EEF2F7", "#334155"], ok: [C.okSuave, "#0F5132"], alerta: [C.alertaSuave, "#9A3412"], error: [C.errorSuave, C.error], lima: [C.lima, C.marino] }[tono];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t[0], borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: t[1], fontSize: 12, fontWeight: "800" }}>{texto}</Text>
    </View>
  );
}

export function Aviso({ texto, tono = "error" }: { texto?: string | null; tono?: "error" | "ok" | "info" }) {
  if (!texto) return null;
  const t = { error: [C.errorSuave, C.error], ok: [C.okSuave, "#0F5132"], info: [C.limaSuave, C.marino] }[tono];
  return <View style={{ backgroundColor: t[0], borderRadius: 12, padding: 12 }}><Text style={{ color: t[1], fontSize: 14, fontWeight: "600" }}>{texto}</Text></View>;
}

export function Cargando() {
  return <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={C.marino} size="large" /></View>;
}

/** Casilla del checklist. */
export function Casilla({ texto, marcado, onPress, tono = "normal" }: { texto: string; marcado: boolean; onPress: () => void; tono?: "normal" | "obligatorio" }) {
  const borde = tono === "obligatorio" ? C.alerta : "#9AA8BA";
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} onPress={onPress}
      style={{ minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: tono === "obligatorio" ? "#F3D3C2" : C.linea,
        backgroundColor: tono === "obligatorio" ? "#FFF8F4" : C.blanco, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 }}>
      <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: marcado ? 0 : 2, borderColor: borde, backgroundColor: marcado ? C.ok : "transparent",
        alignItems: "center", justifyContent: "center" }}>
        {marcado ? <Ionicons name="checkmark" size={18} color={C.blanco} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>{texto}</Text>
    </Pressable>
  );
}

/** Foto de la persona (o sus iniciales si no hay foto). */
export function Avatar({ nombre, foto, size = 56, borde }: { nombre: string; foto?: string | null; size?: number; borde?: string }) {
  const ini = nombre.split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const url = fileUrl(foto);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.marino, alignItems: "center", justifyContent: "center",
      overflow: "hidden", borderWidth: borde ? 3 : 0, borderColor: borde }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} /> :
        <Text style={{ color: C.lima, fontWeight: "800", fontSize: size * 0.36 }}>{ini}</Text>}
    </View>
  );
}

export function QR({ valor, size = 220 }: { valor: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const qr = QRCode.create(valor, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    let path = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.modules.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { d: path, n: count };
  }, [valor]);
  return (
    <View style={{ backgroundColor: C.blanco, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: C.linea }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill={C.blanco} />
        <Path d={d} fill={C.marino} />
      </Svg>
    </View>
  );
}

/** Botón grande de acceso rápido (menú principal). */
export function Acceso({ titulo, icono, onPress, contador }: { titulo: string; icono: Icono; onPress: () => void; contador?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ flexBasis: "47%", flexGrow: 1, minHeight: 108, borderRadius: 16, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco,
        alignItems: "center", justifyContent: "center", gap: 10, padding: 10, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icono} size={26} color={C.marino} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: "700", color: C.texto, textAlign: "center" }}>{titulo}</Text>
      {contador ? <View style={{ position: "absolute", top: 10, right: 10, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.lima,
        alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "800", color: C.marino }}>{contador}</Text></View> : null}
    </Pressable>
  );
}

export const TEXTO_CHECK: Record<string, string> = {
  entrega_en_empaque_original: "Entregado en su empaque original (sin abrir)",
  ubicado_en_sitio: "Ubicado en el sitio que indicó el cliente",
  conexion_electrica: "Conexión eléctrica verificada",
  conexion_hidraulica: "Conexión hidráulica / drenaje",
  nivelacion: "Equipo nivelado",
  prueba_encendido: "Prueba de encendido OK",
  cajas: "Cajas de cartón retiradas",
  anime: "Anime retirado",
  plasticos: "Plásticos retirados",
  flejes: "Flejes retirados",
  precintos: "Precintos de seguridad retirados",
};
export const TEXTO_FOTO: Record<string, string> = { entrega: "Foto de la entrega", instalacion: "Foto del equipo instalado", espacio_limpio: "Foto del espacio limpio" };
export const RESIDUOS = ["cajas", "anime", "plasticos", "flejes", "precintos"];

export function tonoEstado(estado: string): "neutro" | "ok" | "alerta" | "error" | "lima" {
  if (estado === "completado") return "ok";
  if (estado === "cancelado") return "error";
  if (estado === "en_ruta") return "alerta";
  if (estado === "en_progreso") return "lima";
  return "neutro";
}

/** Campana del encabezado con el número de avisos sin leer (se actualiza cada 30 s). */
export function Campana() {
  const nav = useNav();
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let vivo = true;
    const ver = () => { require("./api").api("/notificaciones").then((l: { leida: boolean }[]) => vivo && setN(l.filter((x) => !x.leida).length)).catch(() => {}); };
    ver();
    const t = setInterval(ver, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, [nav.route]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Notificaciones${n ? `, ${n} sin leer` : ""}`} onPress={() => nav.push("notificaciones")}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="notifications-outline" size={23} color={C.blanco} />
      {n ? <View style={{ position: "absolute", top: 6, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.lima, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
        <Text style={{ fontSize: 11, fontWeight: "900", color: C.marino }}>{n > 9 ? "9+" : n}</Text></View> : null}
    </Pressable>
  );
}


/** Botón «Mi cuenta» del encabezado (cerrar sesión y eliminar la cuenta están dentro). */
export function BotonCuenta() {
  const nav = useNav();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Mi cuenta" onPress={() => nav.push("miCuenta")}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="person-circle-outline" size={26} color={C.blanco} />
    </Pressable>
  );
}
