import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NavProvider, Route } from "./src/nav";
import Expediente from "./src/screens/control/Expediente";
import Analitica from "./src/screens/control/Analitica";
import Control from "./src/screens/control/Control";
import MapaVivo from "./src/screens/control/Mapa";
import InicioCaja from "./src/screens/agente/InicioCaja";
import NuevaOrden from "./src/screens/agente/NuevaOrden";
import OrdenCaja from "./src/screens/agente/OrdenCaja";
import InicioCliente from "./src/screens/cliente/InicioCliente";
import Rastreo from "./src/screens/cliente/Rastreo";
import Reprogramar from "./src/screens/cliente/Reprogramar";
import Inicio from "./src/screens/Inicio";
import Login from "./src/screens/Login";
import LoginTecnico from "./src/screens/LoginTecnico";
import RegistroCliente from "./src/screens/RegistroCliente";
import RegistroTecnico from "./src/screens/RegistroTecnico";
import Servidor from "./src/screens/Servidor";
import Ayudantes from "./src/screens/tecnico/Ayudantes";
import Checklist from "./src/screens/tecnico/Checklist";
import Escaner from "./src/screens/tecnico/Escaner";
import Incidencia from "./src/screens/tecnico/Incidencia";
import InicioTecnico from "./src/screens/tecnico/InicioTecnico";
import { SessionProvider, useSession } from "./src/session";
import type { Rol } from "./src/types";
import { C } from "./src/ui";

function inicioPara(rol: Rol | undefined): Route {
  if (rol === "agente") return { name: "caja" };
  if (rol === "tecnico" || rol === "ayudante") return { name: "tecnico" };
  if (rol === "tecnico_supervisor" || rol === "supervisor" || rol === "superadmin") return { name: "control" };
  return { name: "cliente" };
}

function Router() {
  const { ready, token, perfil } = useSession();
  if (!ready) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.marino }}><ActivityIndicator color={C.lima} size="large" /></View>;
  return (
    <NavProvider key={token ? `in-${perfil?.rol}` : "out"} initial={token ? inicioPara(perfil?.rol) : { name: "inicio" }}>
      {(r) => {
        const p = r.params ?? {};
        switch (r.name) {
          case "inicio": return <Inicio />;
          case "login": return <Login />;
          case "loginTecnico": return <LoginTecnico />;
          case "registroCliente": return <RegistroCliente />;
          case "registroTecnico": return <RegistroTecnico />;
          case "servidor": return <Servidor />;
          case "cliente": return <InicioCliente />;
          case "rastreo": return <Rastreo id={p.id} />;
          case "reprogramar": return <Reprogramar id={p.id} />;
          case "caja": return <InicioCaja />;
          case "nuevaOrden": return <NuevaOrden />;
          case "ordenCaja": return <OrdenCaja id={p.id} />;
          case "tecnico": return <InicioTecnico />;
          case "escaner": return <Escaner />;
          case "checklist": return <Checklist id={p.id} />;
          case "ayudantes": return <Ayudantes />;
          case "incidencia": return <Incidencia id={p.id} />;
          case "control": return <Control />;
          case "expediente": return <Expediente id={p.id} />;
          case "analitica": return <Analitica />;
          case "mapa": return <MapaVivo />;
          default: return <Inicio />;
        }
      }}
    </NavProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider><Router /></SessionProvider>
    </SafeAreaProvider>
  );
}
