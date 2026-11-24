import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import type { Orden } from "../../types";
import { aBs, fmtBs, type Moneda, monedaDe, MonedaToggle, MontoDual, precioDe, type ServicioArt, useMonedaCaja, usePreciosCaja, useTasa } from "../../components";
import { Aviso, Boton, C, Campo, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";
import { FRANJAS, proximosDias } from "../cliente/Reprogramar";

const OTRO = "Otro (no está en la tabla)";
type Art = { precio_id: number | null; cat: string; descripcion: string; marca: string; modelo: string; serial: string; instalar: boolean };
const nuevoArt = (): Art => ({ precio_id: null, cat: "", descripcion: "", marca: "", modelo: "", serial: "", instalar: false });

/** La caja Damasco registra al cliente y todo lo que compró, y cobra según la tabulación de precios del superadmin:
 *  traslado, instalación o los dos, por artículo exacto. Lo que no tiene precio todavía queda «por definir». */
export default function NuevaOrden() {
  const nav = useNav();
  const dias = proximosDias();
  const [c, setC] = useState({ nombre: "", telefono: "", direccion: "", referencia: "", numero_factura: "" });
  const [zona, setZona] = useState("Central");
  const [inmueble, setInmueble] = useState<"" | "casa" | "edificio" | "oficina">("");
  const [arts, setArts] = useState<Art[]>([nuevoArt()]);
  const [soloInst, setSoloInst] = useState(false);
  const [fecha, setFecha] = useState(dias[0].iso);
  const [franja, setFranja] = useState(FRANJAS[1]);
  const { inspeccion: costoInsp, items } = usePreciosCaja();
  const categorias = useMemo(() => [...new Set(items.map((i) => i.categoria))], [items]);
  const item = (a: Art) => items.find((x) => x.id === a.precio_id);
  const [metodos, setMetodos] = useState<{ id: string; texto: string }[]>([]);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [terminos, setTerminos] = useState(false);
  const [inspeccion, setInspeccion] = useState(false);
  const [residuos, setResiduos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<{ id: string; texto: string }[]>("/metodos-pago").then(setMetodos).catch(() => {});
  }, []);

  const aInstalar = arts.filter((a) => a.instalar);
  const servicioDe = (a: Art): ServicioArt => (soloInst ? "instalacion" : a.instalar ? "combo" : "traslado");
  const precioArt = (a: Art) => precioDe(item(a), servicioDe(a));
  const instalacion = arts.reduce((s, a) => s + (precioArt(a) ?? 0), 0);
  const conInsp = inspeccion && (aInstalar.length > 0 || soloInst);
  // Todo se cobra en caja, en el momento: la instalación y, si la pide, la inspección
  const total = instalacion + (conInsp ? costoInsp : 0);
  const { tasa } = useTasa();
  const [monedaGuardada, setMoneda] = useMonedaCaja();
  const moneda: Moneda = tasa?.bs_por_usd ? monedaGuardada : "USD";
  // la moneda sigue al método de pago, y el método se limpia si se cambia a la otra moneda
  const elegirMetodo = (id: string) => { setMetodo(id); setMoneda(monedaDe(id) as Moneda); };
  const cambiarMoneda = (mo: Moneda) => { setMoneda(mo); if (metodo && monedaDe(metodo) !== mo) setMetodo(null); };
  const cobroTexto = monedaDe(metodo) === "Bs" ? (aBs(total, tasa) !== null ? `Bs ${fmtBs(aBs(total, tasa)!)}` : "falta la tasa del día") : `USD ${fmtBs(total)}`;
  const porDefinir = arts.some((a) => precioArt(a) === null);
  const SERV_TXT: Record<ServicioArt, string> = { traslado: "Traslado", instalacion: "Instalación", combo: "Traslado + instalación" };
  const servicio = soloInst ? "Solo instalación" : aInstalar.length ? "Traslado e instalación" : "Traslado";
  const setArt = (i: number, k: keyof Art, v: any) => setArts(arts.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  async function crear() {
    setError(null); setCargando(true);
    try {
      const o = await api<Orden>("/ordenes", { body: {
        cliente_nombre: c.nombre, cliente_telefono: c.telefono, direccion: c.direccion, referencia: c.referencia, zona,
        articulos: arts.map((a) => ({ precio_id: a.precio_id, tipo: "otro", descripcion: a.descripcion, marca: a.marca, modelo: a.modelo, serial: a.serial,
          instalar: soloInst ? true : a.instalar })), solo_instalacion: soloInst,
        pago: total > 0 && metodo ? { metodo, referencia: ref } : null, numero_factura: c.numero_factura,
        fecha, franja, acepta_terminos: terminos, tipo_inmueble: inmueble, requiere_inspeccion: conInsp, retirar_residuos: residuos,
      } });
      nav.back();
      nav.push("ordenCaja", { id: o.id });
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  const listo = c.nombre && c.telefono && c.direccion && inmueble && terminos && arts.every((a) => a.precio_id || (a.cat === OTRO && a.descripcion)) && (total === 0 || metodo);

  return (
    <Pantalla titulo="Nueva orden" subtitulo={servicio}
      pie={<Boton titulo={total > 0 ? `Cobrar ${metodo ? cobroTexto : moneda === "Bs" && aBs(total, tasa) !== null ? `Bs ${fmtBs(aBs(total, tasa)!)}` : `USD ${fmtBs(total)}`} y generar QR` : "Generar orden y QR"} onPress={crear} cargando={cargando} deshabilitado={!listo} />}>
      <Tarjeta>
        <Seccion>CLIENTE</Seccion>
        <Campo etiqueta="Nombre y apellido" value={c.nombre} onChangeText={(v) => setC({ ...c, nombre: v })} />
        <Campo etiqueta="Teléfono (WhatsApp)" value={c.telefono} onChangeText={(v) => setC({ ...c, telefono: v })} keyboardType="phone-pad" />
        <Campo etiqueta="Dirección exacta" value={c.direccion} onChangeText={(v) => setC({ ...c, direccion: v })} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.texto }}>¿Dónde se instala?</Text>
        <Fila>
          {([["casa", "Casa", "home-outline"], ["edificio", "Edificio", "business-outline"], ["oficina", "Oficina", "briefcase-outline"]] as const).map(([k, t, ic]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: inmueble === k }} onPress={() => setInmueble(k)}
              style={{ flex: 1, minHeight: 64, borderRadius: 14, borderWidth: 2, borderColor: inmueble === k ? C.marino : C.borde,
                backgroundColor: inmueble === k ? C.limaSuave : C.blanco, alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Ionicons name={ic} size={22} color={C.marino} />
              <Text style={{ fontWeight: inmueble === k ? "900" : "700", color: C.marino, fontSize: 14 }}>{t}</Text>
            </Pressable>
          ))}
        </Fila>
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
            <Fila wrap>{[...categorias, OTRO].map((k) => <Opcion key={k} texto={k} activo={a.cat === k}
              onPress={() => setArts(arts.map((x, j) => (j === i ? { ...x, cat: k, precio_id: null } : x)))} />)}</Fila>
            {a.cat && a.cat !== OTRO ? <Fila wrap>{items.filter((x) => x.categoria === a.cat).map((x) => (
              <Opcion key={x.id} texto={x.nombre} activo={a.precio_id === x.id} onPress={() => setArt(i, "precio_id", x.id)} />))}</Fila> : null}
            {a.cat === OTRO ? <Campo etiqueta="¿Qué es?" value={a.descripcion} onChangeText={(v) => setArt(i, "descripcion", v)} placeholder="Ej. juego de comedor 6 puestos" /> : null}
            {a.precio_id || a.cat === OTRO ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: C.limaSuave, borderRadius: 10, padding: 10 }}>
                <Texto size={14}>{SERV_TXT[servicioDe(a)]}</Texto>
                <Texto negrita size={14}>{precioArt(a) !== null ? `USD ${fmtBs(precioArt(a)!)}` : "Precio por definir"}</Texto>
              </View>) : null}
            <Fila><View style={{ flex: 1 }}><Campo etiqueta="Marca" value={a.marca} onChangeText={(v) => setArt(i, "marca", v)} /></View>
              <View style={{ flex: 1 }}><Campo etiqueta="Modelo" value={a.modelo} onChangeText={(v) => setArt(i, "modelo", v)} /></View></Fila>
            <Campo etiqueta="Serial" value={a.serial} onChangeText={(v) => setArt(i, "serial", v)} />
            {!soloInst ? (
              <Pressable onPress={() => setArt(i, "instalar", !a.instalar)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                <Ionicons name={a.instalar ? "checkbox" : "square-outline"} size={26} color={C.marino} />
                <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>El cliente quiere instalación {precioDe(item(a), "combo") ? `(traslado + instalación USD ${fmtBs(precioDe(item(a), "combo")!)})` : "(precio por definir)"}</Text>
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
        <Pressable onPress={() => setResiduos(!residuos)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
          <Ionicons name={residuos ? "checkbox" : "square-outline"} size={26} color={C.marino} />
          <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>
            Retirar residuos para reciclar (cajas, anime, plásticos) · <Text style={{ fontWeight: "800" }}>opcional</Text>: desmárcalo si el cliente guarda el empaque por la garantía
          </Text>
        </Pressable>
      ) : null}
      {aInstalar.length || soloInst ? (
        <Pressable onPress={() => setInspeccion(!inspeccion)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
          <Ionicons name={inspeccion ? "checkbox" : "square-outline"} size={26} color={C.marino} />
          <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>El cliente pide inspección antes del retiro (el técnico visita y presupuesta materiales) · USD {costoInsp.toFixed(2)}</Text>
        </Pressable>
      ) : null}
      {(
        <Tarjeta>
          <Seccion>PAGO EN CAJA</Seccion>
          <MonedaToggle moneda={moneda} onCambiar={cambiarMoneda} tasa={tasa} />
          {instalacion > 0 ? <View><Texto>Servicio ({arts.filter((a) => precioArt(a) !== null).length} artículo(s), según la tabla de precios)</Texto><MontoDual usd={instalacion} tasa={tasa} moneda={moneda} /></View> : null}
          {porDefinir ? <Aviso tono="info" texto="Hay artículos con precio por definir en la tabla del superadmin: esos no se cobran por ahora." /> : null}
          {conInsp ? <View><Texto>Inspección</Texto><MontoDual usd={costoInsp} tasa={tasa} moneda={moneda} /></View> : null}
          {total > 0 ? (
            <>
              <Texto negrita size={14}>Total a cobrar</Texto>
              <MontoDual usd={total} tasa={tasa} size={24} negrita moneda={moneda} />
              <Texto negrita size={13}>Métodos en {moneda === "Bs" ? "bolívares" : "dólares"}</Texto>
              <Fila wrap>{metodos.filter((m) => monedaDe(m.id) === moneda).map((m) => <Opcion key={m.id} texto={m.texto} activo={metodo === m.id} onPress={() => elegirMetodo(m.id)} />)}</Fila>
              {metodo ? <Aviso tono="info" texto={`Se cobra en ${monedaDe(metodo) === "Bs" ? "bolívares" : "dólares"}: ${cobroTexto}`} /> : null}
              <Campo etiqueta="Referencia, lote o número de aprobación" value={ref} onChangeText={setRef} />
            </>
          ) : null}
        </Tarjeta>
      )}

      <Pressable onPress={() => setTerminos(!terminos)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
        <Ionicons name={terminos ? "checkbox" : "square-outline"} size={26} color={C.marino} />
        <Text style={{ flex: 1, fontSize: 15, color: C.texto }}>El cliente acepta los términos del servicio</Text>
      </Pressable>
      <Aviso texto={error} />
    </Pantalla>
  );
}
