// Panel web del superadministrador AHA HOME (modelo del panel de AHA VOY). Sin dependencias: HTML + SVG.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = {
    token: localStorage.getItem("ahahome.panel.token"), yo: null, ruta: location.hash.slice(1) || "inicio",
    ocultas: JSON.parse(localStorage.getItem("ahahome.panel.ocultas") || "[]"), dias: {}, cache: {}, tabla: {}, notif: 0,
  };
  document.documentElement.dataset.tema = localStorage.getItem("ahahome.panel.tema") || "oscuro";

  async function api(ruta, opts = {}) {
    const r = await fetch(ruta, { method: opts.method || (opts.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(S.token ? { Authorization: "Bearer " + S.token } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401) { salir(); throw new Error("Inicia sesión de nuevo"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : j.detail?.mensaje || "No se pudo completar");
    return j;
  }
  function salir() { localStorage.removeItem("ahahome.panel.token"); S.token = null; S.yo = null; pintar(); }

  // ---------- Menú ----------
  // Cada tipo de registro va en su propia sección; el personal interno (superadmin, control, caja) va aparte.
  const MENU = [
    { k: "inicio", t: "Panel principal", i: "⌂" },
    { sec: "REGISTROS" },
    { k: "clientes", t: "Clientes", i: "🙋" },
    { k: "empresas", t: "Empresas aliadas", i: "🏬" },
    { g: "Técnicos", i: "👷", hijos: [["tecnicos", "Técnicos y ayudantes"], ["verificaciones", "Verificaciones", "verif"]] },
    { sec: "OPERACIÓN" },
    { g: "Órdenes", i: "🛒", hijos: [["ordenes", "Lista"], ["transacciones", "Transacciones"], ["liquidaciones", "Liquidaciones"]] },
    { g: "Centro de soporte", i: "◎", hijos: [["mensajeria", "Mensajería"], ["reportes", "Reportes", "rep"], ["resenas", "Reseñas"]] },
    { k: "anuncios", t: "Banners y aliados", i: "▤" },
    { sec: "DISEÑO" },
    { k: "diseno", t: "Diseño de la app", i: "🎨" },
    { sec: "FINANZAS" },
    { k: "finanzas", t: "Finanzas y contabilidad", i: "💼" },
    { sec: "NEGOCIO" },
    { k: "tasa", t: "Tasa BCV", i: "💱" },
    { k: "precios", t: "Tabulación de precios", i: "🏷" },
    { k: "qrs", t: "QR de las tiendas", i: "▦" },
    { sec: "ADMINISTRACIÓN AHA HOME" },
    { g: "Personal interno", i: "🛡", hijos: [["administradores", "Superadministradores"], ["control", "Centro de control"], ["caja", "Operadores de caja"]] },
  ];
  const TITULOS = { inicio: ["Tableros", "Panel principal"], tecnicos: ["Técnicos", "Técnicos y ayudantes"], empresas: ["Registros", "Empresas aliadas"], clientes: ["Registros", "Clientes"],
    equipo: ["Administración", "Personal AHA HOME"], administradores: ["Administración", "Superadministradores"], control: ["Administración", "Centro de control"], caja: ["Administración", "Operadores de caja"], anuncios: ["Recursos", "Banners y aliados"], ordenes: ["Órdenes", "Lista"], transacciones: ["Órdenes", "Transacciones"],
    mensajeria: ["Centro de soporte", "Mensajería"], liquidaciones: ["Órdenes", "Liquidaciones"], verificaciones: ["Técnicos", "Verificaciones"], reportes: ["Centro de soporte", "Reportes"],
    resenas: ["Centro de soporte", "Reseñas"], auditoria: ["Centro de mando", "Auditoría del equipo"], usuarios: ["Centro de mando", "Usuarios y permisos"], correos: ["Centro de mando", "Correos corporativos"],
    finanzas: ["Finanzas", "Finanzas y contabilidad"], diseno: ["Diseño", "Diseño de la app"], tasa: ["Negocio", "Tasa oficial BCV"], tarifas: ["Negocio", "Tarifas de instalación"], precios: ["Negocio", "Tabulación de precios"], qrs: ["Negocio", "QR de las tiendas"] };

  // Permiso que necesita cada pantalla (el CEO lo asigna a cada usuario)
  const PERM_RUTA = { inicio: "ver_tablero", clientes: "ver_clientes", empresas: "ver_empresas", tecnicos: "ver_tecnicos", verificaciones: "ver_tecnicos",
    ordenes: "ver_ordenes", transacciones: "ver_finanzas", liquidaciones: "ver_finanzas", mensajeria: "ver_soporte", reportes: "ver_soporte", resenas: "ver_soporte",
    anuncios: "banners", finanzas: "ver_finanzas", diseno: "diseno", tasa: "ver_tablero", precios: "ver_tablero", qrs: "qr_tiendas", administradores: "ver_personal", control: "ver_personal", caja: "ver_personal" };
  const puede = (k) => S.yo?.es_ceo || !PERM_RUTA[k] || (S.yo?.permisos || []).includes(PERM_RUTA[k]);
  const puedeHacer = (p) => S.yo?.es_ceo || (S.yo?.permisos || []).includes(p);

  function menuHTML() {
    const it = (k, t, i) => `<a class="it ${S.ruta === k ? "on" : ""}" href="#${k}"><span class="i">${i}</span>${t}</a>`;
    let h = "";
    const vis = MENU.map((m) => (m.hijos ? { ...m, hijos: m.hijos.filter(([k]) => puede(k)) } : m)).filter((m) => m.sec || (m.k ? puede(m.k) : m.hijos.length));
    const lim = vis.filter((m, i) => !m.sec || (vis[i + 1] && !vis[i + 1].sec));
    for (const m of lim) {
      if (m.sec) { h += `<div style="margin:14px 12px 4px;font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--suave)">${m.sec}</div>`; continue; }
      if (m.k) { h += it(m.k, m.t, m.i); continue; }
      h += `<div class="grupo"><span style="display:flex;gap:12px"><span class="i" style="width:22px;text-align:center">${m.i}</span>${m.g}</span><span>⌄</span></div>`;
      if (m.cap) h += `<div class="cap">${m.cap}</div>`;
      h += `<div class="sub">${m.hijos.map(([k, t, c]) => `<a href="#${k}" class="${S.ruta === k ? "on" : ""}">${t}${c && S.cuentas?.[c] ? `<span class="cuenta">${S.cuentas[c]}</span>` : ""}</a>`).join("")}</div>`;
    }
    if (S.yo?.es_ceo) h += `<div style="margin:14px 12px 4px;font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--suave)">CENTRO DE MANDO (CEO)</div>`
      + it("usuarios", "Usuarios y permisos", "🔑") + it("correos", "Correos corporativos", "✉") + it("auditoria", "Auditoría del equipo", "🛡");
    return h;
  }

  // ---------- Gráficos (SVG) ----------
  function spark(serie, alto = 78) {
    const n = serie.length, max = Math.max(1, ...serie), w = 600;
    const pts = serie.map((v, i) => [n > 1 ? (i * w) / (n - 1) : 0, alto - 8 - (v / max) * (alto - 22)]);
    const linea = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${alto}" preserveAspectRatio="none"><path d="${linea} L${w} ${alto} L0 ${alto} Z" fill="var(--acento)" opacity=".14"/>
      <path d="${linea}" fill="none" stroke="var(--acento)" stroke-width="2.2" vector-effect="non-scaling-stroke"/>${n <= 40 ? pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--acento)" vector-effect="non-scaling-stroke"/>`).join("") : ""}</svg>`;
  }
  const COLORES = ["#F2555A", "#F28A3C", "#C9A227", "#7DBE3C", "#2BD4A4", "#3FA9F5", "#8E6CF5", "#E063B8"];
  function dona(obj) {
    const ent = Object.entries(obj).filter(([, v]) => v > 0), tot = ent.reduce((a, [, v]) => a + v, 0);
    if (!tot) return `<div class="total" style="margin-top:14px">Sin datos en este período.</div>`;
    let a0 = -Math.PI / 2, arcos = "";
    ent.forEach(([, v], i) => {
      const a1 = a0 + (v / tot) * Math.PI * 2 - 0.04, r = 36, c = 46;
      const p = (a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
      arcos += `<path d="M${p(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}" stroke="${COLORES[i % COLORES.length]}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
      a0 = a1 + 0.04;
    });
    return `<div class="dona"><div class="leyenda">${ent.map(([k, v], i) => `<div><i style="background:${COLORES[i % COLORES.length]}"></i>${esc(k)} (${v} - ${Math.round((v * 100) / tot)}%)</div>`).join("")}</div>
      <svg width="92" height="92" viewBox="0 0 92 92">${arcos}</svg></div>`;
  }
  const pct = (p) => p === null || p === undefined ? `<div class="pct" style="color:var(--suave)">— sin período anterior</div>`
    : `<div class="pct ${p < 0 ? "baja" : "sube"}">${p < 0 ? "↘" : "↗"} ${Math.abs(p).toString().replace(".", ",")}% ${p < 0 ? "Disminuir" : "Aumentar"}</div>`;
  const usd = (x) => "$" + Number(x).toLocaleString("es-VE", { minimumFractionDigits: 2 });

  // ---------- Panel principal ----------
  const TARJETAS = [
    { id: "clientes_total", t: "Total de clientes", f: (r) => kpi("👥", r.clientes.total, r.clientes.pct) },
    { id: "clientes_nuevos", t: "Nuevos clientes", ancho: 2, f: (r) => `<div class="grande">${r.clientes.nuevos}</div>${spark(r.clientes.serie)}` },
    { id: "tecnicos_total", t: "Total de profesionales", f: (r) => kpi("👷", r.tecnicos.total, r.tecnicos.pct) },
    { id: "tecnicos_validados", t: "Total de profesionales validados", f: (r) => kpi("✔", r.tecnicos_validados.total, r.tecnicos_validados.pct) },
    { id: "tecnicos_nuevos", t: "Nuevos profesionales", f: (r) => `<div class="grande">${r.tecnicos.nuevos}</div>${spark(r.tecnicos.serie)}` },
    { id: "ordenes_total", t: "Total de órdenes", f: (r) => kpi("🛒", r.ordenes.total, r.ordenes.pct) },
    { id: "ordenes_nuevas", t: "Nuevas órdenes", f: (r) => `<div class="grande">${r.ordenes.nuevos}</div>${spark(r.ordenes.serie)}` },
    { id: "por_servicio", t: "Órdenes por servicio", sinDias: false, total: (r) => Object.values(r.ordenes_por_servicio).reduce((a, b) => a + b, 0), f: (r) => dona(r.ordenes_por_servicio) },
    { id: "por_equipo", t: "Artículos por equipo", total: (r) => Object.values(r.articulos_por_equipo).reduce((a, b) => a + b, 0), f: (r) => dona(r.articulos_por_equipo) },
    { id: "caja", t: "Total cobrado en caja", f: (r) => kpi("$", usd(r.cobrado_en_caja.usd), r.cobrado_en_caja.pct, `${r.cobrado_en_caja.pct_bs}% cobrado en bolívares`) },
    { id: "presupuestos", t: "Total de pagos de presupuestos", f: (r) => kpi("$", usd(r.pagos_de_presupuestos.usd), r.pagos_de_presupuestos.pct, `${r.pagos_de_presupuestos.pct_bs}% en bolívares`) },
    { id: "por_estado", t: "Órdenes por estado", total: (r) => Object.values(r.ordenes_por_estado).reduce((a, b) => a + b, 0), f: (r) => dona(r.ordenes_por_estado) },
    { id: "por_tienda", t: "Órdenes por tienda aliada", total: (r) => Object.values(r.ordenes_por_tienda).reduce((a, b) => a + b, 0), f: (r) => dona(r.ordenes_por_tienda) },
    { id: "inspecciones", t: "Inspecciones (USD 10)", f: (r) => kpi("🔍", r.inspecciones.pedidas, undefined, `${usd(r.inspecciones.cobradas_usd)} cobrado · ${r.inspecciones.en_pausa} en pausa ahora`) },
    { id: "cumplimiento", t: "Cumplimiento del servicio", f: (r) => kpi("✔", r.cumplimiento.completados, undefined,
        `${r.cumplimiento.con_acta ?? "—"}% con acta · ${r.cumplimiento.cancelados} cancelados · ${r.cumplimiento.fallidos} fallidos`) },
    { id: "penalidades", t: "Penalidades por entrega fallida", f: (r) => kpi("⚠", r.penalidades.cantidad, undefined, `${usd(r.penalidades.cobradas_usd)} cobrado`) },
    { id: "materiales", t: "Materiales por pagar a técnicos", sinDias: true, f: (r) => kpi("🧰", usd(r.materiales_por_pagar.usd), undefined, `${r.materiales_por_pagar.cantidad} presupuesto(s) pendientes`) },
    { id: "residuos", t: "Retiro de residuos", total: (r) => r.residuos.retirados + r.residuos.cliente_guarda, f: (r) => dona({ "Se retiraron (reciclaje)": r.residuos.retirados, "Cliente guardó el empaque": r.residuos.cliente_guarda }) },
    { id: "tasa", t: "Tasa oficial BCV", sinDias: true, f: (r) => kpi("Bs", r.tasa.bs_por_usd ? Number(r.tasa.bs_por_usd).toLocaleString("es-VE", { minimumFractionDigits: 2 }) : "—", undefined, r.tasa.fecha ? `Bs por USD · ${r.tasa.fecha}` : "Sin cargar: no se puede cobrar en Bs") },
    { id: "empresas", t: "Total de empresas", sinDias: true, f: (r) => kpi("🏬", r.empresas.total, undefined, "Tiendas aliadas") },
    { id: "calificacion", t: "Calificación de técnicos", sinDias: true, f: (r) => kpi("★", r.calificacion.promedio ?? "—", undefined, `${r.calificacion.resenas} reseñas`) },
    { id: "dispositivos", t: "Dispositivos con notificaciones", sinDias: true, total: (r) => r.dispositivos.total, f: (r) => dona(r.dispositivos.por_rol) },
  ];
  function kpi(ic, num, p, nota) {
    return `<div class="kpi"><div class="ic">${ic}</div><div><div class="num">${esc(num)}</div>${p !== undefined ? pct(p) : ""}${nota ? `<div class="pct" style="color:var(--suave);font-weight:500">${esc(nota)}</div>` : ""}</div></div>`;
  }
  async function datos(dias) {
    if (!S.cache[dias]) S.cache[dias] = await api(`/panel-api/resumen?dias=${dias}`);
    return S.cache[dias];
  }
  const logo3D = (px) => `<div class="logo3d" style="--s:${px}px">${Array.from({ length: 16 }, (_, i) => `<svg style="--z:${i}"><use href="#logo"/></svg>`).join("")}</div>`;
  // Inclinación 3D de las tarjetas con el mouse (estilo vidrio de iOS)
  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest && e.target.closest(".card"); document.querySelectorAll(".card.incl").forEach((x) => { if (x !== c) { x.classList.remove("incl"); x.style.transform = ""; } });
    if (!c || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.classList.add("incl"); c.style.transform = `rotateX(${(0.5 - y) * 7}deg) rotateY(${(x - 0.5) * 9}deg) translateZ(6px)`;
    c.style.setProperty("--mx", `${x * 100}%`); c.style.setProperty("--my", `${y * 100}%`);
  });
  async function inicio(main) {
    const vis = TARJETAS.filter((c) => !S.ocultas.includes(c.id));
    const h = new Date().getHours(), saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
    const fecha = new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
    main.innerHTML += `<section class="hero"><div class="txt"><div class="hola">${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</div>
        <h2>${saludo}, ${esc((S.yo?.nombre || "").split(" ")[0])}</h2><div class="total" style="font-size:15px">AHA HOME · Hacemos todo por ti. Así va el negocio hoy.</div>
        <div class="chips" id="chips"></div></div>
        <div class="escenario" aria-hidden="true"><div class="orbita"><i></i><i></i><i></i></div>${logo3D(130)}<div class="pedestal"></div></div></section>
      <button class="ocultar" id="ocu">${S.verOcultar ? "LISTO ⌃" : "OCULTAR TARJETAS ⌄"}</button>
      ${S.verOcultar ? `<div class="card" style="min-height:0;margin-bottom:18px;display:flex;flex-wrap:wrap;gap:10px">${TARJETAS.map((c) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-oc="${c.id}" ${S.ocultas.includes(c.id) ? "" : "checked"}>${c.t}</label>`).join("")}</div>` : ""}
      <div class="grid">${vis.map((c) => `<div class="card ${c.ancho === 2 ? "ancho2" : ""}" id="c-${c.id}"><div class="tit"><span>${c.t}</span>${c.sinDias ? `<span class="total" data-tot="${c.id}"></span>` : `<span style="display:flex;gap:8px;align-items:center"><span class="total" data-tot="${c.id}"></span><select class="sel" data-dias="${c.id}">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${(S.dias[c.id] || 30) === d ? "selected" : ""}>${d === 365 ? "1 año" : d + " días"}</option>`).join("")}</select></span>`}</div><div class="cont">…</div></div>`).join("")}</div>
      <div class="pie-app">AHA HOME — Hacemos todo por ti · Onyxa LLC © 2026</div>`;
    $("#ocu").onclick = () => { S.verOcultar = !S.verOcultar; pintar(); };
    datos(30).then((r) => {
      const ch = $("#chips"); if (!ch) return;
      const t = r.tasa && (r.tasa.bs_por_usd || r.tasa.valor);
      const cobrado = r.cobrado_en_caja && r.cobrado_en_caja.usd ? r.cobrado_en_caja.usd : "0.00";
      ch.innerHTML = [["Órdenes · 30 días", r.ordenes ? r.ordenes.nuevos : 0], ["Cobrado en caja", "USD " + cobrado],
        ["Tasa BCV", t ? "Bs " + t : "por cargar"], ["Verificaciones", r.verificaciones_pendientes || 0]]
        .map(([k, v]) => `<span class="chip">${k} <b>${esc(String(v))}</b></span>`).join("");
    }).catch(() => {});
    main.querySelectorAll("[data-oc]").forEach((x) => (x.onchange = () => {
      S.ocultas = x.checked ? S.ocultas.filter((y) => y !== x.dataset.oc) : [...S.ocultas, x.dataset.oc];
      localStorage.setItem("ahahome.panel.ocultas", JSON.stringify(S.ocultas)); pintar();
    }));
    main.querySelectorAll("[data-dias]").forEach((x) => (x.onchange = () => { S.dias[x.dataset.dias] = Number(x.value); llenar(TARJETAS.find((c) => c.id === x.dataset.dias)); }));
    const llenar = async (c) => {
      const r = await datos(S.dias[c.id] || 30), el = $(`#c-${c.id}`);
      if (!el) return;
      el.querySelector(".cont").innerHTML = c.f(r);
      if (c.total) el.querySelector(`[data-tot]`).textContent = `(${c.total(r)} total)`;
    };
    for (const c of vis) llenar(c).catch((e) => ($(`#c-${c.id} .cont`).textContent = e.message));
  }

  // ---------- Tablas ----------
  const ESTADO_TONO = (e) => /aprob|valid|activo|cobrado|confirm|pagad|resuelt|complet/i.test(e) ? "ok" : /pend|por |abiert|en ruta|asignad|recibid/i.test(e) ? "pend" : /inactiv|suspend|no |cancel|fall/i.test(e) ? "mal" : "neutro";
  const fmt = (k, v) => {
    if (v === null || v === undefined || v === "") return "—";
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [a, m, d] = v.split("-"); return `${d}/${m}/${a}`; }
    if (k === "estrellas" || k === "calificacion") return "★".repeat(Math.round(v)) + ` ${v}`;
    return esc(v);
  };
  async function tabla(main, nombre) {
    const st = (S.tabla[nombre] = S.tabla[nombre] || { q: "", pagina: 1, orden: null, dir: "desc", estado: "" });
    const qs = new URLSearchParams({ q: st.q, pagina: st.pagina, dir: st.dir, ...(st.orden ? { orden: st.orden } : {}), ...(st.estado ? { estado: st.estado } : {}) });
    main.innerHTML += `<div style="margin-bottom:16px"><input id="bq" placeholder="⌕  Buscar" value="${esc(st.q)}" style="height:40px;border-radius:20px;border:1px solid var(--borde);background:var(--panel);color:var(--texto);padding:0 16px;min-width:340px"></div><div class="tabla" id="tb">Cargando…</div>`;
    const bq = $("#bq"); let t;
    bq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = bq.value; st.pagina = 1; S.enfocar = true; pintar(true); }, 300); };
    if (S.enfocar) { bq.focus(); bq.setSelectionRange(bq.value.length, bq.value.length); S.enfocar = false; }
    const r = await api(`/panel-api/tabla/${nombre}?${qs}`);
    const nombreCol = r.columnas.find((c) => ["nombre", "codigo", "quien", "tecnico"].includes(c.k))?.k;
    $("#tb").innerHTML = `<div class="barra"><span style="flex:1;color:var(--suave)">${r.total} registro(s)</span>
        ${r.estados.length ? `<label style="display:flex;gap:6px;align-items:center;color:var(--suave)">⏷ Estado <select class="sel" id="fe"><option value="">Todos</option>${r.estados.map((e) => `<option ${st.estado === e ? "selected" : ""}>${esc(e)}</option>`).join("")}</select></label>` : ""}</div>
      <div style="overflow:auto"><table><thead><tr>${r.columnas.map((c) => `<th data-o="${c.k}" class="${r.orden === c.k ? "on" : ""}">${esc(c.t)} ${r.orden === c.k ? (r.dir === "desc" ? "↓" : "↑") : "↕"}</th>`).join("")}<th></th></tr></thead>
      <tbody>${r.filas.map((f, i) => `<tr>${r.columnas.map((c) => c.k === "estado" ? `<td><span class="est ${ESTADO_TONO(String(f.estado))}">${esc(f.estado)}</span></td>`
        : `<td class="${c.k === nombreCol ? "nombre" : ""}">${fmt(c.k, f[c.k])}</td>`).join("")}<td><div class="acc"><button title="Ver" data-ver="${i}">👁</button>${(f._acciones || []).length ? `<button title="Editar" data-ed="${i}">✎</button>` : ""}</div></td></tr>`).join("") || `<tr><td colspan="${r.columnas.length + 1}" style="color:var(--suave)">Sin resultados.</td></tr>`}</tbody></table></div>
      <div class="pie"><span>Página ${r.pagina} de ${r.paginas}</span><span style="display:flex;gap:8px"><button id="ant" ${r.pagina <= 1 ? "disabled" : ""}>← Anterior</button><button id="sig" ${r.pagina >= r.paginas ? "disabled" : ""}>Siguiente →</button></span></div>`;
    $("#tb").querySelectorAll("[data-o]").forEach((th) => (th.onclick = () => { st.dir = st.orden === th.dataset.o && st.dir === "desc" ? "asc" : "desc"; st.orden = th.dataset.o; pintar(); }));
    const fe = $("#fe"); if (fe) fe.onchange = () => { st.estado = fe.value; st.pagina = 1; pintar(); };
    $("#ant").onclick = () => { st.pagina--; pintar(); }; $("#sig").onclick = () => { st.pagina++; pintar(); };
    $("#tb").querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => cajon(nombre, r.columnas, r.filas[b.dataset.ver], false)));
    $("#tb").querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => cajon(nombre, r.columnas, r.filas[b.dataset.ed], true)));
  }

  async function cajon(nombre, cols, f, editar) {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    let extra = "";
    if (f._acciones?.includes("expediente") && f.tecnico_id) {
      try {
        const e = await api(`/supervisor/tecnicos/${f.tecnico_id}/expediente`);
        const vf = e.verificacion_facial || {};
        extra = `<h3 style="margin:18px 0 6px">Expediente</h3>
          <div class="fila"><span>Verificación facial</span><span>${vf.resultado === "coincide" ? `✓ Coincide (${vf.similitud})` : esc(vf.resultado || "pendiente")}</span></div>
          <div class="fila"><span>Huella</span><span>${e.huella_registrada ? "✓ Registrada" : "Sin registrar"}</span></div>
          <div class="fila"><span>Documentos</span><span>${e.documentos.length} cargado(s)</span></div>
          ${e.documentos.map((d) => `<div class="fila"><span>${esc(d.tipo_texto)}</span><span><a href="${esc(d.url)}" target="_blank" style="color:var(--acento)">Ver</a></span></div>`).join("")}
          <div class="fila"><span>Faltan</span><span>${e.documentos_faltantes.length ? esc(e.documentos_faltantes.map((d) => e.tipos_documento[d] || d).join(", ")) : "Nada"}</span></div>
          ${!e.verificado && editar ? `<div style="display:flex;gap:8px;margin-top:14px"><select class="sel" id="grp">${["A", "B", "C", "D", "RETEN"].map((g) => `<option>${g}</option>`).join("")}</select><button class="btn pri" id="alta">Aprobar y dar de alta</button></div>` : ""}`;
      } catch (err) { extra = `<p class="error">${esc(err.message)}</p>`; }
    }
    const activo = f._acciones?.includes("activo") && editar ? `<div style="margin-top:16px"><button class="btn ${/inactiv|suspend/i.test(f.estado) ? "pri" : "pel"}" id="act">${/inactiv|suspend/i.test(f.estado) ? "Activar cuenta" : "Desactivar cuenta"}</button></div>` : "";
    const resolver = f._acciones?.includes("resolver") && editar ? `<div style="margin-top:16px"><button class="btn pri" id="res">Marcar como resuelta</button></div>` : "";
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">${esc(TITULOS[nombre]?.[1] || nombre)}</span><button class="btn sec" id="cer">✕</button></div>
      <h2 style="margin-top:8px">${esc(f.nombre || f.codigo || f.quien || f.orden || "Detalle")}</h2>
      ${cols.map((k) => `<div class="fila"><span>${esc(k.t)}</span><span>${fmt(k.k, f[k.k])}</span></div>`).join("")}${extra}${activo}${resolver}<p class="error" id="err"></p>`;
    document.body.appendChild(c);
    $("#cer").onclick = () => c.remove();
    const err = (e) => ($("#err").textContent = e.message);
    const act = $("#act"); if (act) act.onclick = () => api(`/admin/usuarios/${f.id}/activo`, { body: { activo: /inactiv|suspend/i.test(f.estado) } }).then(() => { c.remove(); pintar(); }).catch(err);
    const res = $("#res"); if (res) res.onclick = () => api(`/supervisor/incidencias/${f.id}/resolver`, { body: {} }).then(() => { c.remove(); pintar(); }).catch(err);
    const alta = $("#alta"); if (alta) alta.onclick = () => api(`/supervisor/tecnicos/${f.tecnico_id}/alta`, { body: { grupo: $("#grp").value } }).then(() => { c.remove(); S.cache = {}; pintar(); }).catch(err);
  }

  async function anuncios(main) {
    const bs = await api("/admin/banners");
    main.innerHTML += `<div class="tabla"><div class="barra"><span style="flex:1;color:var(--suave)">${bs.length} banner(s) · se editan en la app (Banners y aliados)</span></div>
      <table><thead><tr><th>Tipo</th><th>Título</th><th>Texto</th><th>Toques</th><th>Estado</th></tr></thead><tbody>${bs.map((b) => `<tr><td>${b.tipo === "aliado" ? "Aliado" : "AHA HOME"}</td><td class="nombre">${esc(b.titulo)}</td><td>${esc(b.texto || "—")}</td><td>${b.clics ?? 0}</td><td><span class="est ${b.activo ? "ok" : "neutro"}">${b.activo ? "Activo" : "Pausado"}</span></td></tr>`).join("")}</tbody></table></div>`;
  }

  async function auditoria(main) {
    const [eq, act] = await Promise.all([api("/ceo/equipo"), api("/ceo/actividad?limite=200")]);
    main.innerHTML += `<div class="grid" style="grid-template-columns:1fr 2fr"><div class="card"><div class="tit">Quién está dentro</div><div class="grande">${eq.en_linea} <span class="total">en línea de ${eq.total}</span></div>
      ${eq.equipo.map((p) => `<div class="fila" style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--borde)"><span style="width:9px;height:9px;border-radius:5px;margin-top:6px;background:${p.en_linea ? "var(--verde)" : "var(--borde)"}"></span><span style="flex:1"><b>${esc(p.nombre)}</b> <span class="total">· ${esc(p.rol_texto)}</span><br><span class="total">${p.en_linea ? "En línea" : "Último acceso " + fmt("", p.ultimo_acceso)}${p.ultima_accion ? " · " + esc(p.ultima_accion) : ""}</span></span><span class="est pend">${p.acciones_hoy} hoy</span></div>`).join("")}</div>
      <div class="tabla"><div class="barra"><span style="flex:1;color:var(--suave)">Lo que hizo el equipo · ${act.length} acciones</span></div><table><thead><tr><th>Fecha</th><th>Quién</th><th>Rol</th><th>Acción</th><th>IP</th></tr></thead><tbody>${act.map((a) => `<tr><td>${fmt("", a.en)}</td><td class="nombre">${esc(a.quien)}</td><td>${esc(a.rol_texto)}</td><td style="${a.estado >= 400 ? "color:var(--rojo)" : ""}">${esc(a.accion)}</td><td>${esc(a.ip || "—")}</td></tr>`).join("")}</tbody></table></div></div>`;
  }

  // ---------- Negocio: tasa, tarifas y QR ----------
  const esSA = () => S.yo?.rol === "superadmin";
  const editaPrecios = () => esSA() && puedeHacer("precios"), editaTasa = () => esSA() && puedeHacer("tasa");
  async function pagTasa(main) {
    const [t, h] = await Promise.all([api("/tasa"), editaTasa() ? api("/admin/tasas") : Promise.resolve([])]);
    main.innerHTML += `<div class="grid" style="grid-template-columns:1fr 1.4fr"><div class="card"><div class="tit">Tasa vigente</div>
      <div class="grande">${t.bs_por_usd ? "Bs " + Number(t.bs_por_usd).toLocaleString("es-VE", { minimumFractionDigits: 2 }) : "Sin cargar"}</div><div class="total">${t.fecha ? `por USD · del ${t.fecha} · fuente ${esc(t.fuente)}` : "Sin tasa la caja solo cobra en dólares."}</div>
      ${editaTasa() ? `<div style="display:flex;gap:8px;margin-top:18px"><input id="nt" placeholder="Nueva tasa (Bs por USD)" style="flex:1;height:42px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 12px"><button class="btn pri" id="gt">Guardar</button></div><p class="error" id="et"></p>` : ""}
      <p class="total" style="margin-top:10px">Cada cobro guarda la tasa del momento: si la tasa cambia, los cobros anteriores no se alteran.</p></div>
      <div class="tabla"><div class="barra">Historial</div><table><thead><tr><th>Fecha</th><th>Bs por USD</th><th>Cargada</th></tr></thead><tbody>${h.map((x) => `<tr><td>${esc(x.fecha)}</td><td class="nombre">${esc(x.bs_por_usd)}</td><td>${fmt("", x.creado)}</td></tr>`).join("")}</tbody></table></div></div>`;
    const gt = $("#gt"); if (gt) gt.onclick = () => api("/admin/tasa", { method: "PUT", body: { bs_por_usd: Number($("#nt").value.replace(/\./g, "").replace(",", ".")) } }).then(() => { S.cache = {}; pintar(); }).catch((e) => ($("#et").textContent = e.message));
  }
  async function pagTarifas(main) {
    const [ts, t, c] = await Promise.all([api("/admin/tarifas"), api("/tasa"), api("/inspeccion/costo")]);
    const bs = (v) => t.bs_por_usd && v ? "Bs " + (Number(v) * Number(t.bs_por_usd)).toLocaleString("es-VE", { minimumFractionDigits: 2 }) : "—";
    main.innerHTML += `<p class="total" style="margin-top:-6px">Precio de la instalación por tipo de artículo. Se cobra en caja junto con la compra. Sin precio, la caja lo registra como «precio por definir».</p>
      <div class="tabla"><table><thead><tr><th>Artículo</th><th>Precio USD</th><th>Equivale (tasa BCV)</th><th>Estado</th>${esSA() ? "<th></th>" : ""}</tr></thead><tbody>
      ${ts.map((x) => `<tr><td class="nombre">${esc(x.tipo_texto)}</td><td>${esSA() ? `<input data-p="${x.tipo}" value="${x.precio ?? ""}" placeholder="por definir" style="width:120px;height:34px;border-radius:8px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 10px">` : x.precio ? usd(x.precio) : "por definir"}</td>
        <td>${bs(x.precio)}</td><td><span class="est ${x.activa ? "ok" : "neutro"}">${x.activa ? "Activa" : x.precio ? "Pausada" : "Por definir"}</span></td>${esSA() ? `<td><button class="btn sec" data-g="${x.tipo}">Guardar</button></td>` : ""}</tr>`).join("")}
      <tr><td class="nombre">Inspección del técnico</td><td>${usd(c.costo)}</td><td>${bs(c.costo)}</td><td><span class="est ok">Fija</span></td>${esSA() ? "<td class='total'>Se cambia en el servidor</td>" : ""}</tr></tbody></table></div><p class="error" id="ef"></p>`;
    main.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => {
      const v = Number(main.querySelector(`[data-p="${b.dataset.g}"]`).value.replace(",", "."));
      api(`/admin/tarifas/${b.dataset.g}`, { method: "PUT", body: { precio: v || 0, activa: v > 0 } }).then(() => pintar()).catch((e) => ($("#ef").textContent = e.message));
    }));
  }
  async function pagPrecios(main) {
    const [pr, t] = await Promise.all([api("/precios"), api("/tasa")]);
    S.verBs = S.verBs || false;
    const tasa = Number(t.bs_por_usd || 0);
    const mon = (v) => (v ? (S.verBs && tasa ? "Bs " + (Number(v) * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2 }) : usd(v)) : "por definir");
    const cats = [...new Set(pr.items.map((i) => i.categoria))];
    const inp = (i, campo, v) => editaPrecios() ? `<input data-i="${i.id}" data-c="${campo}" value="${v ?? ""}" placeholder="por definir" inputmode="decimal" style="width:110px;height:34px;border-radius:8px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 10px">` : mon(v);
    main.innerHTML += `<p class="total" style="margin-top:-6px">Precio por artículo y por servicio. <b>Traslado</b>: retiro en tienda y entrega en su caja. <b>Instalación</b>: desembalaje, conexión a tomas existentes y retiro de residuos (el equipo ya está en casa). <b>Traslado + instalación</b>: el servicio completo (si lo dejas vacío, se usa la suma de los dos).</p>
      <div style="display:flex;gap:10px;align-items:center;margin:14px 0">
        <div class="card" style="min-height:0;padding:12px 16px;display:flex;gap:12px;align-items:center"><b>🔍 Inspección del técnico</b>${editaPrecios() ? `<input id="pi" value="${pr.inspeccion}" style="width:90px;height:34px;border-radius:8px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 10px"><button class="btn sec" id="gi">Guardar</button>` : `<span>${mon(pr.inspeccion)}</span>`}<span class="total">precio único, se cobra en caja</span></div>
        <div class="esp"></div>
        <div style="display:flex;background:var(--panel2);border:1px solid var(--borde);border-radius:12px;padding:3px">${[["usd", "$ Dólares"], ["bs", "Bs Bolívares"]].map(([k, l]) => `<button data-mon="${k}" class="btn" style="padding:8px 14px;${(k === "bs") === S.verBs ? "background:var(--acento);color:#06231A" : "background:none"}">${l}</button>`).join("")}</div>
        ${editaPrecios() ? `<button class="btn pri" id="gp">Guardar cambios</button>` : ""}</div>
      ${tasa ? `<p class="total">Tasa BCV: Bs ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2 })} por USD. Los precios se guardan en dólares; en bolívares se calculan con la tasa del día.</p>` : ""}
      ${cats.map((c) => `<div class="tabla" style="margin-bottom:16px"><div class="barra"><b style="flex:1">${esc(c)}</b></div><table><thead><tr><th>Artículo</th><th>Traslado</th><th>Instalación</th><th>Traslado + instalación</th><th>Estado</th></tr></thead><tbody>
        ${pr.items.filter((i) => i.categoria === c).map((i) => `<tr><td class="nombre">${esc(i.nombre)}</td>
          <td>${S.verBs ? mon(i.traslado) : inp(i, "traslado", i.traslado)}</td><td>${S.verBs ? mon(i.instalacion) : inp(i, "instalacion", i.instalacion)}</td>
          <td>${S.verBs ? mon(i.combo) : inp(i, "combo", i.combo_es_suma ? "" : i.combo)}${!S.verBs && i.combo_es_suma ? `<div class="total">suma: ${usd(i.combo)}</div>` : ""}</td>
          <td>${editaPrecios() ? `<button class="est ${i.activo ? "ok" : "neutro"}" data-act="${i.id}" style="border:0">${i.activo ? "Activo" : "Pausado"}</button>` : `<span class="est ${i.activo ? "ok" : "neutro"}">${i.activo ? "Activo" : "Pausado"}</span>`}</td></tr>`).join("")}</tbody></table></div>`).join("")}
      ${editaPrecios() ? `<div class="card" style="min-height:0;display:flex;gap:10px;align-items:center"><b>Agregar artículo de línea blanca</b><input id="nn" placeholder="Ej.: Enfriador de vinos" style="flex:1;height:38px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 12px"><button class="btn sec" id="na">Agregar</button></div>` : ""}
      <p class="error" id="ep"></p><p class="total" id="okp" style="color:var(--verde)"></p>`;
    const err = (e) => ($("#ep").textContent = e.message);
    main.querySelectorAll("[data-mon]").forEach((b) => (b.onclick = () => { S.verBs = b.dataset.mon === "bs"; pintar(); }));
    const gi = $("#gi"); if (gi) gi.onclick = () => api("/admin/precios-inspeccion", { method: "PUT", body: { precio: Number($("#pi").value.replace(",", ".")) } }).then(() => { $("#okp").textContent = "Inspección actualizada."; }).catch(err);
    const gp = $("#gp"); if (gp) gp.onclick = async () => {
      const cambios = {};
      main.querySelectorAll("[data-i]").forEach((x) => { const v = x.value.trim().replace(",", "."); (cambios[x.dataset.i] = cambios[x.dataset.i] || {})[x.dataset.c] = v === "" ? 0 : Number(v); });
      try { for (const [id, b] of Object.entries(cambios)) await api(`/admin/precios/${id}`, { method: "PUT", body: b }); $("#okp").textContent = "Precios guardados."; setTimeout(pintar, 700); } catch (e) { err(e); }
    };
    main.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => api(`/admin/precios/${b.dataset.act}`, { method: "PUT", body: { activo: b.textContent.trim() !== "Activo" } }).then(() => pintar()).catch(err)));
    const na = $("#na"); if (na) na.onclick = () => api("/admin/precios", { body: { nombre: $("#nn").value } }).then(() => pintar()).catch(err);
  }
  async function pagQrs(main) {
    const ts = await api("/admin/tiendas-qr");
    main.innerHTML += `<p class="total" style="margin-top:-6px">QR fijo de cada tienda aliada. Se imprime y se pega en la caja: el técnico lo escanea al llegar y la caja autoriza el retiro con un OK.</p>
      <div class="grid">${ts.map((t) => `<div class="card" style="text-align:center"><div class="tit" style="justify-content:center">${esc(t.nombre)}</div><div class="total">${esc(t.zona)} · ${esc(t.direccion)}</div>
        ${t.qr ? `<canvas data-c="${t.id}" width="200" height="200" style="margin:16px auto;display:block;background:#fff;border-radius:10px"></canvas><div class="total">${esc(t.qr)}</div>` : `<p class="total" style="margin:30px 0">Sin QR todavía.</p>`}
        ${esSA() ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:12px"><button class="btn ${t.qr ? "sec" : "pri"}" data-n="${t.id}">${t.qr ? "Cambiar QR" : "Generar QR"}</button>${t.qr ? `<a class="btn sec" href="#" data-im="${t.id}">Imprimir</a>` : ""}</div>` : ""}</div>`).join("")}</div>`;
    for (const t of ts) if (t.qr) dibujarQR(main.querySelector(`[data-c="${t.id}"]`), t.id);
    main.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => { if (b.textContent.includes("Cambiar") && !confirm("El QR impreso dejará de servir. ¿Cambiarlo?")) return; api(`/admin/tiendas/${b.dataset.n}/qr`, { body: {} }).then(() => pintar()); }));
    main.querySelectorAll("[data-im]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const cv = main.querySelector(`[data-c="${a.dataset.im}"]`); const w = window.open(""); w.document.write(`<img src="${cv.toDataURL()}" style="width:80%"><script>print()<\/script>`); }));
  }
  async function dibujarQR(canvas, tiendaId) {
    // el servidor genera la imagen del QR; se pinta en un canvas para poder imprimirla
    const r = await fetch(`/admin/tiendas/${tiendaId}/qr.png`, { headers: { Authorization: "Bearer " + S.token } });
    if (!r.ok) return;
    const img = new Image(); img.onload = () => canvas.getContext("2d").drawImage(img, 0, 0, 200, 200); img.src = URL.createObjectURL(await r.blob());
  }

  // ---------- Centro de mando: usuarios del personal, claves y limitaciones ----------
  // ---------- Finanzas y contabilidad ----------
  const FIN_TABS = [["resumen", "Resumen"], ["pagos", "Pagos recibidos"], ["gastos", "Gastos"], ["reclamos", "Reclamos"], ["cuentas", "Bancos y cuentas"], ["medios", "Tipos de pago"]];
  const GRAD = { "Zelle": "g-zelle", "Efectivo (cash)": "g-cash", "Banco nacional": "g-nac", "Banco internacional": "g-int", "Otro": "g-otro" };
  const ICONO_MEDIO = { zelle: "Z", efectivo: "$", banco_nacional: "🏦", banco_internacional: "🌎", otro: "＋" };
  const m2 = (x) => Number(x || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function lineas(a, b, alto = 150) {
    const n = Math.max(a.length, 2), max = Math.max(1, ...a, ...b), w = 600;
    const ruta = (serie) => serie.map((v, i) => `${i ? "L" : "M"}${((i * w) / (n - 1)).toFixed(1)} ${(alto - 10 - (v / max) * (alto - 30)).toFixed(1)}`).join(" ");
    return `<svg class="fin-lineas" viewBox="0 0 ${w} ${alto}" preserveAspectRatio="none">
      <defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${ruta(a)} L${w} ${alto} L0 ${alto} Z" fill="url(#gi)"/><path d="${ruta(a)}" fill="none" stroke="#fff" stroke-width="2.6" vector-effect="non-scaling-stroke"/>
      <path d="${ruta(b)}" fill="none" stroke="#FFC9A8" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function anillo(pc, color = "#fff") {
    const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pc || 0));
    return `<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="${r}" stroke="rgba(255,255,255,.22)" stroke-width="7" fill="none"/>
      <circle cx="35" cy="35" r="${r}" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 35 35)"/>
      <text x="35" y="40" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">${Math.round(v)}%</text></svg>`;
  }
  function barritas(vals) {
    const max = Math.max(1, ...vals);
    return `<div class="barritas">${vals.map((v) => `<i style="height:${Math.max(6, (v / max) * 100)}%"></i>`).join("")}</div>`;
  }
  async function finanzas(main) {
    S.finTab = S.finTab || "resumen"; S.finDias = S.finDias || 30;
    const cat = await api("/finanzas/catalogo");
    const edita = cat.puede_editar;
    main.innerHTML += `<div class="fin-barra"><div class="tabs">${FIN_TABS.map(([k, t]) => `<button class="${S.finTab === k ? "on" : ""}" data-ft="${k}">${t}</button>`).join("")}</div>
      <div class="fin-acc">${edita ? `<button class="btn sec" data-nuevo="ingreso">＋ Ingreso</button><button class="btn sec" data-nuevo="reclamo">＋ Reclamo</button><button class="btn pri" data-nuevo="gasto">＋ Registrar gasto</button>` : ""}</div></div><div id="fin"></div>`;
    main.querySelectorAll("[data-ft]").forEach((b) => (b.onclick = () => { S.finTab = b.dataset.ft; pintar(true); }));
    main.querySelectorAll("[data-nuevo]").forEach((b) => (b.onclick = () => (b.dataset.nuevo === "reclamo" ? fichaReclamo(cat, null) : fichaMovimiento(cat, b.dataset.nuevo))));
    const fin = $("#fin");
    if (S.finTab === "resumen") return finResumen(fin, cat);
    if (S.finTab === "pagos") return finPagos(fin);
    if (S.finTab === "gastos") return finGastos(fin, cat);
    if (S.finTab === "reclamos") return finReclamos(fin, cat);
    if (S.finTab === "cuentas") return finCuentas(fin, cat);
    return finMedios(fin, cat);
  }
  async function finResumen(fin, cat) {
    const r = await api(`/finanzas/resumen?dias=${S.finDias}`), recl = await api("/finanzas/reclamos");
    const abiertos = recl.filter((x) => ["abierto", "en_revision"].includes(x.estado)).slice(0, 3);
    const ing = Number(r.ingresos_usd), gas = Number(r.gastos_usd), res = Number(r.resultado_usd);
    const totMedio = Object.values(r.por_medio).reduce((a, b) => a + b, 0);
    const tile = (ic, t, v, nota, serie) => `<div class="fin-kpi"><div class="fk-t"><span class="fk-ic">${ic}</span>${t}</div><div class="fk-v">${v}</div><div class="fk-n">${nota}</div>${serie ? spark(serie, 34) : ""}</div>`;
    fin.innerHTML = `<div class="fin-kpis">
        ${tile("↗", "Ingresos", "$" + m2(ing), `Últimos ${r.dias} días`, r.serie_ingresos)}
        ${tile("↘", "Gastos", "$" + m2(gas), "Pagos, nómina y más", r.serie_gastos)}
        ${tile("≈", "Resultado", (res < 0 ? "−$" : "$") + m2(Math.abs(res)), res < 0 ? "Pérdida del período" : "Ganancia del período")}
        ${tile("%", "Margen", r.margen === null ? "—" : r.margen + "%", "Resultado sobre ingresos")}
        ${tile("!", "Reclamos abiertos", r.reclamos_abiertos, "$" + m2(r.reclamos_monto_usd) + " en disputa")}
        ${tile("Bs", "Tasa BCV", r.tasa ? m2(r.tasa) : "—", r.tasa ? "Bs por USD" : "Sin cargar")}</div>
      <div class="fin-medio">
        <div class="fin-lado"><div class="fin-lado-t">⚑ Reclamos por atender <a href="#" data-ir="reclamos">Ver todos</a></div>
          ${abiertos.length ? abiertos.map((x, i) => `<div class="mini-grad mg${i}" data-rec="${x.id}"><span class="chip-est">${esc(x.estado_texto)}</span><b>$${m2(x.monto_usd)}</b>
            <div class="mg-t">${esc(x.cliente)}</div><div class="mg-s">${esc(x.motivo)}${x.orden ? " · " + esc(x.orden) : ""}</div><span class="mg-ir">›</span></div>`).join("")
            : `<div class="fin-vacio">Sin reclamos abiertos. 🎉</div>`}
          <div class="fin-lado-t" style="margin-top:12px">⇄ Bancos y cuentas</div>
          ${r.cuentas.length ? r.cuentas.slice(0, 3).map((c) => `<div class="cta-mini"><span class="fk-ic">${ICONO_MEDIO[c.categoria] || "🏦"}</span><div><b>${esc(c.nombre)}</b><small>${esc(c.categoria_texto)} · ${esc(c.identificador || "")}</small></div><span>${c.moneda === "Bs" ? "Bs" : "$"} ${m2(c.saldo)}</span></div>`).join("")
            : `<div class="fin-vacio">Agrega tus bancos en «Bancos y cuentas».</div>`}
        </div>
        <div class="fin-hero"><div class="fh-top"><span class="chip-est">💼 Estado del negocio</span>
            <select class="sel" id="fdias">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${d === S.finDias ? "selected" : ""}>${d === 365 ? "1 año" : d + " días"}</option>`).join("")}</select></div>
          <div class="fh-tit">${res < 0 ? "Pérdida" : "Ganancia"} del período</div><div class="fh-num">${res < 0 ? "−" : ""}$${m2(Math.abs(res))}</div>
          <div class="fh-sub">Entraron <b>$${m2(ing)}</b> y salieron <b>$${m2(gas)}</b> · <span class="ley"><i></i>Ingresos</span> <span class="ley l2"><i></i>Gastos</span></div>
          ${lineas(r.serie_ingresos, r.serie_gastos)}
          <div class="fh-acc"><button class="btn blanco" data-ir="pagos">▸ Ver pagos</button><button class="btn vidrio" id="fexp">⇩ Exportar</button></div></div>
      </div>
      <div class="fin-sec-t">Ingresos por tipo de pago <small>${totMedio ? "$" + m2(totMedio) + " en el período" : "Aún no hay cobros en el período"}</small></div>
      <div class="fin-grads">${["Zelle", "Efectivo (cash)", "Banco nacional", "Banco internacional", "Otro"].map((k) => { const v = r.por_medio[k] || 0, pc = totMedio ? (v * 100) / totMedio : 0;
        return `<div class="grad ${GRAD[k]}"><div class="gr-top"><span class="chip-est">${pc ? "↗ " + Math.round(pc) + "%" : "—"}</span><span class="gr-ic">${{ "Zelle": "Z", "Efectivo (cash)": "$", "Banco nacional": "🏦", "Banco internacional": "🌎", "Otro": "＋" }[k]}</span></div>
          <div class="gr-c">${anillo(pc)}</div><div class="gr-t">${k}</div><div class="gr-v">$${m2(v)}</div></div>`; }).join("")}</div>
      <div class="fin-dos">
        <div class="card"><div class="tit"><span>Gastos por categoría</span><span class="total">$${m2(gas)}</span></div>${Object.keys(r.gastos_por_categoria).length ? `<div class="barras-h">${Object.entries(r.gastos_por_categoria).map(([k, v]) => `<div><span>${esc(k)}</span><i style="width:${(v * 100) / Math.max(...Object.values(r.gastos_por_categoria))}%"></i><b>$${m2(v)}</b></div>`).join("")}</div>` : `<div class="fin-vacio">Sin gastos en el período.</div>`}</div>
        <div class="card"><div class="tit"><span>Ingresos por concepto</span><span class="total">$${m2(ing)}</span></div>${dona(Object.fromEntries(Object.entries(r.ingresos_por_categoria).map(([k, v]) => [k, Math.round(v)])))}
          <div class="total" style="margin-top:10px">Por moneda: ${Object.entries(r.por_moneda).map(([k, v]) => `${k} $${m2(v)}`).join(" · ") || "—"}</div></div>
      </div>`;
    $("#fdias").onchange = (e) => { S.finDias = Number(e.target.value); pintar(true); };
    fin.querySelectorAll("[data-ir]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.finTab = a.dataset.ir; pintar(true); }));
    fin.querySelectorAll("[data-rec]").forEach((d) => (d.onclick = () => fichaReclamo(cat, recl.find((x) => x.id === Number(d.dataset.rec)))));
    $("#fexp").onclick = async () => {
      const filas = await api("/finanzas/pagos"), gastos = await api("/finanzas/movimientos?tipo=gasto");
      const csv = [["Tipo", "Fecha", "Concepto", "Detalle", "Tipo de pago", "Moneda", "Monto USD", "Referencia", "Orden", "Estado"]]
        .concat(filas.map((f) => ["Ingreso", f.fecha, f.categoria_texto, f.descripcion, f.medio, f.moneda, f.monto_usd, f.referencia, f.orden, f.estado]))
        .concat(gastos.map((g) => ["Gasto", g.fecha, g.categoria_texto, g.descripcion, g.medio || "", g.moneda, g.monto_usd, g.referencia, g.orden, g.estado]))
        .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `aha-home-finanzas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    };
  }
  function tablaFin(cols, filas, acc) {
    return `<div class="tabla"><table><thead><tr>${cols.map(([, t]) => `<th>${t}</th>`).join("")}${acc ? "<th></th>" : ""}</tr></thead><tbody>
      ${filas.length ? filas.map((f, i) => `<tr>${cols.map(([k]) => `<td>${f[k] ?? "—"}</td>`).join("")}${acc ? `<td>${acc(f, i)}</td>` : ""}</tr>`).join("") : `<tr><td colspan="${cols.length + 1}" class="total" style="text-align:center;padding:26px">Todavía no hay registros.</td></tr>`}</tbody></table></div>`;
  }
  const estFin = (e) => `<span class="est ${{ cobrado: "ok", confirmado: "ok", conciliado: "ok", reembolsado: "ok", registrado: "neutro", abierto: "pend", en_revision: "pend", "por confirmar": "pend", anulado: "mal", rechazado: "mal" }[e] || "neutro"}">${esc(String(e).replace("_", " "))}</span>`;
  async function finPagos(fin) {
    const filas = (await api("/finanzas/pagos")).map((f) => ({ ...f, fecha: esc(f.fecha), concepto: `<b>${esc(f.categoria_texto)}</b><br><small class="total">${esc(f.descripcion || "")}</small>`,
      medio: esc(f.medio || "—"), monto: `<b>$${m2(f.monto_usd)}</b>${f.monto_bs ? `<br><small class="total">Bs ${m2(f.monto_bs)}</small>` : ""}`, ref: esc(f.referencia || "—"), orden: esc(f.orden || "—"),
      origen: `<span class="est neutro">${f.origen === "manual" ? "Registro manual" : f.origen === "caja" ? "Caja" : f.origen === "presupuesto" ? "Presupuesto" : "Penalidad"}</span>`, est: estFin(f.estado) }));
    fin.innerHTML = `<p class="total">Todo lo que entró: los cobros de la caja, los presupuestos y las penalidades llegan solos; los demás ingresos se registran con «＋ Ingreso».</p>` +
      tablaFin([["fecha", "Fecha"], ["concepto", "Concepto"], ["medio", "Tipo de pago"], ["monto", "Monto"], ["ref", "Referencia"], ["orden", "Orden"], ["origen", "Origen"], ["est", "Estado"]], filas);
  }
  async function finGastos(fin, cat) {
    const gs = await api("/finanzas/movimientos?tipo=gasto");
    const filas = gs.map((g) => ({ fecha: esc(g.fecha), cat: `<b>${esc(g.categoria_texto)}</b><br><small class="total">${esc(g.descripcion || "")}</small>`, medio: esc(g.medio || "—"), cuenta: esc(g.cuenta || "—"),
      monto: `<b>$${m2(g.monto_usd)}</b>${g.moneda === "Bs" ? `<br><small class="total">Bs ${m2(g.monto)} · tasa ${m2(g.tasa)}</small>` : ""}`, ref: esc(g.referencia || "—"), est: estFin(g.estado), _id: g.id, _e: g.estado }));
    fin.innerHTML = `<p class="total">Pagos a técnicos, materiales, nómina, servidor, publicidad, comisiones, impuestos y reembolsos. Los montos en bolívares se pasan a dólares con la tasa del día.</p>` +
      tablaFin([["fecha", "Fecha"], ["cat", "Categoría"], ["medio", "Tipo de pago"], ["cuenta", "Cuenta"], ["monto", "Monto"], ["ref", "Referencia"], ["est", "Estado"]], filas,
        cat.puede_editar ? (f) => f._e === "anulado" ? "" : `<div class="acc">${f._e !== "conciliado" ? `<button title="Conciliar" data-mov="${f._id}" data-e="conciliado">✓</button>` : ""}<button title="Anular" data-mov="${f._id}" data-e="anulado">✕</button></div>` : null);
    fin.querySelectorAll("[data-mov]").forEach((b) => (b.onclick = () => api(`/finanzas/movimientos/${b.dataset.mov}`, { method: "PUT", body: { estado: b.dataset.e } }).then(() => pintar(true))));
  }
  async function finReclamos(fin, cat) {
    const rs = await api("/finanzas/reclamos");
    fin.innerHTML = `<p class="total">Reclamos de dinero de clientes o tiendas. Al marcar uno como «Reembolsado», el reembolso queda registrado como gasto.</p>` +
      tablaFin([["codigo", "Código"], ["cliente", "Cliente"], ["orden", "Orden"], ["motivo", "Motivo"], ["monto", "Monto"], ["est", "Estado"]],
        rs.map((x) => ({ codigo: `<b>${x.codigo}</b>`, cliente: esc(x.cliente), orden: esc(x.orden || "—"), motivo: esc(x.motivo), monto: "$" + m2(x.monto_usd), est: estFin(x.estado), _x: x })),
        cat.puede_editar ? (f) => `<div class="acc"><button title="Atender" data-rc="${f._x.id}">✎</button></div>` : null);
    fin.querySelectorAll("[data-rc]").forEach((b) => (b.onclick = () => fichaReclamo(cat, rs.find((x) => x.id === Number(b.dataset.rc)))));
  }
  async function finCuentas(fin, cat) {
    const cs = await api("/finanzas/cuentas");
    fin.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><p class="total">Bancos nacionales e internacionales, Zelle y cajas de efectivo donde entra o sale el dinero.</p>
      ${cat.puede_editar ? `<button class="btn pri" id="ncta">＋ Agregar banco o cuenta</button>` : ""}</div>
      <div class="fin-grads">${cs.length ? cs.map((c, i) => `<div class="grad ${({ zelle: "g-zelle", efectivo: "g-cash", banco_nacional: "g-nac", banco_internacional: "g-int" })[c.categoria] || "g-otro"} ${c.activo ? "" : "apagada"}" data-cta="${i}">
          <div class="gr-top"><span class="chip-est">${esc(c.categoria_texto)}</span><span class="gr-ic">${ICONO_MEDIO[c.categoria] || "🏦"}</span></div>
          <div class="gr-t" style="margin-top:22px">${esc(c.nombre)}</div><div class="total" style="color:rgba(255,255,255,.8)">${esc(c.banco || "")} ${esc(c.identificador || "")}</div>
          <div class="gr-v">${c.moneda === "Bs" ? "Bs" : "$"} ${m2(c.saldo ?? c.saldo_inicial)}</div><div class="total" style="color:rgba(255,255,255,.75)">${c.activo ? "Saldo según registros" : "Pausada"}</div></div>`).join("")
        : `<div class="fin-vacio">Todavía no hay cuentas. Agrega tu primer banco.</div>`}</div>`;
    const n = $("#ncta"); if (n) n.onclick = () => fichaCuenta(cat, null);
    if (cat.puede_editar) fin.querySelectorAll("[data-cta]").forEach((d) => (d.onclick = () => fichaCuenta(cat, cs[d.dataset.cta])));
  }
  async function finMedios(fin, cat) {
    fin.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><p class="total">Tipos de pago que acepta AHA HOME. Los de la caja vienen del sistema; puedes agregar otros (por ejemplo Binance, PayPal o cheque).</p>
      ${cat.puede_editar ? `<button class="btn pri" id="nmed">＋ Agregar tipo de pago</button>` : ""}</div>` +
      tablaFin([["nombre", "Tipo de pago"], ["cat", "Categoría"], ["moneda", "Moneda"], ["origen", "Origen"], ["est", "Estado"]],
        cat.medios.map((m) => ({ nombre: `<span class="fk-ic">${ICONO_MEDIO[m.categoria] || "＋"}</span> <b>${esc(m.nombre)}</b>`, cat: esc(m.categoria_texto), moneda: m.moneda,
          origen: m.del_sistema ? '<span class="est neutro">Caja</span>' : '<span class="est pend">Agregado</span>', est: m.activo ? '<span class="est ok">Activo</span>' : '<span class="est mal">Pausado</span>', _m: m })),
        cat.puede_editar ? (f) => `<div class="acc"><button title="Editar" data-med="${f._m.id}">✎</button></div>` : null);
    const n = $("#nmed"); if (n) n.onclick = () => fichaMedio(cat, null);
    fin.querySelectorAll("[data-med]").forEach((b) => (b.onclick = () => fichaMedio(cat, cat.medios.find((m) => m.id === Number(b.dataset.med)))));
  }
  function cajonFin(titulo, cuerpo, alGuardar) {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">Finanzas</span><button class="btn sec" id="cer">✕</button></div>
      <h2 style="margin-top:8px">${titulo}</h2>${cuerpo}<div style="margin-top:18px"><button class="btn pri" id="fg">Guardar</button></div><p class="error" id="ferr"></p>`;
    document.body.appendChild(c); $("#cer").onclick = () => c.remove();
    $("#fg").onclick = async () => { try { await alGuardar(); c.remove(); pintar(true); } catch (e) { $("#ferr").textContent = e.message; } };
    return c;
  }
  const finCampo = (id, l, v = "", t = "text", extra = "") => `<label class="flab">${l}</label><input id="${id}" type="${t}" value="${esc(v)}" class="finp" ${extra}>`;
  const finSel = (id, l, ops, v) => `<label class="flab">${l}</label><select id="${id}" class="finp">${ops.map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  function fichaMovimiento(cat, tipo) {
    const cats = Object.entries(tipo === "gasto" ? cat.gastos : cat.ingresos);
    cajonFin(tipo === "gasto" ? "Registrar gasto" : "Registrar ingreso",
      finSel("mc", "Categoría", cats, cats[0][0]) + finCampo("md", "Descripción", "", "text", 'placeholder="Ej. pago semanal grupo A"') + finCampo("mf", "Fecha", new Date().toISOString().slice(0, 10), "date") +
      `<div class="fila2"><div>${finCampo("mm", "Monto", "", "number", 'step="0.01" min="0"')}</div><div>${finSel("mo", "Moneda", [["USD", "Dólares"], ["Bs", "Bolívares"]], "USD")}</div></div>
       <div class="total" id="mconv"></div>` +
      finSel("mp", "Tipo de pago", [["", "—"]].concat(cat.medios.filter((m) => m.activo).map((m) => [m.id, m.nombre])), "") +
      finSel("mk", "Cuenta", [["", "—"]].concat(cat.cuentas.filter((c) => c.activo).map((c) => [c.id, c.nombre])), "") +
      finCampo("mr", "Referencia", "") + finCampo("mn", "Orden (opcional)", "", "text", 'placeholder="WO-1234"'),
      () => api("/finanzas/movimientos", { body: { tipo, categoria: $("#mc").value, descripcion: $("#md").value, fecha: $("#mf").value, monto: Number($("#mm").value), moneda: $("#mo").value,
        medio_id: $("#mp").value ? Number($("#mp").value) : null, cuenta_id: $("#mk").value ? Number($("#mk").value) : null, referencia: $("#mr").value, orden: $("#mn").value } }));
    const conv = () => { const v = Number($("#mm").value || 0); $("#mconv").textContent = $("#mo").value === "Bs" && cat.tasa ? `≈ $${m2(v / cat.tasa)} a la tasa BCV de Bs ${m2(cat.tasa)}` : ""; };
    $("#mm").oninput = conv; $("#mo").onchange = conv;
  }
  function fichaReclamo(cat, x) {
    if (!x) return cajonFin("Nuevo reclamo", finCampo("rcl", "Cliente o tienda") + finCampo("ror", "Orden (opcional)", "", "text", 'placeholder="WO-1234"') +
      `<label class="flab">Motivo</label><textarea id="rmo" class="finp" rows="3" placeholder="Ej. cobro doble en caja"></textarea>` + finCampo("rmn", "Monto en disputa (USD)", "", "number", 'step="0.01" min="0"'),
      () => api("/finanzas/reclamos", { body: { cliente: $("#rcl").value, orden: $("#ror").value, motivo: $("#rmo").value, monto: Number($("#rmn").value || 0) } }));
    cajonFin(`Reclamo ${x.codigo}`, `<div class="card" style="min-height:0;margin-top:10px"><b>${esc(x.cliente)}</b>${x.orden ? " · " + esc(x.orden) : ""}<div class="total">${esc(x.motivo)}</div><div class="grande">$${m2(x.monto_usd)}</div></div>` +
      finSel("res", "Estado", Object.entries(cat.estados_reclamo), x.estado) + `<label class="flab">Resolución</label><textarea id="rrs" class="finp" rows="3">${esc(x.resolucion || "")}</textarea>` +
      finSel("rmp", "Se devolvió por", [["", "—"]].concat(cat.medios.filter((m) => m.activo).map((m) => [m.id, m.nombre])), "") +
      finSel("rct", "Desde la cuenta", [["", "—"]].concat(cat.cuentas.filter((c) => c.activo).map((c) => [c.id, c.nombre])), "") +
      `<div class="total" style="margin-top:8px">Si lo marcas «Reembolsado», el monto queda registrado como gasto (Reembolsos a clientes).</div>`,
      () => api(`/finanzas/reclamos/${x.id}`, { method: "PUT", body: { estado: $("#res").value, resolucion: $("#rrs").value, medio_id: $("#rmp").value ? Number($("#rmp").value) : null, cuenta_id: $("#rct").value ? Number($("#rct").value) : null } }));
  }
  function fichaCuenta(cat, c) {
    cajonFin(c ? esc(c.nombre) : "Agregar banco o cuenta",
      finCampo("cn", "Nombre", c?.nombre, "text", 'placeholder="Ej. Banesco operativa"') + finSel("cc", "Tipo", Object.entries(cat.categorias_medio), c?.categoria || "banco_nacional") +
      finCampo("cb", "Banco", c?.banco, "text", 'placeholder="Ej. Banesco, Mercantil, Bank of America"') + finSel("cm", "Moneda", [["Bs", "Bolívares"], ["USD", "Dólares"]], c?.moneda || "Bs") +
      finCampo("ct", "Titular", c?.titular, "text", 'placeholder="Onyxa LLC"') + finCampo("ci", "Número de cuenta, teléfono o correo Zelle", c?.identificador) +
      finCampo("cs", "Saldo inicial", c?.saldo_inicial ?? "0", "number", 'step="0.01"') + (c ? `<label class="flab"><input type="checkbox" id="ca" ${c.activo ? "checked" : ""}> Activa</label>` : ""),
      () => api(c ? `/finanzas/cuentas/${c.id}` : "/finanzas/cuentas", { method: c ? "PUT" : "POST", body: { nombre: $("#cn").value, categoria: $("#cc").value, banco: $("#cb").value, moneda: $("#cm").value,
        titular: $("#ct").value, identificador: $("#ci").value, saldo_inicial: Number($("#cs").value || 0), activo: c ? $("#ca").checked : true } }));
  }
  function fichaMedio(cat, m) {
    cajonFin(m ? esc(m.nombre) : "Agregar tipo de pago",
      finCampo("pn", "Nombre", m?.nombre, "text", 'placeholder="Ej. Binance Pay, PayPal, cheque"') +
      (m?.del_sistema ? `<div class="total" style="margin-top:8px">Este tipo de pago lo usa la caja: solo puedes cambiarle el nombre o pausarlo.</div>` :
        finSel("pc", "Categoría", Object.entries(cat.categorias_medio), m?.categoria || "otro") + finSel("pm", "Moneda", [["USD", "Dólares"], ["Bs", "Bolívares"]], m?.moneda || "USD")) +
      (m ? `<label class="flab"><input type="checkbox" id="pa" ${m.activo ? "checked" : ""}> Activo</label>` : ""),
      () => api(m ? `/finanzas/medios/${m.id}` : "/finanzas/medios", { method: m ? "PUT" : "POST", body: { nombre: $("#pn").value, categoria: $("#pc") ? $("#pc").value : m.categoria,
        moneda: $("#pm") ? $("#pm").value : m.moneda, activo: m ? $("#pa").checked : true } }));
  }

  // ---------- Diseño de la app: el panel controla colores, textos, menús y avisos ----------
  const ICO_MENU = { inicio: "🏠", pedidos: "🧾", mensajes: "💬", cuenta: "👤", avisos: "🔔", soporte: "🎧", ordenes: "📄", mapa: "📍", perfil: "👤" };
  const MENUS_NOMBRE = { cliente: "Cliente · menú de abajo", cliente_lateral: "Cliente · menú ☰", tecnico: "Técnico · menú de abajo" };
  const VISTAS = [["portada", "Portada"], ["cliente", "Inicio del cliente"], ["cliente_lateral", "Menú ☰ del cliente"], ["tecnico", "Inicio del técnico"], ["caja", "Inicio de la caja"]];
  async function diseno(main) {
    S.dis = S.dis || await api("/admin/interfaz");
    S.disVista = S.disVista || "portada"; S.disSec = S.disSec || "marca";
    const D = S.dis.borrador;
    const sec = (k, t) => `<button class="${S.disSec === k ? "on" : ""}" data-ds="${k}">${t}</button>`;
    main.innerHTML += `<div class="dis-estado ${S.dis.hay_cambios ? "pend" : ""}">
        <div><b>${S.dis.hay_cambios ? "● Tienes cambios sin publicar" : "✓ La app muestra la versión publicada"}</b><span class="total"> · ${S.dis.version ? "Versión publicada #" + S.dis.version : "La app usa el diseño de fábrica"}. Los cambios llegan a la app al publicarlos, sin publicar una app nueva.</span></div>
        <div class="fin-acc"><button class="btn sec" id="dgu">Guardar borrador</button>${S.dis.hay_cambios ? `<button class="btn sec" id="dde">Descartar cambios</button>` : ""}<button class="btn pri" id="dpu" ${S.dis.hay_cambios ? "" : "disabled"}>Publicar en la app</button></div></div>
      <div class="dis">
        <div class="dis-edit">
          <div class="tabs">${sec("marca", "Marca y colores")}${sec("portada", "Portada")}${sec("menus", "Menús")}${sec("aviso", "Aviso")}${sec("historial", "Historial")}</div>
          <div id="dform"></div>
        </div>
        <div class="dis-prev"><div class="tabs chica">${VISTAS.map(([k, t]) => `<button class="${S.disVista === k ? "on" : ""}" data-dv="${k}">${t}</button>`).join("")}</div>
          <div class="telefono"><div class="tel-isla"></div><div class="tel-pantalla" id="dprev"></div></div>
          <div class="total" style="text-align:center;margin-top:8px">Vista previa del borrador · se actualiza mientras escribes</div></div>
      </div>`;
    main.querySelectorAll("[data-ds]").forEach((b) => (b.onclick = () => { S.disSec = b.dataset.ds; if (b.dataset.ds === "menus" && !["cliente", "cliente_lateral", "tecnico"].includes(S.disVista)) S.disVista = "cliente"; if (b.dataset.ds === "portada") S.disVista = "portada"; pintar(true); }));
    main.querySelectorAll("[data-dv]").forEach((b) => (b.onclick = () => { S.disVista = b.dataset.dv; vistaPrevia(D); main.querySelectorAll("[data-dv]").forEach((x) => x.classList.toggle("on", x === b)); }));
    const guardar = async () => { S.dis = await api("/admin/interfaz/borrador", { method: "PUT", body: { datos: D } }); };
    $("#dgu").onclick = async () => { await guardar(); pintar(true); };
    const de = $("#dde"); if (de) de.onclick = async () => { S.dis = await api("/admin/interfaz/descartar", { body: {} }); pintar(true); };
    $("#dpu").onclick = () => publicarDiseno(guardar);
    formDiseno(D, () => { S.dis.hay_cambios = true; $("#dpu").disabled = false; $(".dis-estado").classList.add("pend"); $(".dis-estado b").textContent = "● Tienes cambios sin publicar"; vistaPrevia(D); });
    vistaPrevia(D);
  }
  function publicarDiseno(guardar) {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">Diseño de la app</span><button class="btn sec" id="cer">✕</button></div>
      <h2 style="margin-top:8px">Publicar en la app</h2><div class="total">La próxima vez que cada persona abra la app verá el diseño nuevo. Queda en el historial y puedes volver atrás cuando quieras.</div>
      <label class="flab">¿Qué cambiaste? (para el historial)</label><input id="dnota" class="finp" placeholder="Ej. Aviso de feriado y menú más corto">
      <div style="margin-top:18px;display:flex;gap:8px"><button class="btn pri" id="dok">Publicar ahora</button><button class="btn sec" id="dno">Cancelar</button></div><p class="error" id="derr"></p>`;
    document.body.appendChild(c);
    $("#cer").onclick = $("#dno").onclick = () => c.remove();
    $("#dok").onclick = async () => { try { await guardar(); S.dis = await api("/admin/interfaz/publicar", { body: { nota: $("#dnota").value } }); c.remove(); pintar(true); } catch (e) { $("#derr").textContent = e.message; } };
  }
  function formDiseno(D, cambio) {
    const f = $("#dform");
    const inp = (ruta, l, v, extra = "") => `<label class="flab">${l}</label><input class="finp" data-r="${ruta}" value="${esc(v)}" ${extra}>`;
    if (S.disSec === "marca") {
      f.innerHTML = inp("marca.nombre", "Nombre de la app", D.marca.nombre, 'maxlength="30"') + inp("marca.eslogan", "Eslogan", D.marca.eslogan, 'maxlength="60"') +
        `<label class="flab">Colores</label><div class="colores">${[["marino", "Principal (azul marino)"], ["lima", "Acento (lima)"], ["naranja", "Botones de acción (naranja)"], ["fondo", "Fondo de pantallas"]]
          .map(([k, t]) => `<label class="color"><input type="color" data-c="${k}" value="${D.marca.colores[k]}"><span><b>${t}</b><small>${D.marca.colores[k]}</small></span></label>`).join("")}</div>
        <button class="enlace" id="dfab" style="align-self:flex-start">Volver a los colores de fábrica</button>`;
      f.querySelectorAll("[data-c]").forEach((x) => (x.oninput = () => { D.marca.colores[x.dataset.c] = x.value.toUpperCase(); x.nextElementSibling.querySelector("small").textContent = x.value.toUpperCase(); cambio(); }));
      $("#dfab").onclick = () => { D.marca.colores = { ...S.dis.defecto.marca.colores }; formDiseno(D, cambio); cambio(); };
    } else if (S.disSec === "portada") {
      f.innerHTML = inp("portada.titulo", "Título", D.portada.titulo, 'maxlength="60"') + `<label class="flab">Texto debajo del título</label><textarea class="finp" rows="3" data-r="portada.subtitulo" maxlength="180">${esc(D.portada.subtitulo)}</textarea>` +
        `<label class="flab">Los 4 pasos</label>` + D.portada.pasos.map((p, i) => `<div class="fila2">${`<input class="finp" data-r="portada.pasos.${i}.titulo" value="${esc(p.titulo)}" maxlength="40">`}${`<input class="finp" data-r="portada.pasos.${i}.detalle" value="${esc(p.detalle)}" maxlength="50">`}</div>`).join("") +
        inp("portada.boton_crear", "Botón naranja", D.portada.boton_crear, 'maxlength="30"') + inp("portada.boton_entrar", "Botón azul", D.portada.boton_entrar, 'maxlength="34"');
    } else if (S.disSec === "menus") {
      f.innerHTML = Object.keys(MENUS_NOMBRE).map((m) => `<div class="dis-menu"><div class="dm-t">${MENUS_NOMBRE[m]}</div>${D.menus[m].map((it, i) => `<div class="dm-fila">
          <span class="dm-ic">${ICO_MENU[it.id] || "•"}</span><input class="finp" data-m="${m}" data-i="${i}" value="${esc(it.texto)}" maxlength="22">
          <label class="sw" title="${it.id === "inicio" ? "Inicio siempre se muestra" : "Mostrar u ocultar"}"><input type="checkbox" data-mv="${m}" data-i="${i}" ${it.visible ? "checked" : ""} ${it.id === "inicio" ? "disabled" : ""}><i></i></label>
          <button class="dm-b" data-sube="${m}" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button class="dm-b" data-baja="${m}" data-i="${i}" ${i === D.menus[m].length - 1 ? "disabled" : ""}>↓</button></div>`).join("")}</div>`).join("") +
        `<div class="total">Cambia el nombre, el orden (↑ ↓) o apaga los botones que no quieras mostrar. «Inicio» siempre queda visible.</div>`;
      f.querySelectorAll("[data-m]").forEach((x) => (x.oninput = () => { D.menus[x.dataset.m][x.dataset.i].texto = x.value; S.disVista = x.dataset.m; cambio(); }));
      f.querySelectorAll("[data-mv]").forEach((x) => (x.onchange = () => { D.menus[x.dataset.mv][x.dataset.i].visible = x.checked; S.disVista = x.dataset.mv; cambio(); }));
      const mover = (m, i, d) => { const a = D.menus[m]; [a[i], a[i + d]] = [a[i + d], a[i]]; S.disVista = m; formDiseno(D, cambio); cambio(); };
      f.querySelectorAll("[data-sube]").forEach((x) => (x.onclick = () => mover(x.dataset.sube, Number(x.dataset.i), -1)));
      f.querySelectorAll("[data-baja]").forEach((x) => (x.onclick = () => mover(x.dataset.baja, Number(x.dataset.i), 1)));
    } else if (S.disSec === "aviso") {
      const A = D.aviso;
      f.innerHTML = `<label class="flab" style="display:flex;gap:10px;align-items:center"><span class="sw"><input type="checkbox" id="aact" ${A.activo ? "checked" : ""}><i></i></span> Mostrar un aviso arriba del inicio</label>
        <label class="flab">Texto del aviso</label><textarea class="finp" rows="3" id="atx" maxlength="160" placeholder="Ej. El 24 de diciembre no hay servicio de instalación.">${esc(A.texto)}</textarea>
        <label class="flab">Color</label><div class="fin-acc">${[["info", "Informativo"], ["ok", "Buena noticia"], ["alerta", "Importante"]].map(([k, t]) => `<button class="btn ${A.tono === k ? "pri" : "sec"}" data-at="${k}">${t}</button>`).join("")}</div>
        <label class="flab">¿Quién lo ve?</label><div class="fin-acc">${[["cliente", "Clientes"], ["tecnico", "Técnicos"], ["agente", "Caja"]].map(([k, t]) => `<label class="chipsel"><input type="checkbox" data-ap="${k}" ${A.para.includes(k) ? "checked" : ""}> ${t}</label>`).join("")}</div>`;
      $("#aact").onchange = (e) => { A.activo = e.target.checked; cambio(); };
      $("#atx").oninput = (e) => { A.texto = e.target.value; if (A.texto && !A.activo) { A.activo = true; $("#aact").checked = true; } cambio(); };
      f.querySelectorAll("[data-at]").forEach((x) => (x.onclick = () => { A.tono = x.dataset.at; formDiseno(D, cambio); cambio(); }));
      f.querySelectorAll("[data-ap]").forEach((x) => (x.onchange = () => { A.para = [...f.querySelectorAll("[data-ap]:checked")].map((y) => y.dataset.ap); cambio(); }));
      if (!["cliente", "tecnico", "caja"].includes(S.disVista)) S.disVista = "cliente";
    } else {
      f.innerHTML = `<div class="dis-hist">${S.dis.historial.length ? S.dis.historial.map((h) => `<div class="dh-f"><div><b>#${h.id} · ${esc(h.nota || "Cambios de diseño")}</b><small>${esc(h.por)} · ${fmt("", h.en)}</small></div>
          ${h.estado === "publicada" ? '<span class="est ok">En la app</span>' : `<button class="btn sec" data-res="${h.id}">Volver a esta versión</button>`}</div>`).join("") : `<div class="fin-vacio">Todavía no has publicado cambios: la app usa el diseño de fábrica.</div>`}</div>
        <div class="total" style="margin-top:10px">«Volver a esta versión» la copia al borrador para que la revises y la publiques.</div>`;
      f.querySelectorAll("[data-res]").forEach((x) => (x.onclick = async () => { S.dis = await api(`/admin/interfaz/restaurar/${x.dataset.res}`, { body: {} }); S.disSec = "marca"; pintar(true); }));
    }
    f.querySelectorAll("[data-r]").forEach((x) => (x.oninput = () => { const k = x.dataset.r.split("."); let o = D; while (k.length > 1) o = o[k.shift()]; o[k[0]] = x.value; if (x.dataset.r.startsWith("portada")) S.disVista = "portada"; cambio(); }));
  }
  function vistaPrevia(D) {
    const c = D.marca.colores, v = S.disVista, el = $("#dprev"); if (!el) return;
    document.querySelectorAll("[data-dv]").forEach((x) => x.classList.toggle("on", x.dataset.dv === v));
    el.style.setProperty("--m", c.marino); el.style.setProperty("--l", c.lima); el.style.setProperty("--n", c.naranja); el.style.setProperty("--f", c.fondo);
    const logo = (px) => `<svg width="${px}" height="${px}" viewBox="0 0 100 100"><use href="#logo"/></svg>`;
    const aviso = (rol) => D.aviso.activo && D.aviso.texto && D.aviso.para.includes(rol) ? `<div class="tp-aviso ${D.aviso.tono}">${esc(D.aviso.texto)}</div>` : "";
    const cab = (t, s) => `<div class="tp-cab"><span>☰</span><div><b>${esc(t)}</b><small>${esc(s)}</small></div><span>🔔</span></div>`;
    const tarjetas = `<div class="tp-card"><b>Tu servicio</b><small>Traslado e instalación · Aire 12.000 BTU</small><div class="tp-barra"><i></i></div></div><div class="tp-card"><b>Mis equipos</b><small>Nevera · Lavadora</small></div>`;
    const vis = (m) => D.menus[m].filter((x) => x.visible);
    if (v === "portada") {
      el.innerHTML = `<div class="tp tp-portada">${logo(78)}<div class="tp-nom">${esc(D.marca.nombre)}</div><div class="tp-tit">${esc(D.portada.titulo)}</div><div class="tp-sub">${esc(D.portada.subtitulo)}</div>
        ${D.portada.pasos.map((p, i) => `<div class="tp-paso"><span>${["🏬", "🚚", "🛠", "♻"][i]}</span><div><b>${esc(p.titulo)}</b><small>${esc(p.detalle)}</small></div></div>`).join("")}
        <div class="tp-btn n">${esc(D.portada.boton_crear)}</div><div class="tp-btn m">${esc(D.portada.boton_entrar)}</div></div>`;
    } else if (v === "cliente") {
      const it = vis("cliente"), mitad = Math.ceil(it.length / 2), b = (x, i) => `<div class="tp-tab ${i === 0 ? "on" : ""}"><span>${ICO_MENU[x.id]}</span>${esc(x.texto)}</div>`;
      el.innerHTML = `<div class="tp">${cab(D.marca.nombre, "Rastreo de pedido e instalación")}${aviso("cliente")}${tarjetas}
        <div class="tp-flot">${it.slice(0, mitad).map(b).join("")}<div class="tp-hueco"></div>${it.slice(mitad).map((x) => b(x, 9)).join("")}<div class="tp-centro">🚗</div></div></div>`;
    } else if (v === "cliente_lateral") {
      el.innerHTML = `<div class="tp tp-lat"><div class="tp-lat-c">${logo(40)}<b>${esc(D.marca.nombre)}</b></div>${vis("cliente_lateral").map((x) => `<div class="tp-lat-i"><span>${ICO_MENU[x.id]}</span>${esc(x.texto)}</div>`).join("")}<div class="tp-lat-i rojo"><span>↩</span>Cerrar sesión</div></div>`;
    } else if (v === "tecnico") {
      el.innerHTML = `<div class="tp">${cab(D.marca.nombre + " Técnico", "Damasco San Martín")}${aviso("tecnico")}<div class="tp-card"><b>Guardia de hoy · Grupo A</b><small>2 órdenes asignadas</small></div><div class="tp-card"><b>WO-4921 · En ruta</b><small>Av. Urdaneta · Instalación</small></div>
        <div class="tp-bar">${vis("tecnico").map((x, i) => `<div class="tp-tab ${i === 0 ? "on" : ""}"><span>${ICO_MENU[x.id]}</span>${esc(x.texto)}</div>`).join("")}</div></div>`;
    } else {
      el.innerHTML = `<div class="tp">${cab(D.marca.nombre + " · Caja", "Damasco San Martín")}${aviso("agente")}<div class="tp-btn l">＋ Nueva orden de servicio</div><div class="tp-card"><b>Precios · Bs o $</b><small>Tasa BCV del día y tabla de precios</small></div><div class="tp-card"><b>Órdenes de la tienda</b><small>Hoy: 3</small></div></div>`;
    }
  }

  async function usuarios(main) {
    const [cat, us, ts, cc] = await Promise.all([api("/ceo/permisos"), api("/ceo/usuarios"), api("/admin/tiendas"), api("/ceo/correos")]);
    S.dominio = cc.dominio;
    main.innerHTML += `<p class="total" style="margin-top:-6px">Aquí creas las cuentas de las personas que entran al superadministrador, al centro de control y a la caja: su usuario, su clave y lo que pueden ver o hacer. Todo queda en la auditoría.</p>
      <div style="margin:14px 0;display:flex;gap:10px;flex-wrap:wrap"><button class="btn pri" id="nu">＋ Nuevo usuario</button><button class="btn sec" id="nceo">＋ Agregar otro CEO</button></div>
      <div class="tabla"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Usuario (correo)</th><th>Tienda</th><th>Permisos</th><th>Clave</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead><tbody>
      ${us.map((u, i) => `<tr><td class="nombre">${esc(u.nombre)}${u.soy_yo ? ' <span class="est neutro">Tú</span>' : ""}</td><td>${esc(u.rol_texto)}${u.principal ? ' <span class="est ok">Principal</span>' : ""}</td><td>${esc(u.email || "—")}</td><td>${esc(u.tienda || "—")}</td>
        <td>${u.es_ceo ? "Todos" : `${u.permisos.length} de ${cat.permisos.length}${u.personalizados ? " · personalizados" : " · los del rol"}`}</td>
        <td>${u.clave_temporal ? '<span class="est pend">Temporal</span>' : '<span class="est ok">Propia</span>'}</td><td>${fmt("", u.ultimo_acceso)}</td>
        <td><span class="est ${u.activo ? "ok" : "mal"}">${u.activo ? "Activo" : "Inactivo"}</span></td><td>${u.soy_yo || u.principal ? "" : `<div class="acc"><button title="Editar" data-u="${i}">✎</button></div>`}</td></tr>`).join("")}</tbody></table></div>`;
    $("#nu").onclick = () => fichaUsuario(cat, ts, null);
    $("#nceo").onclick = () => fichaUsuario(cat, ts, null, "ceo");
    main.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => fichaUsuario(cat, ts, us[b.dataset.u])));
  }
  function fichaUsuario(cat, ts, u, rolPedido) {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    const rolIni = u?.rol_panel || rolPedido || "supervisor";
    const marcados = new Set(u ? u.permisos : cat.por_rol[rolIni]);
    const grupos = ["Ver", "Editar"];
    const campo = (id, l, v = "", t = "text") => `<label style="display:block;font-size:13px;font-weight:700;margin-top:10px">${l}</label><input id="${id}" type="${t}" value="${esc(v)}" ${u && id === "fe" ? "disabled" : ""} style="width:100%;height:40px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 12px">`;
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">Centro de mando · Usuarios</span><button class="btn sec" id="cer">✕</button></div>
      <h2 style="margin-top:8px">${u ? esc(u.nombre) : rolPedido === "ceo" ? "Nuevo CEO" : "Nuevo usuario"}</h2>
      ${campo("fn", "Nombre y apellido", u?.nombre)}${campo("fe", "Usuario (correo)", u?.email)}${u ? "" : campo("ft", "Teléfono (opcional)")}
      <label style="display:block;font-size:13px;font-weight:700;margin-top:10px">Rol</label><select id="fr" class="sel" style="width:100%;height:40px">${Object.entries(cat.roles).map(([k, t]) => `<option value="${k}" ${k === rolIni ? "selected" : ""}>${t}</option>`).join("")}</select>
      <div id="ftw"><label style="display:block;font-size:13px;font-weight:700;margin-top:10px">Tienda</label><select id="fti" class="sel" style="width:100%;height:40px"><option value="">—</option>${ts.map((t) => `<option value="${t.id}" ${u?.tienda_id === t.id ? "selected" : ""}>${esc(t.nombre)}</option>`).join("")}</select></div>
      ${u ? "" : `${campo("fc", "Clave (vacía = la genera el sistema)")}<div class="total">Mínimo 8 caracteres, una letra y un número. La persona deberá cambiarla al entrar.</div>`}
      <div id="avceo" class="card" style="min-height:0;margin-top:16px;border-color:var(--acento2)"><b>Acceso total, igual que tú</b><div class="total" style="margin-top:4px">Un CEO ve y hace todo: Centro de mando, usuarios y permisos, correos corporativos y auditoría. Puede crear y quitar otros CEO, pero nunca puede cambiar ni desactivar tu cuenta principal.</div></div>
      <div id="lims"><h3 style="margin:18px 0 4px">Limitaciones · qué puede ver y hacer</h3><div class="total">Marca lo que permites. <a href="#" id="dr" style="color:var(--acento)">Usar los del rol</a></div>
      ${grupos.map((g) => `<div style="margin-top:10px;font-weight:800;color:var(--suave);font-size:12px;letter-spacing:.06em">${g.toUpperCase()}</div>${cat.permisos.filter((p) => p.grupo === g).map((p) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--borde)"><input type="checkbox" data-p="${p.clave}" ${marcados.has(p.clave) ? "checked" : ""}> ${esc(p.texto)}</label>`).join("")}`).join("")}
      </div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px"><button class="btn pri" id="gu">${u ? "Guardar cambios" : "Crear usuario"}</button>
        ${u ? `<button class="btn sec" id="rc">Restablecer clave</button><button class="btn ${u.activo ? "pel" : "sec"}" id="ac">${u.activo ? "Desactivar" : "Activar"}</button>` : ""}</div>
      <div id="clv"></div><p class="error" id="err"></p>`;
    document.body.appendChild(c);
    const verTienda = () => { $("#ftw").style.display = ["agente", "tecnico_supervisor"].includes($("#fr").value) ? "block" : "none";
      const esCeo = $("#fr").value === "ceo"; $("#avceo").style.display = esCeo ? "block" : "none"; $("#lims").style.display = esCeo ? "none" : "block"; };
    verTienda();
    if (!u) {  // sugiere el correo corporativo nombre.apellido@aha-go.com
      let tocado = false;
      $("#fe").placeholder = `nombre.apellido@${S.dominio}`;
      $("#fe").oninput = () => (tocado = true);
      $("#fn").oninput = () => { if (tocado) return; const w = $("#fn").value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).filter(Boolean);
        $("#fe").value = w.length ? `${w[0]}${w[1] ? "." + w[1] : ""}@${S.dominio}` : ""; };
    }
    $("#fr").onchange = () => { verTienda(); if (!u) c.querySelectorAll("[data-p]").forEach((x) => (x.checked = cat.por_rol[$("#fr").value].includes(x.dataset.p))); };
    let delRol = false;
    $("#dr").onclick = (e) => { e.preventDefault(); delRol = true; c.querySelectorAll("[data-p]").forEach((x) => (x.checked = cat.por_rol[$("#fr").value].includes(x.dataset.p))); };
    c.querySelectorAll("[data-p]").forEach((x) => (x.onchange = () => (delRol = false)));
    $("#cer").onclick = () => c.remove();
    const err = (e) => ($("#err").textContent = e.message);
    const mostrarClave = (cl, quien) => ($("#clv").innerHTML = `<div class="card" style="min-height:0;margin-top:14px;border-color:var(--acento)"><b>Clave de ${esc(quien)}</b><div class="grande" style="font-size:26px;letter-spacing:2px">${esc(cl)}</div><div class="total">Se muestra una sola vez. Entrégasela en persona; deberá cambiarla al entrar.</div></div>`);
    const permisos = () => [...c.querySelectorAll("[data-p]")].filter((x) => x.checked).map((x) => x.dataset.p);
    $("#gu").onclick = async () => {
      const tienda = $("#fti").value ? Number($("#fti").value) : null;
      try {
        if (u) { await api(`/ceo/usuarios/${u.id}`, { method: "PUT", body: { nombre: $("#fn").value, rol: $("#fr").value, tienda_id: tienda, ...(delRol ? { usar_permisos_del_rol: true } : { permisos: permisos() }) } }); c.remove(); pintar(); }
        else { const r = await api("/ceo/usuarios", { body: { nombre: $("#fn").value, email: $("#fe").value, telefono: $("#ft").value, rol: $("#fr").value, tienda_id: tienda, clave: $("#fc").value, permisos: delRol ? null : permisos() } });
          mostrarClave(r.clave, r.nombre); $("#gu").remove(); pintar(true); }
      } catch (e) { err(e); }
    };
    const rc = $("#rc"); if (rc) rc.onclick = () => api(`/ceo/usuarios/${u.id}/clave`, { body: {} }).then((r) => mostrarClave(r.clave, u.nombre)).catch(err);
    const ac = $("#ac"); if (ac) ac.onclick = () => api(`/ceo/usuarios/${u.id}`, { method: "PUT", body: { activo: !u.activo } }).then(() => { c.remove(); pintar(); }).catch(err);
  }

  // ---------- Correos corporativos (solo CEO) ----------
  async function correos(main) {
    const r = await api("/ceo/correos");
    const TIPO = { persona: ["Persona", "ok"], area: ["Área", "neutro"], sistema: ["Sistema", "pend"] };
    const n = (t) => r.correos.filter((c) => c.tipo === t).length;
    main.innerHTML += `<p class="total" style="margin-top:-6px">Base de datos de los correos @${esc(r.dominio)}: el de cada persona del equipo, el de cada área y los que usa la app para escribir. Cuando creas un usuario con correo @${esc(r.dominio)}, se agrega aquí solo.</p>
      <div class="tarjetas" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:14px 0">
        ${[["Personas", n("persona")], ["Áreas", n("area")], ["Sistema", n("sistema")], ["Total", r.correos.length]].map(([t, v]) => `<div class="card" style="min-height:0"><div class="total">${t}</div><div class="grande">${v}</div></div>`).join("")}</div>
      <div style="margin:14px 0"><button class="btn pri" id="nc">＋ Nuevo correo</button></div>
      <div class="tabla"><table><thead><tr><th>Correo</th><th>Tipo</th><th>Para qué / quién</th><th>Persona del equipo</th><th>Llega a (reenvío)</th><th>Estado</th><th></th></tr></thead><tbody>
      ${r.correos.map((c, i) => `<tr><td class="nombre">${esc(c.direccion)}</td><td><span class="est ${TIPO[c.tipo][1]}">${TIPO[c.tipo][0]}</span></td><td>${esc(c.descripcion || "—")}</td>
        <td>${c.persona ? `${esc(c.persona)}<br><small class="total">${esc(c.rol_texto)}</small>` : "—"}</td><td>${esc(c.reenviar_a || "—")}</td>
        <td><span class="est ${c.activo ? "ok" : "mal"}">${c.activo ? "Activo" : "Inactivo"}</span></td><td><div class="acc"><button title="Editar" data-c="${i}">✎</button></div></td></tr>`).join("")}</tbody></table></div>`;
    $("#nc").onclick = () => fichaCorreo(r.dominio, null);
    main.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => fichaCorreo(r.dominio, r.correos[b.dataset.c])));
  }
  function fichaCorreo(dom, k) {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    const est = "width:100%;height:40px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);padding:0 12px";
    const lab = (t) => `<label style="display:block;font-size:13px;font-weight:700;margin-top:10px">${t}</label>`;
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">Centro de mando · Correos</span><button class="btn sec" id="cer">✕</button></div>
      <h2 style="margin-top:8px">${k ? esc(k.direccion) : "Nuevo correo corporativo"}</h2>
      ${k ? "" : `${lab("Correo")}<div style="display:flex;align-items:center;gap:6px"><input id="cu" placeholder="ventas" style="${est}"><b>@${esc(dom)}</b></div>`}
      ${lab("Tipo")}<select id="ct" class="sel" style="width:100%;height:40px">${[["persona", "Persona del equipo"], ["area", "Área (lo leen varias personas)"], ["sistema", "Sistema (lo usa la app)"]].map(([v, t]) => `<option value="${v}" ${(k?.tipo || "area") === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      ${lab("Para qué / quién")}<input id="cd" value="${esc(k?.descripcion || "")}" style="${est}">
      ${lab("Llega a (reenvío)")}<input id="cr" value="${esc(k?.reenviar_a || "")}" placeholder="buzón donde se lee, separados por coma" style="${est}">
      <div class="total">Opcional: a qué buzón(es) llega este correo. Se configura igual en Cloudflare › Email Routing.</div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="ca" ${k?.activo === false ? "" : "checked"}> Activo</label>
      <div style="margin-top:18px"><button class="btn pri" id="cg">${k ? "Guardar cambios" : "Agregar correo"}</button></div><p class="error" id="err"></p>`;
    document.body.appendChild(c);
    $("#cer").onclick = () => c.remove();
    $("#cg").onclick = async () => {
      const body = { usuario: k ? "" : $("#cu").value, tipo: $("#ct").value, descripcion: $("#cd").value, reenviar_a: $("#cr").value, activo: $("#ca").checked };
      try { await api(k ? `/ceo/correos/${k.id}` : "/ceo/correos", k ? { method: "PUT", body } : { body }); c.remove(); pintar(true); }
      catch (e) { $("#err").textContent = e.message; }
    };
  }

  function cambioObligatorio(app) {
    app.innerHTML = `<div class="login"><form id="f">${logo3D(110)}<div style="text-align:center"><b style="font-size:24px;letter-spacing:-.02em">AHA HOME</b></div>
      <div style="font-size:20px;font-weight:800">Crea tu propia clave</div><div class="total" style="margin-top:-6px">Hola ${esc(S.yo.nombre)}. Tu cuenta la creó el CEO con una clave temporal: cámbiala para continuar.</div>
      <label>Clave temporal</label><input id="a" type="password" required><label>Clave nueva</label><input id="n" type="password" required><label>Repite la clave nueva</label><input id="r" type="password" required>
      <div class="total">Mínimo 8 caracteres, una letra y un número.</div><p class="error" id="e"></p><button class="btn pri" style="height:48px">Guardar y entrar</button>
      <button type="button" class="btn sec" id="sal2">Cerrar sesión</button></form></div>`;
    $("#sal2").onclick = salir;
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault();
      try { await api("/yo/contrasena", { body: { actual: $("#a").value, nueva: $("#n").value, repetir: $("#r").value } }); S.yo = null; pintar(); }
      catch (e) { $("#e").textContent = e.message; }
    };
  }

  // ---------- Armado ----------
  async function pintar(soloContenido) {
    const app = $("#app");
    const tokenClave = new URLSearchParams(location.search).get("restablecer");
    if (tokenClave) return restablecer(app, tokenClave);
    if (!S.token) return login(app);
    if (!S.yo) {
      try { S.yo = await api("/yo"); } catch { return; }
      if (!["supervisor", "superadmin"].includes(S.yo.rol)) { salir(); alert("El panel es solo para el superadmin y el centro de control. La caja usa la app."); return; }
    }
    if (S.yo.clave_temporal) return cambioObligatorio(app);
    if (!puede(S.ruta) && !(S.ruta === "usuarios" && S.yo.es_ceo) && !(S.ruta === "auditoria" && S.yo.es_ceo) && !(S.ruta === "correos" && S.yo.es_ceo)) {
      const primera = Object.keys(PERM_RUTA).find((k) => puede(k)); S.ruta = primera || "sinpermisos"; location.hash = S.ruta;
    }
    if (puedeHacer("ver_tablero")) try { const r = await datos(30); S.cuentas = { verif: r.verificaciones_pendientes, rep: r.reportes_abiertos }; S.notif = r.verificaciones_pendientes + r.reportes_abiertos; } catch { /* sin datos */ }
    const [g, t] = TITULOS[S.ruta] || ["", S.ruta];
    if (!soloContenido || !$(".main")) {
      app.innerHTML = `<div class="top"><button class="hamb" id="hamb">☰</button><div class="marca"><svg><use href="#logo"/></svg>AHA HOME</div>
        <div class="buscar"><input id="bg" placeholder="Presiona / para buscar"><div class="resultados" id="rg" style="display:none"></div></div><div class="esp"></div>
        <button class="ico-btn" id="tema" title="Tema claro u oscuro">${document.documentElement.dataset.tema === "oscuro" ? "☀" : "☾"}</button>
        <a class="ico-btn" href="#verificaciones" title="Pendientes">🔔${S.notif ? `<span class="badge">${S.notif}</span>` : ""}</a>
        <div class="usuario"><button class="ico-btn" style="width:auto;padding:0 12px;border-radius:19px" id="um">${esc(S.yo.nombre)} ⌄</button><div class="menu" id="umm" style="display:none"><button disabled>${S.yo.es_ceo ? "CEO" : S.yo.rol === "superadmin" ? "Superadministrador" : "Centro de control"}</button><button id="mic">🔑 Cambiar mi clave</button><button id="sal">Cerrar sesión</button></div></div></div>
        <div class="cuerpo"><nav class="lat ${S.latOculta ? "oculto" : ""}">${menuHTML()}</nav><main class="main"></main></div>`;
      $("#hamb").onclick = () => { S.latOculta = !S.latOculta; $(".lat").classList.toggle("oculto"); };
      $("#tema").onclick = () => { const n = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro"; document.documentElement.dataset.tema = n; localStorage.setItem("ahahome.panel.tema", n); pintar(); };
      $("#um").onclick = () => { const m = $("#umm"); m.style.display = m.style.display === "none" ? "block" : "none"; };
      $("#sal").onclick = salir;
      $("#mic").onclick = () => { $("#umm").style.display = "none"; miClave(); };
      const bg = $("#bg"), rg = $("#rg"); let tm;
      bg.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => {
        if (bg.value.trim().length < 2) { rg.style.display = "none"; return; }
        const rs = await api(`/panel-api/buscar?q=${encodeURIComponent(bg.value)}`);
        rg.innerHTML = rs.length ? rs.map((x) => `<a href="#${x.tabla}" data-q="${esc(x.titulo)}"><span class="est neutro">${x.tipo}</span><span>${esc(x.titulo)}<br><small>${esc(x.sub)}</small></span></a>`).join("") : `<a>Sin resultados</a>`;
        rg.style.display = "block";
        rg.querySelectorAll("a[data-q]").forEach((a) => (a.onclick = () => { S.tabla[a.getAttribute("href").slice(1)] = { q: a.dataset.q, pagina: 1, dir: "desc", estado: "" }; rg.style.display = "none"; bg.value = ""; }));
      }, 250); };
    } else {
      $(".lat").innerHTML = menuHTML();
    }
    const main = $(".main");
    main.innerHTML = `<div class="migas">${esc(g)} › <b>${esc(t)}</b></div><h1>${esc(t)}</h1>`;
    try {
      if (S.ruta === "sinpermisos") main.innerHTML += `<p class="total">Tu cuenta todavía no tiene permisos. Pídeselos al CEO.</p>`;
      else if (S.ruta === "usuarios") await usuarios(main);
      else if (S.ruta === "correos") await correos(main);
      else if (S.ruta === "finanzas") await finanzas(main);
      else if (S.ruta === "diseno") await diseno(main);
      else if (S.ruta === "inicio") await inicio(main);
      else if (S.ruta === "anuncios") await anuncios(main);
      else if (S.ruta === "auditoria") await auditoria(main);
      else if (S.ruta === "tasa") await pagTasa(main);
      else if (S.ruta === "tarifas") await pagTarifas(main);
      else if (S.ruta === "precios") await pagPrecios(main);
      else if (S.ruta === "qrs") await pagQrs(main);
      else await tabla(main, S.ruta);
    } catch (e) { main.innerHTML += `<p class="error">${esc(e.message)}</p>`; }
  }

  function login(app) {
    app.innerHTML = `<div class="login"><form id="f">${logo3D(110)}<div style="text-align:center"><b style="font-size:24px;letter-spacing:-.02em">AHA HOME</b></div>
      <div style="font-size:22px;font-weight:800">Panel del superadministrador</div><div class="total" style="margin-top:-6px">Solo personal autorizado · cada ingreso queda registrado</div>
      <label>Correo</label><input id="u" autocomplete="username" required><label>Contraseña</label><input id="p" type="password" autocomplete="current-password" required>
      <p class="error" id="e"></p><button class="btn pri" style="height:48px">Entrar</button>
      <button type="button" class="enlace" id="olv">¿Olvidaste tu clave?</button></form></div>`;
    $("#olv").onclick = () => recuperar(app, $("#u").value);
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault();
      try { const r = await api("/auth/login", { body: { usuario: $("#u").value, password: $("#p").value } }); S.token = r.token; localStorage.setItem("ahahome.panel.token", r.token); S.yo = null; pintar(); }
      catch (e) { $("#e").textContent = e.message; }
    };
  }

  // Recuperar la clave: pide el correo y envía un enlace de un solo uso (30 min)
  function recuperar(app, correo) {
    app.innerHTML = `<div class="login"><form id="f">${logo3D(90)}<div style="font-size:22px;font-weight:800">Recupera tu clave</div>
      <div class="total" style="margin-top:-6px">Escribe el correo de tu cuenta del equipo. Te enviaremos un enlace para crear una clave nueva; vale 30 minutos.</div>
      <label>Correo</label><input id="c" type="email" autocomplete="username" required value="${esc(correo || "")}">
      <p class="error" id="e"></p><div id="ok"></div><button class="btn pri" style="height:48px" id="env">Enviar enlace</button>
      <button type="button" class="enlace" id="vol">Volver a entrar</button></form></div>`;
    $("#vol").onclick = () => login(app);
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault(); $("#e").textContent = "";
      try { const r = await api("/auth/recuperar", { body: { correo: $("#c").value } });
        $("#ok").innerHTML = `<div class="aviso-ok">✉ ${esc(r.mensaje)}</div>`; $("#env").textContent = "Enviar otra vez"; }
      catch (e) { $("#e").textContent = e.message; }
    };
  }
  function restablecer(app, token) {
    app.innerHTML = `<div class="login"><form id="f">${logo3D(90)}<div style="font-size:22px;font-weight:800">Crea tu clave nueva</div>
      <div class="total" style="margin-top:-6px">Mínimo 8 caracteres, con una letra y un número.</div>
      <label>Clave nueva</label><input id="n" type="password" autocomplete="new-password" required>
      <label>Repite la clave nueva</label><input id="r" type="password" autocomplete="new-password" required>
      <p class="error" id="e"></p><div id="ok"></div><button class="btn pri" style="height:48px" id="gua">Guardar clave nueva</button></form></div>`;
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault(); $("#e").textContent = "";
      try { await api("/auth/restablecer", { body: { token, nueva: $("#n").value, repetir: $("#r").value } });
        history.replaceState(null, "", location.pathname + location.hash);
        $("#ok").innerHTML = `<div class="aviso-ok">✓ Listo: tu clave quedó cambiada. Ya puedes entrar con ella.</div>`;
        $("#gua").textContent = "Entrar"; $("#f").onsubmit = (e2) => { e2.preventDefault(); login(app); }; }
      catch (e) { $("#e").textContent = e.message; }
    };
  }

  // Dentro del panel: «Cambiar mi clave»
  function miClave() {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    const est = "width:100%;height:42px;border-radius:14px;border:1px solid var(--filo);background:var(--vidrio2);color:var(--texto);padding:0 12px";
    const lab = (t) => `<label style="display:block;font-size:13px;font-weight:700;margin-top:12px">${t}</label>`;
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">Mi cuenta</span><button class="btn sec" id="cer">✕</button></div>
      <h2 style="margin-top:8px">Cambiar mi clave</h2><div class="total">${esc(S.yo.email || "")}</div>
      ${lab("Clave actual")}<input id="ma" type="password" autocomplete="current-password" style="${est}">
      ${lab("Clave nueva")}<input id="mn" type="password" autocomplete="new-password" style="${est}">
      ${lab("Repite la clave nueva")}<input id="mr" type="password" autocomplete="new-password" style="${est}">
      <div id="req" style="margin-top:12px;display:flex;flex-direction:column;gap:4px;font-size:13px"></div>
      <div style="margin-top:18px"><button class="btn pri" id="mg">Guardar clave nueva</button></div><p class="error" id="me"></p><div id="mok"></div>`;
    document.body.appendChild(c);
    const reqs = () => { const n = $("#mn").value, r = $("#mr").value;
      $("#req").innerHTML = [["Al menos 8 caracteres", n.length >= 8], ["Una letra", /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(n)], ["Un número", /\d/.test(n)], ["Las dos coinciden", !!n && n === r]]
        .map(([t, ok]) => `<span style="color:${ok ? "var(--acento)" : "var(--suave)"}">${ok ? "✓" : "○"} ${t}</span>`).join(""); };
    reqs(); $("#mn").oninput = reqs; $("#mr").oninput = reqs;
    $("#cer").onclick = () => c.remove();
    $("#mg").onclick = async () => {
      $("#me").textContent = "";
      try { await api("/yo/contrasena", { body: { actual: $("#ma").value, nueva: $("#mn").value, repetir: $("#mr").value } });
        $("#mok").innerHTML = `<div class="aviso-ok">✓ Listo: tu clave quedó cambiada.</div>`; ["#ma", "#mn", "#mr"].forEach((k) => ($(k).value = "")); reqs(); }
      catch (e) { $("#me").textContent = e.message; }
    };
  }

  // Ojo para ver u ocultar la clave en todos los campos de contraseña del panel
  const OJO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_NO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function ponerOjos(raiz) {
    raiz.querySelectorAll('input[type="password"]:not([data-ojo])').forEach((inp) => {
      inp.dataset.ojo = "1";
      const caja = document.createElement("span"); caja.className = "con-ojo";
      inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
      const b = document.createElement("button"); b.type = "button"; b.className = "ojo"; b.innerHTML = OJO;
      b.setAttribute("aria-label", "Mostrar la clave"); b.title = "Mostrar la clave";
      b.onclick = () => { const ver = inp.type === "password"; inp.type = ver ? "text" : "password"; b.innerHTML = ver ? OJO_NO : OJO;
        b.setAttribute("aria-label", ver ? "Ocultar la clave" : "Mostrar la clave"); b.title = ver ? "Ocultar la clave" : "Mostrar la clave"; inp.focus(); };
      caja.appendChild(b);
    });
  }
  new MutationObserver(() => ponerOjos(document.body)).observe(document.body, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => { S.ruta = location.hash.slice(1) || "inicio"; document.querySelector(".cajon")?.remove(); window.scrollTo(0, 0); pintar(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); $("#bg")?.focus(); } });
  pintar();
})();
