import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";

import { api, setToken, subirFoto } from "../api";
import { biometriaDisponible, confirmarIdentidad } from "../biometria";
import { tomarFoto } from "../photo";
import { useSession } from "../session";
import type { Perfil } from "../types";
import { Aviso, Boton, C, Campo, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../ui";

type Tienda = { id: number; nombre: string };

type Verificacion = { disponible: boolean; coincide: boolean | null; nivel?: string; similitud?: number; cedula_visible?: boolean; cedula_coincide?: boolean | null; motivo: string };

/** Registro del técnico o ayudante en la app: datos, foto con la cédula en el pecho, escaneo facial de verificación
 *  (el servidor compara las dos caras y tienen que coincidir) y huella.
 *  Luego la oficina completa su expediente y le da el alta con su grupo. */
export default function RegistroTecnico() {
  const { entrar } = useSession();
  const [paso, setPaso] = useState(1);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [f, setF] = useState({ nombre: "", cedula: "", telefono: "", email: "", password: "", pin: "", rol: "tecnico", tienda_id: 0, conduce: false, instala: true });
  const [cuenta, setCuenta] = useState<{ token: string; usuario: Perfil } | null>(null);
  const [rostro, setRostro] = useState<{ uri: string; url: string } | null>(null);
  const [selfie, setSelfie] = useState<{ uri: string; url: string } | null>(null);
  const [huella, setHuella] = useState(false);
  const [verif, setVerif] = useState<Verificacion | null>(null);
  const [analizando, setAnalizando] = useState(false);
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
      if (cual === "selfie") { setSelfie({ uri: r.uri, url }); setRostro(null); setVerif(null); setPaso(3); }
      else { setRostro({ uri: r.uri, url }); await analizar(url); }
    } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  /** El servidor compara la cara de la foto con la cédula con la del escaneo. */
  async function analizar(urlRostro: string) {
    if (!selfie) return;
    setAnalizando(true); setVerif(null);
    try { setVerif(await api<Verificacion>("/tecnico/verificar-rostro", { body: { selfie_cedula: selfie.url, foto_rostro: urlRostro } })); }
    catch (e: any) { setError(e.message); }
    setAnalizando(false);
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
    <Pantalla titulo="Registro de técnico" subtitulo={`Paso ${paso} de 4 · ${["Tus datos", "Foto con tu cédula", "Verificación facial", "Huella"][paso - 1]}`}>
      {paso === 1 ? (
        <Tarjeta>
          <Seccion>TUS DATOS</Seccion>
          <Fila><Opcion texto="Técnico" activo={f.rol === "tecnico"} onPress={() => set("rol")("tecnico")} />
            <Opcion texto="Ayudante" activo={f.rol === "ayudante"} onPress={() => set("rol")("ayudante")} /></Fila>
          {f.rol === "tecnico" ? (
            <>
              <Seccion>¿QUÉ HACES?</Seccion>
              <Texto gris size={13}>Elige una o las dos. Tendrás un solo perfil.</Texto>
              <Fila wrap>
                <Opcion texto="🚚 Conductor" activo={f.conduce && !f.instala} onPress={() => setF({ ...f, conduce: true, instala: false })} />
                <Opcion texto="🔧 Instalador" activo={f.instala && !f.conduce} onPress={() => setF({ ...f, conduce: false, instala: true })} />
                <Opcion texto="Ambas" activo={f.conduce && f.instala} onPress={() => setF({ ...f, conduce: true, instala: true })} />
              </Fila>
            </>
          ) : <Texto gris size={13}>Si tu profesional ya te registró como su ayudante, usa el mismo teléfono o correo que le diste.</Texto>}
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
          <Seccion>FOTO CON TU CÉDULA EN EL PECHO</Seccion>
          <View style={{ alignItems: "center", paddingVertical: 6 }}>
            <View style={{ width: 150, height: 150, borderRadius: 20, backgroundColor: C.limaSuave, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.marino, marginBottom: 4 }} />
              <View style={{ width: 120, height: 56, borderTopLeftRadius: 60, borderTopRightRadius: 60, backgroundColor: C.marino, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 52, height: 32, borderRadius: 5, backgroundColor: C.blanco, borderWidth: 2, borderColor: C.lima, flexDirection: "row", alignItems: "center", padding: 3, gap: 3 }}>
                  <View style={{ width: 12, height: 18, borderRadius: 2, backgroundColor: "#9EB3CC" }} /><View style={{ flex: 1, gap: 3 }}><View style={{ height: 3, backgroundColor: "#9EB3CC" }} /><View style={{ height: 3, backgroundColor: "#9EB3CC" }} /></View>
                </View>
              </View>
            </View>
          </View>
          <Texto>Sostén tu cédula a la altura del pecho, con la foto y el número bien visibles. Tu cara completa, de frente, con buena luz, sin lentes oscuros ni gorra.</Texto>
          <Aviso texto={error} />
          <Boton titulo="Tomar foto con mi cédula" icono="id-card" onPress={() => foto("selfie")} cargando={cargando} />
        </Tarjeta>
      ) : null}

      {paso === 3 ? (
        <Tarjeta>
          <Seccion>ESCANEO FACIAL DE VERIFICACIÓN</Seccion>
          <Texto>Ahora escanea tu cara de frente. La app la compara con la foto donde sostienes tu cédula: tienen que ser la misma persona.</Texto>
          <View style={{ flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center" }}>
            {selfie ? <View style={{ alignItems: "center", gap: 4 }}><Image source={{ uri: selfie.uri }} style={{ width: 120, height: 150, borderRadius: 14 }} /><Texto gris size={12}>Con la cédula</Texto></View> : null}
            <Texto negrita size={22}>{verif?.coincide ? "=" : verif?.coincide === false ? "≠" : "?"}</Texto>
            <View style={{ alignItems: "center", gap: 4 }}>
              {rostro ? <Image source={{ uri: rostro.uri }} style={{ width: 120, height: 150, borderRadius: 14 }} />
                : <View style={{ width: 120, height: 150, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", borderColor: C.borde, alignItems: "center", justifyContent: "center" }}><Texto gris size={12}>Escaneo</Texto></View>}
              <Texto gris size={12}>Escaneo facial</Texto>
            </View>
          </View>
          {analizando ? <Aviso tono="info" texto="Analizando tu cara… comparando las dos fotos." /> : null}
          {verif ? (
            <View style={{ borderRadius: 14, padding: 12, gap: 4, backgroundColor: verif.coincide ? "#E7F5EC" : verif.coincide === false ? "#FDECEC" : C.limaSuave }}>
              <Texto negrita size={16}>{verif.coincide ? "✓ Verificación facial aprobada" : verif.coincide === false ? "✗ Las caras no coinciden" : "La revisará la oficina"}</Texto>
              <Texto size={14}>{verif.motivo}</Texto>
              {verif.coincide ? <Texto gris size={13}>Coincidencia {verif.nivel}{verif.cedula_visible ? (verif.cedula_coincide ? " · la foto impresa en tu cédula también coincide" : " · la foto de tu cédula no se leyó bien; la oficina la revisará") : " · no se vio la foto de tu cédula; la oficina la revisará"}.</Texto> : null}
            </View>
          ) : null}
          <Aviso texto={error} />
          {verif && verif.coincide !== false ? <Boton titulo="Continuar" tipo="exito" onPress={() => setPaso(4)} /> : (
            <Boton titulo={rostro ? "Repetir el escaneo" : "Escanear mi cara"} icono="scan" onPress={() => foto("rostro")} cargando={cargando || analizando} />
          )}
          {verif?.coincide === false ? <Boton titulo="Repetir la foto con la cédula" tipo="secundario" icono="id-card" onPress={() => { setVerif(null); setRostro(null); setPaso(2); }} /> : null}
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
          <Texto gris size={13}>{f.conduce ? "Después pasa por la oficina: te tomarán la foto de perfil, copia de tu cédula, licencia y documentos del vehículo, y te darán el alta con tu grupo." : "Después pasa por la oficina: te tomarán la foto de perfil y copia de tu cédula, y te darán el alta con tu grupo."}</Texto>
        </Tarjeta>
      ) : null}
      <View style={{ height: 1, backgroundColor: C.linea }} />
    </Pantalla>
  );
}
