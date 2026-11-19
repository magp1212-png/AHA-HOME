// Menú fijo abajo y menú ☰ del cliente y del técnico (diseño aprobado).
import React from "react";

import { useNav } from "./nav";
import { useSession } from "./session";
import { MenuHamburguesa, MenuInferior, useAvisos } from "./ui";

export function MenuCliente({ activo }: { activo: "inicio" | "pedidos" | "avisos" | "cuenta" }) {
  const nav = useNav();
  const avisos = useAvisos();
  return (
    <MenuInferior items={[
      { icono: activo === "inicio" ? "home" : "home-outline", texto: "Inicio", activo: activo === "inicio", onPress: () => nav.reset("cliente") },
      { icono: "receipt-outline", texto: "Mis pedidos", activo: activo === "pedidos", onPress: () => activo !== "pedidos" && nav.push("misPedidos") },
      { icono: "notifications-outline", texto: "Avisos", activo: activo === "avisos", aviso: avisos, onPress: () => activo !== "avisos" && nav.push("notificaciones") },
      { icono: "person-outline", texto: "Mi cuenta", activo: activo === "cuenta", onPress: () => activo !== "cuenta" && nav.push("miCuenta") },
    ]} />
  );
}

export function HamburguesaCliente() {
  const nav = useNav();
  const { salir } = useSession();
  return (
    <MenuHamburguesa opciones={[
      { icono: "home-outline", texto: "Inicio", onPress: () => nav.reset("cliente") },
      { icono: "receipt-outline", texto: "Mis pedidos", onPress: () => nav.push("misPedidos") },
      { icono: "notifications-outline", texto: "Avisos", onPress: () => nav.push("notificaciones") },
      { icono: "person-outline", texto: "Mi cuenta", onPress: () => nav.push("miCuenta") },
      { icono: "log-out-outline", texto: "Cerrar sesión", onPress: salir, peligro: true },
    ]} />
  );
}

export function MenuTecnico({ activo }: { activo: "inicio" | "ordenes" | "mapa" | "perfil" }) {
  const nav = useNav();
  return (
    <MenuInferior items={[
      { icono: activo === "inicio" ? "home" : "home-outline", texto: "Inicio", activo: activo === "inicio", onPress: () => nav.reset("tecnico") },
      { icono: "document-text-outline", texto: "Órdenes", activo: activo === "ordenes", onPress: () => activo !== "ordenes" && nav.push("ordenesTecnico") },
      { icono: "location-outline", texto: "Mapa", activo: activo === "mapa", onPress: () => activo !== "mapa" && nav.push("mapaTecnico") },
      { icono: "person-outline", texto: "Perfil", activo: activo === "perfil", onPress: () => activo !== "perfil" && nav.push("perfilTecnico") },
    ]} />
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
        { icono: "card-outline" as const, texto: "Mi cuenta de pago", onPress: () => nav.push("cuentaPago") },
      ] : []),
      { icono: "person-outline", texto: "Mi perfil", onPress: () => nav.push("perfilTecnico") },
      { icono: "log-out-outline", texto: "Cerrar sesión", onPress: salir, peligro: true },
    ]} />
  );
}
