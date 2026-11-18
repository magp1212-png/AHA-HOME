import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, loadServer, setToken } from "./api";
import { quitarPush, registrarPush } from "./notifications";
import type { Perfil } from "./types";

type Session = {
  ready: boolean;
  token: string | null;
  perfil: Perfil | null;
  entrar: (token: string, perfil: Perfil) => Promise<void>;
  salir: () => Promise<void>;
  recargar: () => Promise<void>;
};

const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tok, setTok] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => {
    (async () => {
      await loadServer();
      try {
        const t = await AsyncStorage.getItem("ahahome.token");
        if (t) {
          setToken(t);
          const yo = await api<Perfil>("/yo");
          setTok(t); setPerfil(yo);
          registrarPush();
        }
      } catch {
        setToken(null);
      }
      setReady(true);
    })();
  }, []);

  const entrar = useCallback(async (t: string, p: Perfil) => {
    setToken(t); setTok(t); setPerfil(p);
    try { await AsyncStorage.setItem("ahahome.token", t); } catch {}
    registrarPush();
  }, []);

  const salir = useCallback(async () => {
    await quitarPush();
    setToken(null); setTok(null); setPerfil(null);
    try { await AsyncStorage.removeItem("ahahome.token"); } catch {}
  }, []);

  const recargar = useCallback(async () => { setPerfil(await api<Perfil>("/yo")); }, []);

  return <Ctx.Provider value={{ ready, token: tok, perfil, entrar, salir, recargar }}>{children}</Ctx.Provider>;
}
