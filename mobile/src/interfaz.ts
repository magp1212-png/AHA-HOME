// Diseño de la app controlado desde el panel (superad.aha-go.com › Diseño): colores, textos de la portada,
// menús de cada perfil y un aviso para todos. Se descarga al abrir la app; si no hay conexión, quedan los de fábrica.
import { useEffect, useState } from "react";

import { api } from "./api";
import { C } from "./ui";

export type ItemMenu = { id: string; texto: string; visible: boolean };
export type Interfaz = {
  version: number;
  marca: { nombre: string; eslogan: string; colores: { marino: string; lima: string; naranja: string; fondo: string } };
  portada: { titulo: string; subtitulo: string; pasos: { titulo: string; detalle: string }[]; boton_crear: string; boton_entrar: string };
  menus: Record<"cliente" | "cliente_lateral" | "tecnico", ItemMenu[]>;
  aviso: { activo: boolean; texto: string; tono: "info" | "ok" | "alerta"; para: string[] };
};

let actual: Interfaz | null = null;
const oyentes = new Set<(i: Interfaz | null) => void>();

function aplicar(i: Interfaz) {
  actual = i;
  const c = i.marca?.colores;
  if (c) Object.assign(C, { marino: c.marino, lima: c.lima, naranja: c.naranja, fondo: c.fondo });
  oyentes.forEach((f) => f(i));
}

/** Se llama al abrir la app. Espera como máximo 2,5 s para no demorar la entrada. */
export async function cargarInterfaz() {
  try {
    const i = await Promise.race([api<Interfaz>("/interfaz"), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
    if (i) aplicar(i);
  } catch { /* sin conexión: diseño de fábrica */ }
}

export function useInterfaz() {
  const [i, setI] = useState<Interfaz | null>(actual);
  useEffect(() => { oyentes.add(setI); return () => { oyentes.delete(setI); }; }, []);
  return i;
}

/** Ordena, renombra y oculta los botones de un menú según el panel. Los que no estén en el panel quedan igual. */
export function segunPanel<T extends { id: string; texto: string }>(menu: keyof Interfaz["menus"], items: T[], i: Interfaz | null = actual): T[] {
  const conf = i?.menus?.[menu];
  if (!conf) return items;
  const por = new Map(items.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const c of conf) {
    const it = por.get(c.id);
    if (it && c.visible) out.push({ ...it, texto: c.texto || it.texto });
    por.delete(c.id);
  }
  return out.concat([...por.values()]);
}

