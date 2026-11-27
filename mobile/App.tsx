import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NavProvider, Route } from "./src/nav";
import Expediente from "./src/screens/control/Expediente";
import Analitica from "./src/screens/control/Analitica";
import Control from "./src/screens/control/Control";
import MapaVivo from "./src/screens/control/Mapa";
import Pagos from "./src/screens/control/Pagos";
import Banners from "./src/screens/control/Banners";
import TiendasQR from "./src/screens/control/TiendasQR";
import Auditoria from "./src/screens/control/Auditoria";
import { BandejaMensajes, SoporteBandeja, SoporteChat } from "./src/fusion";
import { MenuCliente } from "./src/menus";
import VisitaTienda from "./src/screens/tecnico/VisitaTienda";
import InicioCaja from "./src/screens/agente/InicioCaja";
import NuevaOrden from "./src/screens/agente/NuevaOrden";
import OrdenCaja from "./src/screens/agente/OrdenCaja";
import InicioCliente from "./src/screens/cliente/InicioCliente";
import MisEquipos from "./src/screens/cliente/MisEquipos";
import ChatOrden from "./src/screens/Chat";
import Rastreo from "./src/screens/cliente/Rastreo";
import Reprogramar from "./src/screens/cliente/Reprogramar";
import Inicio from "./src/screens/Inicio";
import MiCuenta from "./src/screens/MiCuenta";
import Notificaciones from "./src/screens/Notificaciones";
import Login from "./src/screens/Login";
import LoginTecnico from "./src/screens/LoginTecnico";
import RegistroCliente from "./src/screens/RegistroCliente";
import RegistroTecnico from "./src/screens/RegistroTecnico";
import Servidor from "./src/screens/Servidor";
import Ayudantes from "./src/screens/tecnico/Ayudantes";
import Formacion from "./src/screens/tecnico/Formacion";
import CuentaPagoTecnico from "./src/screens/tecnico/CuentaPago";
import PresupuestoTecnico from "./src/screens/tecnico/Presupuesto";
import Checklist from "./src/screens/tecnico/Checklist";
import Escaner from "./src/screens/tecnico/Escaner";
import Incidencia from "./src/screens/tecnico/Incidencia";
import InicioTecnico from "./src/screens/tecnico/InicioTecnico";
import MapaTecnico from "./src/screens/tecnico/MapaTecnico";
import OrdenesTecnico from "./src/screens/tecnico/OrdenesTecnico";
import { cargarInterfaz } from "./src/interfaz";
import CambioClave from "./src/screens/CambioClave";
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
  if (token && perfil?.clave_temporal) return <NavProvider key="clave" initial={{ name: "cambioClave" }}>{() => <CambioClave />}</NavProvider>;
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
          case "notificaciones": return <Notificaciones />;
          case "miCuenta": return <MiCuenta />;
          case "cliente": return <InicioCliente />;
          case "misPedidos": return <InicioCliente lista />;
          case "misEquipos": return <MisEquipos />;
          case "chat": return <ChatOrden id={p.id} />;
          case "rastreo": return <Rastreo id={p.id} />;
          case "reprogramar": return <Reprogramar id={p.id} />;
          case "caja": return <InicioCaja />;
          case "nuevaOrden": return <NuevaOrden />;
          case "ordenCaja": return <OrdenCaja id={p.id} />;
          case "tecnico": return <InicioTecnico />;
          case "ordenesTecnico": return <OrdenesTecnico />;
          case "mapaTecnico": return <MapaTecnico />;
          case "perfilTecnico": return <MiCuenta />;
          case "escaner": return <Escaner />;
          case "checklist": return <Checklist id={p.id} />;
          case "ayudantes": return <Ayudantes />;
          case "formacion": return <Formacion />;
          case "presupuesto": return <PresupuestoTecnico id={p.id} />;
          case "cuentaPago": return <CuentaPagoTecnico />;
          case "incidencia": return <Incidencia id={p.id} />;
          case "control": return <Control />;
          case "expediente": return <Expediente id={p.id} />;
          case "analitica": return <Analitica />;
          case "mapa": return <MapaVivo />;
          case "pagos": return <Pagos />;
          case "banners": return <Banners />;
          case "tiendasQR": return <TiendasQR />;
          case "mensajes": return <BandejaMensajes abajo={<MenuCliente activo="avisos" />} />;
          case "soporte": return <SoporteChat hilo={p?.hilo} />;
          case "soporteBandeja": return <SoporteBandeja />;
          case "auditoria": return <Auditoria />;
          case "visitaTienda": return <VisitaTienda />;
          default: return <Inicio />;
        }
      }}
    </NavProvider>
  );
}

export default function App() {
  // El diseño (colores, textos y menús) lo controla el panel: se descarga antes de mostrar la app
  const [diseno, setDiseno] = React.useState(false);
  React.useEffect(() => { cargarInterfaz().finally(() => setDiseno(true)); }, []);
  if (!diseno) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.marino }}><ActivityIndicator color={C.lima} size="large" /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider><Router /></SessionProvider>
    </SafeAreaProvider>
  );
}
