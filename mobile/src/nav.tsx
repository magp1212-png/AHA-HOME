// A tiny stack navigator: enough for this app and it behaves the same on iPhone, Android and web.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BackHandler } from "react-native";

export type Route = { name: string; params?: any };

type Nav = { route: Route; push: (name: string, params?: any) => void; back: () => void; reset: (name: string, params?: any) => void; canGoBack: boolean };

const Ctx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(Ctx);

export function NavProvider({ initial, children }: { initial: Route; children: (route: Route) => React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const push = useCallback((name: string, params?: any) => setStack((s) => [...s, { name, params }]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((name: string, params?: any) => setStack([{ name, params }]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length > 1) { back(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, back]);

  const route = stack[stack.length - 1];
  return <Ctx.Provider value={{ route, push, back, reset, canGoBack: stack.length > 1 }}>{children(route)}</Ctx.Provider>;
}
