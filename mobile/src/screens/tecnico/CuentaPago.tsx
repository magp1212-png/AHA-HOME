import React, { useEffect, useState } from "react";

import { api } from "../../api";
import type { CuentaPago } from "../../types";
import { Aviso, Cargando, Pantalla, Tarjeta, Texto } from "../../ui";

/** El técnico ve la cuenta donde le pagamos (servicios, materiales y propinas). La registra la oficina. */
export default function CuentaPagoTecnico() {
  const [c, setC] = useState<CuentaPago | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<CuentaPago>("/tecnico/cuenta-bancaria").then(setC).catch((e) => setError(e.message)); }, []);
  if (!c) return <Pantalla titulo="Mi cuenta de pago">{error ? <Aviso texto={error} /> : <Cargando />}</Pantalla>;
  return (
    <Pantalla titulo="Mi cuenta de pago">
      {!c.registrada ? <Aviso texto="Aún no tienes cuenta registrada. Pasa por la oficina de AHA HOME con tus datos bancarios." /> : null}
      <Tarjeta>
        {c.numero ? <><Texto negrita>{c.banco} · {c.tipo}</Texto><Texto>{c.numero}</Texto><Texto gris>{c.titular} · {c.cedula}</Texto></> : null}
        {c.pago_movil_telefono ? <Texto>Pago móvil: {c.pago_movil_banco} · {c.pago_movil_telefono}</Texto> : null}
      </Tarjeta>
      <Texto gris size={14}>Aquí te pagamos tus servicios, los materiales de los presupuestos aprobados y las propinas por transferencia. Para cambiarla, pásate por la oficina.</Texto>
    </Pantalla>
  );
}
