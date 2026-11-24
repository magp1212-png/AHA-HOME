import React, { useCallback, useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

import { api } from "../../api";
import { Aviso, Boton, C, Cargando, Pantalla, QR, Tarjeta, Texto } from "../../ui";

type Tienda = { id: number; nombre: string; zona: string; direccion: string; qr: string | null };

/** Superadmin: el QR fijo de cada tienda Damasco. Se imprime y se pega en caja; el técnico lo escanea al llegar. */
export default function TiendasQR() {
  const [ts, setTs] = useState<Tienda[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => { try { setTs(await api<Tienda[]>("/admin/tiendas-qr")); } catch (e: any) { setError(e.message); } }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const generar = async (t: Tienda) => {
    if (t.qr && Platform.OS === "web" && !window.confirm(`¿Cambiar el QR de ${t.nombre}? El impreso actual dejará de servir.`)) return;
    try { await api(`/admin/tiendas/${t.id}/qr`, { body: {} }); cargar(); } catch (e: any) { setError(e.message); }
  };
  return (
    <Pantalla titulo="QR de las tiendas" subtitulo="Para el retiro con OK de caja">
      <Texto gris size={14}>Imprime el QR y pégalo en la caja. El técnico lo escanea al llegar: la caja ve lo que va a retirar y autoriza con un OK.</Texto>
      <Aviso texto={error} />
      {ts === null ? <Cargando /> : null}
      {ts?.map((t) => (
        <Tarjeta key={t.id}>
          <Text style={{ fontWeight: "900", fontSize: 17, color: C.texto }}>{t.nombre}</Text>
          <Texto gris size={13}>{t.zona} · {t.direccion}</Texto>
          {t.qr ? (
            <View style={{ alignItems: "center", gap: 6, paddingVertical: 8 }}>
              <QR valor={t.qr} size={220} />
              <Text style={{ fontWeight: "900", color: C.marino, fontSize: 15 }}>AHA HOME · {t.nombre}</Text>
              <Text style={{ color: C.gris, fontSize: 11 }}>{t.qr}</Text>
            </View>
          ) : <Aviso tono="info" texto="Esta tienda todavía no tiene QR." />}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Boton titulo={t.qr ? "Cambiar QR" : "Generar QR"} tipo={t.qr ? "secundario" : "lima"} icono="qr-code" onPress={() => generar(t)} /></View>
            {t.qr && Platform.OS === "web" ? <View style={{ flex: 1 }}><Boton titulo="Imprimir" tipo="secundario" icono="print" onPress={() => window.print()} /></View> : null}
          </View>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
