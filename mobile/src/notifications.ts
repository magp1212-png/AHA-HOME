import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";

import { api } from "./api";

/**
 * Notificaciones push (nueva orden al técnico y al control, «tu equipo va en camino» al cliente, etc.).
 * Como en Anunciate: expo-notifications se carga solo donde funciona (no en la web ni en Expo Go de Android).
 * Donde no hay push, la app igual muestra todo en la bandeja (campana) consultando al servidor.
 */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const PUSH_DISPONIBLE = Platform.OS !== "web" && !(IN_EXPO_GO && Platform.OS === "android");
const TOKEN_KEY = "ahahome.pushToken";
let mod: typeof NotificationsModule | null = null;

function N(): typeof NotificationsModule | null {
  if (!PUSH_DISPONIBLE) return null;
  if (mod) return mod;
  try {
    mod = require("expo-notifications") as typeof NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    return mod;
  } catch {
    return null;
  }
}

/** Después de entrar y al abrir la app con sesión. Nunca falla: si no hay push, queda la campana. */
export async function registrarPush(): Promise<void> {
  const n = N();
  if (!n) return;
  try {
    if (Platform.OS === "android") {
      await n.setNotificationChannelAsync("ordenes", { name: "Órdenes y servicios", importance: n.AndroidImportance.MAX, sound: "default" });
    }
    let perm = await n.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await n.requestPermissionsAsync();
    if (!perm.granted) return;
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = extra?.eas?.projectId;
    const { data: token } = await n.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return;
    await api("/yo/push", { body: { token } });
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
  } catch {
    // sin token en este teléfono o compilación: la campana sigue mostrando todo
  }
}

export async function quitarPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await api("/yo/push/quitar", { body: { token } });
  } catch {}
}
