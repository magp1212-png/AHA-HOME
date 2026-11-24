import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api, subirFoto } from "../../api";
import { DetallePresupuesto, QuienCompra } from "../../components";
import { useNav } from "../../nav";
import { tomarFoto } from "../../photo";
import type { Orden } from "../../types";
import { Aviso, Boton, C, Campo, Cargando, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

type Item = { tipo: "material" | "mano_obra"; descripcion: string; cantidad: string; precio: string };
const vacio = (tipo: Item["tipo"]): Item => ({ tipo, descripcion: "", cantidad: "1", precio: "" });
const num = (s: string) => Number((s || "0").replace(",", "."));

/** Inspección: el técnico escribe el presupuesto (materiales + mano de obra) y lo envía al control y al cliente. */
export default function PresupuestoTecnico({ id }: { id: number }) {
  const nav = useNav();
  const [o, setO] = useState<Orden | null>(null);
  const [items, setItems] = useState<Item[]>([vacio("material"), vacio("mano_obra")]);
  const [notas, setNotas] = useState("");
  const [compra, setCompra] = useState<"tecnico" | "cliente">("tecnico");
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => { api<Orden>(`/ordenes/${id}`).then(setO).catch((e) => setError(e.message)); }, [id]);

  const set = (i: number, k: keyof Item, v: string) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const validos = items.filter((x) => x.descripcion.trim().length >= 2 && num(x.cantidad) > 0 && x.precio !== "");
  const total = validos.reduce((s, x) => s + num(x.cantidad) * num(x.precio), 0);
  const mat = validos.filter((x) => x.tipo === "material").reduce((s, x) => s + num(x.cantidad) * num(x.precio), 0);

  async function foto() {
    const r = await tomarFoto();
    if (!r || "error" in r) return;
    try { setFotos([...fotos, await subirFoto(r.base64)]); } catch (e: any) { setError(e.message); }
  }

  async function enviar() {
    setCargando(true); setError(null);
    try {
      await api(`/tecnico/ordenes/${id}/presupuesto`, { body: {
        items: validos.map((x) => ({ tipo: x.tipo, descripcion: x.descripcion, cantidad: num(x.cantidad), precio: num(x.precio) })), notas, fotos,
        materiales_compra: compra } });
      nav.back();
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  if (!o) return <Pantalla titulo="Presupuesto">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  if (o.presupuesto) {
    return (
      <Pantalla titulo={`Presupuesto · ${o.codigo}`}>
        <Tarjeta><DetallePresupuesto p={o.presupuesto} /></Tarjeta>
        <Texto gris size={14}>Cuando el cliente y AHA HOME lo aprueben, el cliente pague y te paguemos los materiales, te avisamos para retirar e instalar.</Texto>
      </Pantalla>
    );
  }
  return (
    <Pantalla titulo={`Presupuesto · ${o.codigo}`} subtitulo={o.cliente.direccion}
      pie={<Boton titulo={`Enviar presupuesto · USD ${total.toFixed(2)}`} onPress={enviar} cargando={cargando} deshabilitado={!validos.length} />}>
      <Texto gris size={14}>Después de inspeccionar, escribe los materiales y la mano de obra. Lo aprueban el cliente y AHA HOME; los materiales te los pagamos a tu cuenta registrada.</Texto>
      {items.map((x, i) => (
        <Tarjeta key={i}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Fila>
              <Opcion texto="Material" activo={x.tipo === "material"} onPress={() => set(i, "tipo", "material")} />
              <Opcion texto="Mano de obra" activo={x.tipo === "mano_obra"} onPress={() => set(i, "tipo", "mano_obra")} />
            </Fila>
            {items.length > 1 ? <Pressable accessibilityLabel="Quitar" onPress={() => setItems(items.filter((_, j) => j !== i))} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={20} color={C.error} /></Pressable> : null}
          </View>
          <Campo etiqueta="Descripción" value={x.descripcion} onChangeText={(v) => set(i, "descripcion", v)}
            placeholder={x.tipo === "material" ? "Ej. tubería de cobre 3 m" : "Ej. instalación del split"} />
          <Fila>
            <View style={{ flex: 1 }}><Campo etiqueta="Cantidad" value={x.cantidad} onChangeText={(v) => set(i, "cantidad", v)} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Campo etiqueta="Precio unitario (USD)" value={x.precio} onChangeText={(v) => set(i, "precio", v)} keyboardType="decimal-pad" /></View>
          </Fila>
        </Tarjeta>
      ))}
      <Fila>
        <View style={{ flex: 1 }}><Boton titulo="+ Material" tipo="secundario" onPress={() => setItems([...items, vacio("material")])} /></View>
        <View style={{ flex: 1 }}><Boton titulo="+ Mano de obra" tipo="secundario" onPress={() => setItems([...items, vacio("mano_obra")])} /></View>
      </Fila>
      <Tarjeta>
        <Seccion>NOTAS Y FOTOS DE LA INSPECCIÓN</Seccion>
        <Campo etiqueta="Notas para el cliente y el control" value={notas} onChangeText={setNotas} multiline />
        <Boton titulo={`Agregar foto (${fotos.length})`} tipo="secundario" icono="camera" onPress={foto} />
        <Text style={{ color: C.gris }}>Materiales USD {mat.toFixed(2)} · Mano de obra USD {(total - mat).toFixed(2)}</Text>
      </Tarjeta>
      {mat > 0 ? (
        <Tarjeta>
          <QuienCompra valor={compra} onCambiar={setCompra} paraTecnico />
          <Texto gris size={13}>Es una sugerencia: el cliente puede cambiarla al aceptar.</Texto>
          <Text style={{ fontWeight: "800", color: C.texto }}>
            El cliente paga USD {(compra === "cliente" ? total - mat : total).toFixed(2)}{compra === "cliente" ? " (solo mano de obra)" : ""}
          </Text>
        </Tarjeta>
      ) : null}
      <Aviso texto={error} />
    </Pantalla>
  );
}
