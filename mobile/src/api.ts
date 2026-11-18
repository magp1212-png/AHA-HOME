import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Dirección del servidor: viene de app.config.js (AHAHOME_API_URL). Se puede cambiar desde la app
// (pantalla de inicio → «Servidor») para mudarse al servidor físico sin publicar otra versión.
const CONFIG_URL = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "http://127.0.0.1:8000";
let baseUrl = CONFIG_URL;
let token: string | null = null;

export async function loadServer(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem("ahahome.server");
    if (saved) baseUrl = saved;
  } catch {}
  return baseUrl;
}

export async function setServer(url: string): Promise<void> {
  baseUrl = url.trim().replace(/\/+$/, "") || CONFIG_URL;
  try {
    if (url.trim()) await AsyncStorage.setItem("ahahome.server", baseUrl);
    else await AsyncStorage.removeItem("ahahome.server");
  } catch {}
}

export const getServer = () => baseUrl;
export const setToken = (t: string | null) => { token = t; };
export const fileUrl = (path?: string | null) => (path ? (path.startsWith("http") ? path : baseUrl + path) : undefined);

export class ApiError extends Error {
  status: number;
  faltan?: string[];
  constructor(status: number, message: string, faltan?: string[]) {
    super(message);
    this.status = status;
    this.faltan = faltan;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, any> } = {}): Promise<T> {
  const q = opts.query
    ? "?" + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
    : "";
  let res: Response;
  try {
    res = await fetch(baseUrl + path + (q === "?" ? "" : q), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    let msg = "Algo salió mal. Intenta de nuevo.";
    let faltan: string[] | undefined;
    const det = data?.detail;
    if (typeof det === "string") msg = det;
    else if (det && typeof det === "object" && !Array.isArray(det)) { msg = det.mensaje ?? msg; faltan = det.faltan; }
    else if (Array.isArray(det)) msg = "Revisa los datos: hay un campo incompleto o inválido.";
    throw new ApiError(res.status, msg, faltan);
  }
  return data as T;
}

/** Sube una foto tomada con la cámara (base64) y devuelve la ruta que guarda el servidor. */
export async function subirFoto(base64: string): Promise<string> {
  const r = await api<{ url: string }>("/archivos/base64", { body: { data: base64, tipo: "image/jpeg" } });
  return r.url;
}
