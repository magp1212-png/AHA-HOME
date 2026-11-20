import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";

import { api, setToken, subirFoto } from "../api";
import { biometriaDisponible, confirmarIdentidad } from "../biometria";
import { tomarFoto } from "../photo";
import { useSession } from "../session";
import type { Perfil } from "../types";
import { Aviso, Boton, C, Campo, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../ui";

type Tienda = { id: number; nombre: string };

/** Registro del técnico o ayudante en la app: datos, escaneo facial, foto con la cédula en alto y huella.
 *  Luego la oficina completa su expediente y le da el alta con su grupo. */
export default function RegistroTecnico() {
  const { entrar } = useSession();
  const [paso, setPaso] = useState(1);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [f, setF] = useState({ nombre: "", cedula: "", telefono: "", email: "", password: "", pin: "", rol: "tecnico", tienda_id: 0 });
  const [cuenta, setCuenta] = useState<{ token: string; usuario: Perfil } | null>(null);
  const [rostro, setRostro] = useState<{ uri: string; url: string } | null>(null);
  const [selfie, setSelfie] = useState<{ uri: string; url: string } | null>(null);
  const [huella, setHuella] = useState(false);
  const [bio, setBio] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const set = (k: keyof typeof f) => (v: any) => setF({ ...f, [k]: v });

  useEffect(() => {
    api<Tienda[]>("/tiendas").then((t) => { setTiendas(t); if (t.length === 1) setF((x) => ({ ...x, tienda_id: t[0].id })); }).catch(() => {});
    biometriaDisponible().then(setBio);
  }, []);

  async function crearCuenta() {
    setError(null); setCargando(true);
    try {
      const r = await api<{ token: string; usuario: Perfil }>("/tecnico/registro", { body: f });
      setToken(r.token); setCuenta(r); setPaso(2);
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  async function foto(cual: "rostro" | "selfie") {
    setError(null);
    const r = await tomarFoto({ frontal: true });
    if (!r) return;
    if ("error" in r) { setError(r.error); return; }
    setCargando(true);
    try {
      const url = await subirFoto(r.base64);
      if (cual === "rostro") { setRostro({ uri: r.uri, url }); setPaso(3); } else { setSelfie({ uri: r.uri, url }); setPaso(4); }
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  async function registrarHuella() {
    setError(null);
    if (await confirmarIdentidad("Registra tu huella para AHA HOME")) setHuella(true);
    else setError("No se pudo leer tu huella. Revisa que esté configurada en tu teléfono.");
  }

  async function terminar() {
    if (!cuenta || !rostro || !selfie) return;
    setError(null); setCargando(true);
    try {
      await api("/tecnico/onboarding", { body: { foto_rostro: rostro.url, selfie_cedula: selfie.url, huella_registrada: huella } });
      await entrar(cuenta.token, cuenta.usuario);
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Registro de técnico" subtitulo={`Paso ${paso} de 4`}>
      {paso === 1 ? (
        <Tarjeta>
          <Seccion>TUS DATOS</Seccion>
          <Fila><Opcion texto="Técnico" activo={f.rol === "tecnico"} onPress={() => set("rol")("tecnico")} />
            <Opcion texto="Ayudante" activo={f.rol === "ayudante"} onPress={() => set("rol")("ayudante")} /></Fila>
          <Campo etiqueta="Nombre y apellido" value={f.nombre} onChangeText={set("nombre")} />
          <Campo etiqueta="Número de cédula" value={f.cedula} onChangeText={set("cedula")} placeholder="V-12.345.678" autoCapitalize="characters" />
          <Campo etiqueta="Teléfono" value={f.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" />
          <Campo etiqueta="Correo" value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
          <Campo etiqueta="Contraseña (mínimo 6)" value={f.password} onChangeText={set("password")} secureTextEntry />
          <Campo etiqueta="PIN personal (4 a 8 números)" value={f.pin} onChangeText={set("pin")} keyboardType="number-pad" secureTextEntry maxLength={8} />
          <Seccion>TIENDA DONDE TRABAJARÁS</Seccion>
          <Fila wrap>{tiendas.map((t) => <Opcion key={t.id} texto={t.nombre} activo={f.tienda_id === t.id} onPress={() => set("tienda_id")(t.id)} />)}</Fila>
          <Aviso texto={error} />
          <Boton titulo="Continuar" onPress={crearCuenta} cargando={cargando}
            deshabilitado={!f.nombre || !f.cedula || !f.telefono || !f.email || f.password.length < 6 || f.pin.length < 4 || !f.tienda_id} />
        </Tarjeta>
      ) : null}

      {paso === 2 ? (
        <Tarjeta>
          <Seccion>ESCANEO FACIAL</Seccion>
          <Texto>Toma una foto de tu cara de frente, con buena luz, sin lentes oscuros ni gorra.</Texto>
          <Aviso texto={error} />
          <Boton titulo="Tomar foto de mi cara" icono="scan" onPress={() => foto("rostro")} cargando={cargando} />
        </Tarjeta>
      ) : null}

      {paso === 3 ? (
        <Tarjeta>
          <Seccion>TU CARA CON LA CÉDULA EN ALTO</Seccion>
          <Texto>Sostén tu cédula a la altura del pecho, con la foto y el número bien visibles.</Texto>
          {rostro ? <Image source={{ uri: rostro.uri }} style={{ width: 90, height: 90, borderRadius: 45 }} /> : null}
          <Aviso texto={error} />
          <Boton titulo="Tomar foto con mi cédula" icono="id-card" onPress={() => foto("selfie")} cargando={cargando} />
        </Tarjeta>
      ) : null}

      {paso === 4 ? (
        <Tarjeta>
          <Seccion>HUELLA</Seccion>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {rostro ? <Image source={{ uri: rostro.uri }} style={{ width: 80, height: 80, borderRadius: 12 }} /> : null}
            {selfie ? <Image source={{ uri: selfie.uri }} style={{ width: 80, height: 80, borderRadius: 12 }} /> : null}
          </View>
          {bio ? (
            <>
              <Texto>Pon tu dedo en el lector. Tu huella se queda en tu teléfono: AHA HOME solo guarda que la registraste.</Texto>
              {huella ? <Aviso texto="Huella registrada" tono="ok" /> : <Boton titulo="Registrar mi huella" icono="finger-print" onPress={registrarHuella} />}
            </>
          ) : <Aviso tono="info" texto="Este teléfono no tiene huella ni rostro configurado. Actívalo en los ajustes del teléfono y vuelve a este paso." />}
          <Aviso texto={error} />
          <Boton titulo="Enviar mi registro" tipo="exito" onPress={terminar} cargando={cargando} deshabilitado={!huella} />
          <Texto gris size={13}>Después pasa por la oficina: te tomarán la foto de perfil, copia de tu cédula, licencia y documentos del vehículo, y te darán el alta con tu grupo.</Texto>
        </Tarjeta>
      ) : null}
      <View style={{ height: 1, backgroundColor: C.linea }} />
    </Pantalla>
  );
}
