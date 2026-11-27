import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { api, getServer } from "../api";
import { useNav } from "../nav";
import { useSession } from "../session";
import { MenuCliente, MenuTecnico } from "../menus";
import { ComunicacionDirecta } from "../fusion";
import { Aviso, Avatar, Boton, C, Campana, Campo, Pantalla, Tarjeta, Texto } from "../ui";

/** Mi perfil · Datos personales (AHA HOGAR v2): la cédula no se cambia desde la app. */
function DatosPersonales() {
  const { perfil, recargar } = useSession();
  const [f, setF] = useState({ nombre: perfil?.nombre ?? "", telefono: perfil?.telefono ?? "", email: perfil?.email ?? "" });
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const cambio = f.nombre !== perfil?.nombre || f.telefono !== perfil?.telefono || f.email !== (perfil?.email ?? "");
  async function guardar() {
    try { await api("/yo", { method: "PUT", body: f }); await recargar(); setMsg({ t: "Listo: tus datos quedaron actualizados.", ok: true }); }
    catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }
  return (
    <Tarjeta>
      <Campo etiqueta="Nombre y apellido" value={f.nombre} onChangeText={(v) => setF({ ...f, nombre: v })} />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.texto }}>Cédula</Text>
        <Text style={{ fontSize: 16, color: C.gris, paddingVertical: 10 }}>{perfil?.cedula || "—"}</Text>
        <Texto gris size={12}>No se cambia desde la app. Si hay un error, escribe a Soporte AHA HOME.</Texto>
      </View>
      <Campo etiqueta="Teléfono" value={f.telefono} onChangeText={(v) => setF({ ...f, telefono: v })} keyboardType="phone-pad" />
      <Campo etiqueta="Correo" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" />
      {msg ? <Aviso tono={msg.ok ? "ok" : "error"} texto={msg.t} /> : null}
      <Boton titulo="Guardar cambios" onPress={guardar} deshabilitado={!cambio || f.nombre.trim().length < 3} />
    </Tarjeta>
  );
}

/** Mi perfil · Contraseña y seguridad. */
export function Seguridad({ alCambiar }: { alCambiar?: () => void } = {}) {
  const [f, setF] = useState({ actual: "", nueva: "", repetir: "" });
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const reqs: [string, boolean][] = [["Al menos 8 caracteres", f.nueva.length >= 8], ["Una letra", /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(f.nueva)],
    ["Un número", /\d/.test(f.nueva)], ["Las dos coinciden", !!f.nueva && f.nueva === f.repetir]];
  async function cambiar() {
    try { await api("/yo/contrasena", { body: f }); setF({ actual: "", nueva: "", repetir: "" }); setMsg({ t: "Listo: tu contraseña quedó actualizada.", ok: true }); alCambiar?.(); }
    catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }
  return (
    <Tarjeta>
      <Campo etiqueta="Contraseña actual" value={f.actual} onChangeText={(v) => setF({ ...f, actual: v })} secureTextEntry />
      <Campo etiqueta="Contraseña nueva" value={f.nueva} onChangeText={(v) => setF({ ...f, nueva: v })} secureTextEntry />
      <Campo etiqueta="Repite la contraseña nueva" value={f.repetir} onChangeText={(v) => setF({ ...f, repetir: v })} secureTextEntry />
      <View style={{ gap: 4 }}>
        {reqs.map(([t, ok]) => (
          <View key={t} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={16} color={ok ? C.ok : C.gris} /><Text style={{ color: ok ? C.ok : C.gris, fontSize: 13 }}>{t}</Text>
          </View>
        ))}
      </View>
      {msg ? <Aviso tono={msg.ok ? "ok" : "error"} texto={msg.t} /> : null}
      <Boton titulo="Actualizar contraseña" onPress={cambiar} deshabilitado={!f.actual || !reqs.every(([, ok]) => ok)} />
    </Tarjeta>
  );
}

const ROL: Record<string, string> = { cliente: "Cliente", agente: "Agente en caja", tecnico: "Técnico", ayudante: "Ayudante",
  tecnico_supervisor: "Técnico supervisor", supervisor: "Supervisor", superadmin: "Superadministrador" };

/** Mi cuenta: datos, términos, privacidad, cerrar sesión y eliminar la cuenta (lo exigen Apple y Google). */
export default function MiCuenta() {
  const { perfil, salir } = useSession();
  const nav = useNav();
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<"datos" | "seguridad">("datos");

  async function eliminar() {
    try { await api("/yo/eliminar", { body: {} }); await salir(); } catch (e: any) { setError(e.message); }
  }

  if (!perfil) return null;
  return (
    <Pantalla titulo={perfil.rol === "tecnico" || perfil.rol === "ayudante" ? "Mi perfil" : "Mi cuenta"} derecha={<Campana />} abajo={perfil?.rol === "cliente" ? <MenuCliente activo="cuenta" /> : (perfil?.rol === "tecnico" || perfil?.rol === "ayudante") ? <MenuTecnico activo="perfil" /> : undefined}>
      <Tarjeta style={{ alignItems: "center" }}>
        <Avatar nombre={perfil.nombre} foto={perfil.foto ?? undefined} size={84} borde={C.lima} />
        <Texto negrita size={18}>{perfil.nombre}</Texto>
        <Texto gris>{ROL[perfil.rol] ?? perfil.rol}</Texto>
        {perfil.cedula ? <Texto gris>{perfil.cedula}</Texto> : null}
        <Texto gris>{[perfil.telefono, perfil.email].filter(Boolean).join(" · ")}</Texto>
      </Tarjeta>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: "#EEF2F7", borderRadius: 14, padding: 4 }}>
        {([["datos", "Datos personales"], ["seguridad", "Contraseña y seguridad"]] as const).map(([k, t]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: seccion === k }} onPress={() => setSeccion(k)}
            style={{ flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: seccion === k ? C.marino : "transparent" }}>
            <Text style={{ fontWeight: "800", fontSize: 13.5, color: seccion === k ? C.lima : C.marino }}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {seccion === "datos" ? <DatosPersonales /> : <Seguridad />}
      {perfil.rol === "tecnico" || perfil.rol === "ayudante" ? <ComunicacionDirecta /> : null}
      {perfil.rol === "tecnico" ? (
        <>
          <Boton titulo="Mis ayudantes" tipo="secundario" icono="people-outline" onPress={() => nav.push("ayudantes")} />
          <Boton titulo="Mis títulos y cursos" tipo="secundario" icono="school-outline" onPress={() => nav.push("formacion")} />
          <Boton titulo="Mi cuenta de pago" tipo="secundario" icono="card-outline" onPress={() => nav.push("cuentaPago")} />
        </>
      ) : null}
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
