import * as Location from "expo-location";
import { useEffect } from "react";

import { api } from "./api";

/** Mientras `activo` sea verdadero (orden en ruta o en servicio), envía la posición cada 30 segundos. */
export function useGpsEnVivo(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!perm?.granted || !vivo) return;
      const enviar = async () => {
        try {
          const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await api("/tecnico/ubicacion", { body: { lat: p.coords.latitude, lng: p.coords.longitude } });
        } catch {}
      };
      enviar();
      timer = setInterval(enviar, 30000);
    })();
    return () => { vivo = false; if (timer) clearInterval(timer); };
  }, [activo]);
}
