import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import type { Orden } from "../../types";
import { Aviso, Boton, C, Campo, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";
import { FRANJAS, proximosDias } from "../cliente/Reprogramar";

const TIPOS: [string, string][] = [["nevera", "Nevera"], ["lavadora", "Lavadora"], ["secadora", "Secadora"], ["aire_acondicionado", "Aire acond."],
  ["cocina", "Cocina"], ["televisor", "Televisor"], ["otro", "Otro"]];
type Art = { tipo: string; descripcion: string; marca: string; modelo: string; serial: string; instalar: boolean };
const nuevoArt = (): Art => ({ tipo: "nevera", descripcion: "", marca: "", modelo: "", serial: "", instalar: false });

/** La caja Damasco registra al cliente y todo lo que compró. Todo se traslada; se instala solo lo que el cliente marca y paga aquí. */
export default function NuevaOrden() {
  const nav = useNav();
  const dias = proximosDias();
  const [c, setC] = useState({ nombre: "", telefono: "", direccion: "", referencia: "", numero_factura: "" });
  const [zona, setZona] = useState("Central");
  const [arts, setArts] = useState<Art[]>([nuevoArt()]);
  const [soloInst, setSoloInst] = useState(false);
  const [fecha, setFecha] = useState(dias[0].iso);
  const [franja, setFranja] = useState(FRANJAS[1]);
  const [tarifas, setTarifas] = useState<Record<string, number>>({});
  const [metodos, setMetodos] = useState<{ id: string; texto: string }[]>([]);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [terminos, setTerminos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<{ tipo: string; precio: string }[]>("/tarifas").then((t) => setTarifas(Object.fromEntries(t.map((x) => [x.tipo, Number(x.precio)])))).catch(() => {});
    api<{ id: string; texto: string }[]>("/metodos-pago").then(setMetodos).catch(() => {});
  }, []);

  const aInstalar = arts.filter((a) => a.instalar);
  const total = useMemo(() => aInstalar.reduce((s, a) => s + (tarifas[a.tipo] ?? 0), 0), [aInstalar, tarifas]);
  const porDefinir = aInstalar.some((a) => !tarifas[a.tipo]);
  const servicio = soloInst ? "Solo instalación" : aInstalar.length ? "Traslado e instalación" : "Traslado";
  const setArt = (i: number, k: keyof Art, v: any) => setArts(arts.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  async function crear() {
    setError(null); setCargando(true);
    try {
      const o = await api<Orden>("/ordenes", { body: {
        cliente_nombre: c.nombre, cliente_telefono: c.telefono, direccion: c.direccion, referencia: c.referencia, zona,
        articulos: arts.map((a) => ({ ...a, instalar: soloInst ? true : a.instalar })), solo_instalacion: soloInst,
        pago: total > 0 && metodo ? { metodo, referencia: ref } : null, numero_factura: c.numero_factura,
        fecha, franja, acepta_terminos: terminos,
      } });
      nav.back();
      nav.push("ordenCaja", { id: o.id });
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  const listo = c.nombre && c.telefono && c.direccion && terminos && arts.every((a) => a.tipo !== "otro" || a.descripcion) && (total === 0 || metodo);

  return (
    <Pantalla titulo="Nueva orden" subtitulo={servicio}
      pie={<Boton titulo={total > 0 ? `Cobrar USD ${total.toFixed(2)} y generar QR` : "Generar orden y QR"} onPress={crear} cargando={cargando} deshabilitado={!listo} />}>
      <Tarjeta>
        <Seccion>CLIENTE</Seccion>
        <Campo etiqueta="Nombre y apellido" value={c.nombre} onChangeText={(v) => setC({ ...c, nombre: v })} />
        <Campo etiqueta="Teléfono (WhatsApp)" value={c.telefono} onChangeText={(v) => setC({ ...c, telefono: v })} keyboardType="phone-pad" />
        <Campo etiqueta="Dirección exacta" value={c.direccion} onChangeText={(v) => setC({ ...c, direccion: v })} />
        <Campo etiqueta="Punto de referencia" value={c.referencia} onChangeText={(v) => setC({ ...c, referencia: v })} />
        <Fila>{["Oeste", "Central", "Este"].map((z) => <Opcion key={z} texto={z} activo={zona === z} onPress={() => setZona(z)} />)}</Fila>
        <Campo etiqueta="N.º de factura Damasco" value={c.numero_factura} onChangeText={(v) => setC({ ...c, numero_factura: v })} />
      </Tarjeta>

      <Tarjeta>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Seccion>ARTÍCULOS ({arts.length})</Seccion>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 13, color: C.gris }}>Solo instalación</Text>
            <Switch value={soloInst} onValueChange={setSoloInst} trackColor={{ true: C.marino }} />
          </View>
        </View>
        {soloInst ? <Aviso tono="info" texto="El cliente ya tiene los artículos en casa: no se retira nada en el almacén." /> : null}
        {arts.map((a, i) => (
          <View key={i} style={{ borderWidth: 1, borderColor: C.linea, borderRadius: 14, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800", color: C.texto }}>Artículo {i + 1}</Text>
              {arts.length > 1 ? <Pressable accessibilityLabel="Quitar artículo" onPress={() => setArts(arts.filter((_, j) => j !== i))} style={{ padding: 8 }}>
                <Ionicons name="trash-outline" size={20} color={C.error} /></Pressable> : null}
            </View>
            <Fila wrap>{TIPOS.map(([k, t]) => <Opcion key={k} texto={t} activo={a.tipo === k} onPress={() => setArt(i, "tipo", k)} />)}</Fila>
            {a.tipo === "otro" ? <Campo etiqueta="¿Qué es?" value={a.descripcion} onChangeText={(v) => setArt(i, "descripcion", v)} placeholder="Ej. juego de comedor 6 puestos" /> : null}
            <Fila><View style={{ flex: 1 }}><Campo etiqueta="Marca" value={a.marca} onChangeText={(v) => setArt(i, "marca", v)} /></View>
              <View style={{ flex: 1 }}><Campo etiqueta="Modelo" value={a.modelo} onChangeText={(v) => setArt(i, "modelo", v)} /></View></Fila>
            <Campo etiqueta="Serial" value={a.serial} onChangeText={(v) => setArt(i, "serial", v)} />
            {!soloInst ? (
              <Pressable onPress={() => setArt(i, "instalar", !a.instalar)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                <Ionicons name={a.instalar ? "checkbox" : "square-outline"} size={26} color={C.marino} />
                <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>El cliente quiere instalación {tarifas[a.tipo] ? `(USD ${tarifas[a.tipo].toFixed(2)})` : "(precio por definir)"}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Boton titulo="Agregar otro artículo" tipo="secundario" icono="add" onPress={() => setArts([...arts, nuevoArt()])} />
      </Tarjeta>

      <Tarjeta>
        <Seccion>CITA</Seccion>
        <Fila wrap>{dias.map((d) => <Opcion key={d.iso} texto={d.texto} activo={fecha === d.iso} onPress={() => setFecha(d.iso)} />)}</Fila>
        <Fila wrap>{FRANJAS.map((f) => <Opcion key={f} texto={f.replace("-", " – ")} activo={franja === f} onPress={() => setFranja(f)} />)}</Fila>
      </Tarjeta>

      {aInstalar.length || soloInst ? (
        <Tarjeta>
          <Seccion>PAGO DE LA INSTALACIÓN</Seccion>
          {porDefinir || total === 0 ? <Aviso tono="info" texto="Precio de instalación por definir: no se cobra por ahora." /> : (
            <>
              <Texto negrita size={20}>Total: USD {total.toFixed(2)}</Texto>
              <Fila wrap>{metodos.map((m) => <Opcion key={m.id} texto={m.texto} activo={metodo === m.id} onPress={() => setMetodo(m.id)} />)}</Fila>
              <Campo etiqueta="Referencia, lote o número de aprobación" value={ref} onChangeText={setRef} />
            </>
          )}
        </Tarjeta>
      ) : null}

      <Pressable onPress={() => setTerminos(!terminos)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
        <Ionicons name={terminos ? "checkbox" : "square-outline"} size={26} color={C.marino} />
        <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>El cliente acepta los términos del servicio</Text>
      </Pressable>
      <Aviso texto={error} />
    </Pantalla>
  );
}
