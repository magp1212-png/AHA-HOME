export type Rol = "cliente" | "agente" | "tecnico" | "ayudante" | "tecnico_supervisor" | "supervisor" | "superadmin";

export type Perfil = {
  id: number; nombre: string; telefono: string | null; email: string | null; rol: Rol; cedula: string | null; tienda_id: number | null;
  tecnico?: { id: number; grupo: string | null; tienda: string; zona: string; verificado: boolean; tiene_pin: boolean;
              onboarding_completo: boolean; es_ayudante: boolean; jefe: string | null };
};

export type Persona = { id?: number; nombre: string; foto?: string | null; rol: "tecnico" | "ayudante"; cedula?: string | null; telefono?: string | null; grupo?: string | null };

export type Articulo = { id: number; tipo: string; tipo_texto: string; nombre: string; marca: string; modelo: string; serial: string;
                         instalar: boolean; precio_instalacion: string; estado: string };

export type Paso = { estado: string; texto: string; hecho: boolean; actual: boolean; fecha: string | null };

export type Orden = {
  id: number; codigo: string; estado: string; estado_texto: string; tipo_servicio: string; tipo_servicio_texto: string;
  con_retiro_en_tienda: boolean;
  cliente: { nombre: string; telefono: string; direccion: string; referencia: string; zona: string; lat: number | null; lng: number | null };
  articulos: Articulo[]; fecha: string; franja: string;
  tienda: { id: number; nombre: string; direccion: string };
  linea_de_tiempo: Paso[];
  tecnico: Persona | null; ayudantes: Persona[]; tecnico_asignado?: boolean;
  checklist_requerido: string[]; fotos_requeridas: string[]; checklist: Record<string, boolean>; fotos: Record<string, string>;
  faltantes_cierre?: string[];
  pago_instalacion: { monto: string; metodo: string | null; pagado: boolean; precio_por_definir?: boolean };
  calificacion: number | null; qr?: string;
};
