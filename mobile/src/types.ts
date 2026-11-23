export type Rol = "cliente" | "agente" | "tecnico" | "ayudante" | "tecnico_supervisor" | "supervisor" | "superadmin";

export type Perfil = { es_ceo?: boolean;
  id: number; nombre: string; telefono: string | null; email: string | null; rol: Rol; cedula: string | null; tienda_id: number | null;
  foto: string | null; email_verificado: boolean; verificacion_vence: string | null;
  tecnico?: { id: number; grupo: string | null; tienda: string; zona: string; verificado: boolean; tiene_pin: boolean;
              onboarding_completo: boolean; es_ayudante: boolean; jefe: string | null };
};

export type Persona = { id?: number; nombre: string; foto?: string | null; rol: "tecnico" | "ayudante"; calificacion?: number | null; calificaciones?: number; cedula?: string | null; telefono?: string | null; grupo?: string | null };

export type Articulo = { id: number; tipo: string; tipo_texto: string; nombre: string; marca: string; modelo: string; serial: string;
                         instalar: boolean; precio_instalacion: string; estado: string; garantia?: string };

export type Paso = { estado: string; texto: string; hecho: boolean; actual: boolean; fecha: string | null };

export type Orden = {
  id: number; codigo: string; estado: string; estado_texto: string; tipo_servicio: string; tipo_servicio_texto: string;
  con_retiro_en_tienda: boolean;
  cliente: { nombre: string; telefono?: string; tipo_inmueble?: string; tipo_inmueble_texto?: string; direccion: string; referencia: string; zona: string; lat: number | null; lng: number | null };
  articulos: Articulo[]; fecha: string; franja: string;
  tienda: { id: number; nombre: string; direccion: string; lat?: number | null; lng?: number | null };
  tecnico_gps?: { lat: number; lng: number; en: string | null } | null;
  linea_de_tiempo: Paso[];
  tecnico: Persona | null; ayudantes: Persona[]; tecnico_asignado?: boolean;
  checklist_requerido: string[]; fotos_requeridas: string[]; checklist: Record<string, boolean>; fotos: Record<string, string>;
  faltantes_cierre?: string[];
  pago_instalacion: { monto: string; inspeccion?: string; metodo: string | null; metodo_texto: string; moneda: string; monto_usd: string; monto_bs: string | null;
    tasa: string | null; cobrado: string | null; referencia?: string; pagado: boolean; pagado_en?: string | null; precio_por_definir?: boolean };
  calificacion: number | null; qr?: string;
  cierre?: { token?: string | null; falta_acta?: boolean; requiere_token?: boolean; intentos?: number } | null;
  aprobacion?: { aprobada: boolean; en: string | null; puntos: { id: string; texto: string }[] };
  acta?: { confirmada: boolean; puntos: { id: string; texto: string }[]; recibe_nombre: string | null; recibe_cedula: string | null; en: string | null; caja_hasta: string | null };
  residuos: { retirar: boolean; aplica: boolean; puede_cambiar: boolean };
  inspeccion: { requerida: boolean; fecha: string; franja: string; costo: string; pagada_en_tienda: boolean };
  presupuesto: Presupuesto | null; listo_para_instalar: boolean;
  reprogramar: { puede: boolean; motivo: string; horas_antes: number; limite: string | null };
  penalidad: { estado: "pendiente" | "pago_registrado" | "pagada" | "exonerada"; motivo: string; monto: string; por_definir: boolean;
               metodo: string | null; referencia: string } | null;
  pausa: { activa: boolean; desde: string | null; horas: number; limite_horas: number; vencida: boolean };
  propina: { monto: string; metodo: string | null; dada: boolean; entregada_al_tecnico: boolean };
};

export type CuentaPago = { banco: string; tipo: string; numero: string; titular: string; cedula: string; pago_movil_telefono: string;
                           pago_movil_banco: string; registrada: boolean };

export type Presupuesto = {
  id: number; orden_id: number; codigo: string; estado: string; estado_texto: string;
  items: { tipo: "material" | "mano_obra"; descripcion: string; cantidad: number; precio: string; subtotal: string }[];
  materiales: string; mano_obra: string; inspeccion: string; total: string; materiales_compra: "tecnico" | "cliente"; a_pagar: string; notas: string; motivo_rechazo: string; tecnico: string;
  cliente_acepto: boolean; admin_aprobo: boolean; pago: { metodo: string | null; referencia: string };
  cuenta_tecnico?: CuentaPago; cliente?: string;
};
