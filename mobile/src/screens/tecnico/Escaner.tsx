import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import { Platform, View } from "react-native";

import { api } from "../../api";
import { useNav } from "../../nav";
import type { Orden } from "../../types";
import { Aviso, Boton, C, Campo, Pantalla, Tarjeta, Texto } from "../../ui";

/** Retiro en almacén: lee el QR de la orden. El servidor valida que sea el técnico asignado y registra el retiro. */
export default function Escaner() {
  const nav = useNav();
  const [perm, pedirPerm] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Orden | null>(null);
  const ocupado = useRef(false);

  async function enviar(qr: string) {
    if (ocupado.current) return;
    ocupado.current = true; setError(null);
    try { setHecho(await api<Orden>("/tecnico/retiro", { body: { qr } })); } catch (e: any) { setError(e.message); ocupado.current = false; }
  }

  if (hecho) {
    return (
      <Pantalla titulo="Retiro registrado">
        <Aviso tono="ok" texto={`Retiro validado: ${hecho.codigo}. El cliente ya recibió tu foto y va en camino su pedido.`} />
        <Tarjeta>{hecho.articulos.map((a) => <Texto key={a.id}>• {a.nombre} {a.modelo} {a.serial ? `· serial ${a.serial}` : ""}</Texto>)}</Tarjeta>
        <Boton titulo="Salir en ruta" icono="car" onPress={nav.back} />
      </Pantalla>
    );
  }

  return (
    <Pantalla titulo="Escanear QR de retiro" fondo={C.marino}>
      {Platform.OS !== "web" && perm?.granted ? (
        <View style={{ height: 320, borderRadius: 24, overflow: "hidden", borderWidth: 4, borderColor: C.lima }}>
          <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(r) => enviar(r.data)} />
        </View>
      ) : null}
      {Platform.OS !== "web" && !perm?.granted ? <Boton titulo="Permitir la cámara" tipo="lima" onPress={pedirPerm} /> : null}
      <Aviso texto={error} />
      <Tarjeta>
        <Texto gris size={13}>¿La cámara no lee el código? Escríbelo tal como aparece debajo del QR.</Texto>
        <Campo etiqueta="Código" value={manual} onChangeText={setManual} autoCapitalize="none" />
        <Boton titulo="Validar código" onPress={() => { ocupado.current = false; enviar(manual); }} deshabilitado={!manual} />
      </Tarjeta>
    </Pantalla>
  );
}
