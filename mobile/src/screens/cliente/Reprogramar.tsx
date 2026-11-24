import React, { useState } from "react";

import { api } from "../../api";
import { useNav } from "../../nav";
import { Aviso, Boton, C, Fila, Opcion, Pantalla, Seccion, Tarjeta, Texto } from "../../ui";

export const FRANJAS = ["8:00-10:00", "10:00-12:00", "13:00-15:00", "15:00-17:00"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function proximosDias(n = 7) {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);  // incluye hoy: servicio el mismo día
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { iso, texto: i === 0 ? "Hoy" : `${DIAS[d.getDay()]} ${d.getDate()}` };
  });
}

export default function Reprogramar({ id }: { id: number }) {
  const nav = useNav();
  const dias = proximosDias();
  const [fecha, setFecha] = useState(dias[0].iso);
  const [franja, setFranja] = useState(FRANJAS[1]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar() {
    setCargando(true); setError(null);
    try { await api(`/ordenes/${id}/reprogramar`, { body: { fecha, franja } }); nav.back(); } catch (e: any) { setError(e.message); }
    setCargando(false);
  }

  return (
    <Pantalla titulo="Programar instalación">
      <Tarjeta style={{ backgroundColor: C.limaSuave, borderColor: C.lima }}>
        <Texto negrita>Puedes reprogramar sin costo</Texto>
        <Texto size={14}>Hasta 3 horas antes de tu franja y mientras no hayamos retirado tu compra en la tienda.</Texto>
        <Texto gris size={13}>Si la cuadrilla ya retiró tu compra, salió hacia tu casa y no se pudo entregar, regresa a la tienda y se cobra el servicio completo como penalidad.</Texto>
      </Tarjeta>
      <Tarjeta>
        <Seccion>DÍA</Seccion>
        <Fila wrap>{dias.map((d) => <Opcion key={d.iso} texto={d.texto} activo={fecha === d.iso} onPress={() => setFecha(d.iso)} />)}</Fila>
        <Seccion>FRANJA HORARIA</Seccion>
        <Fila wrap>{FRANJAS.map((f) => <Opcion key={f} texto={f.replace("-", " – ")} activo={franja === f} onPress={() => setFranja(f)} />)}</Fila>
        <Aviso texto={error} />
        <Boton titulo="Confirmar nueva fecha" onPress={guardar} cargando={cargando} />
      </Tarjeta>
    </Pantalla>
  );
}
