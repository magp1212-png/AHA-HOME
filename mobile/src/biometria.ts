import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

/** ¿El teléfono tiene huella o rostro configurado? (en la web no hay: se usa el PIN) */
export async function biometriaDisponible(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

/** Pide la huella (o Face ID). El teléfono nunca entrega la huella: solo dice si coincide. */
export async function confirmarIdentidad(motivo: string): Promise<boolean> {
  if (!(await biometriaDisponible())) return false;
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: motivo, cancelLabel: "Cancelar", disableDeviceFallback: true });
  return r.success;
}
