// Panel web del superadministrador AHA HOME (modelo del panel de AHA VOY). Sin dependencias: HTML + SVG.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = {
    token: localStorage.getItem("ahahome.panel.token"), sesion: localStorage.getItem("ahahome.panel.sesion") || "", gAbiertos: new Set(), yo: null, ruta: location.hash.slice(1) || "inicio",
    ocultas: JSON.parse(localStorage.getItem("ahahome.panel.ocultas") || "[]"), dias: {}, cache: {}, tabla: {}, notif: 0,
  };
  document.documentElement.dataset.tema = localStorage.getItem("ahahome.panel.tema") || "claro";  // como en el catálogo de pantallas: claro de entrada

  async function api(ruta, opts = {}) {
    const r = await fetch(ruta, { method: opts.method || (opts.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(S.token ? { Authorization: "Bearer " + S.token } : {}), ...(S.sesion ? { "X-Sesion": S.sesion } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401) { salir(); throw new Error("Inicia sesión de nuevo"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : j.detail?.mensaje || "No se pudo completar");
    return j;
  }
  function salir(voluntario) {
    if (voluntario === true && S.token) fetch("/panel-api/actividad", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: "Bearer " + S.token, "X-Sesion": S.sesion },
      body: JSON.stringify({ tipo: "cierre_sesion", texto: "Cerró sesión" }) }).catch(() => {});
    localStorage.removeItem("ahahome.panel.token"); localStorage.removeItem("ahahome.panel.sesion"); S.token = null; S.sesion = ""; S.yo = null; pintar();
  }
  function anotarConsulta(main) {
    // Historial de actividad: qué pantalla se abrió (una vez por pantalla o pestaña)
    const t = main.querySelector("h1")?.textContent || "", clave = S.ruta + "|" + (S.ruta === "finanzas" ? S.finTab : S.ruta === "historial" ? S.hTab : "");
    if (!t || clave === S.consultaVista || S.ruta === "sinpermisos") return;
    S.consultaVista = clave;
    const texto = S.ruta === "finanzas" ? `Abrió Finanzas: ${(FIN_TABS.find((x) => x[0] === S.finTab) || [, "resumen"])[1].toLowerCase()}` : `Abrió ${t}`;
    api("/panel-api/actividad", { body: { tipo: "consulta", texto } }).catch(() => {});
  }

  // ---------- Menú ----------
  // Cada tipo de registro va en su propia sección; el personal interno (superadmin, control, caja) va aparte.
  const MENU = [
    { k: "inicio", t: "Panel principal", i: "⌂" },
    { sec: "REGISTROS" },
    { k: "clientes", t: "Clientes", i: "🙋" },
    { k: "empresas", t: "Empresas aliadas", i: "🏬" },
    { g: "Técnicos", i: "👷", hijos: [["tecnicos", "Técnicos y ayudantes"], ["verificaciones", "Verificaciones", "verif"]] },
    { sec: "OPERACIÓN" },
    { k: "ordenes", t: "Órdenes", i: "🛒" },
    { g: "Centro de soporte", i: "◎", hijos: [["mensajeria", "Mensajería"], ["reportes", "Reportes", "rep"], ["resenas", "Reseñas"]] },
    { k: "anuncios", t: "Banners y aliados", i: "▤" },
    { sec: "VENTAS Y FINANZAS" },
    { k: "ventas", t: "Departamento de ventas", i: "📈" },
    { g: "Finanzas", i: "💼", hijos: [["finanzas", "Finanzas y contabilidad"], ["transacciones", "Transacciones"], ["liquidaciones", "Liquidaciones"]] },
    { sec: "NEGOCIO" },
    { k: "tasa", t: "Tasa BCV", i: "💱" },
    { k: "precios", t: "Tabulación de precios", i: "🏷" },
    { k: "qrs", t: "QR de las tiendas", i: "▦" },
    { k: "diseno", t: "Diseño de la app", i: "🎨" },
    { sec: "ADMINISTRACIÓN AHA HOME" },
    { g: "Personal interno", i: "🛡", hijos: [["administradores", "Superadministradores"], ["control", "Centro de control"], ["caja", "Operadores de caja"]] },
  ];
  const TITULOS = { inicio: ["Tableros", "Panel principal"], tecnicos: ["Técnicos", "Técnicos y ayudantes"], empresas: ["Registros", "Empresas aliadas"], clientes: ["Registros", "Clientes"],
    equipo: ["Administración", "Personal AHA HOME"], administradores: ["Administración", "Superadministradores"], control: ["Administración", "Centro de control"], caja: ["Administración", "Operadores de caja"], anuncios: ["Recursos", "Banners y aliados"], ordenes: ["Operación", "Órdenes"], transacciones: ["Finanzas", "Transacciones"],
    mensajeria: ["Centro de soporte", "Mensajería"], liquidaciones: ["Finanzas", "Liquidaciones"], verificaciones: ["Técnicos", "Verificaciones"], reportes: ["Centro de soporte", "Reportes"],
    resenas: ["Centro de soporte", "Reseñas"], auditoria: ["Centro de mando", "Auditoría del equipo"], usuarios: ["Centro de mando", "Usuarios y permisos"], correos: ["Centro de mando", "Correos corporativos"], historial: ["Centro de mando", "Historial de actividad"],
    finanzas: ["Finanzas", "Finanzas y contabilidad"], diseno: ["Diseño", "Diseño de la app"], ventas: ["Ventas", "Departamento de ventas"], tasa: ["Negocio", "Tasa oficial BCV"], tarifas: ["Negocio", "Tarifas de instalación"], precios: ["Negocio", "Tabulación de precios"], qrs: ["Negocio", "QR de las tiendas"] };

  // Permiso que necesita cada pantalla (el CEO lo asigna a cada usuario)
  const PERM_RUTA = { inicio: "ver_tablero", clientes: "ver_clientes", empresas: "ver_empresas", tecnicos: "ver_tecnicos", verificaciones: "ver_tecnicos",
    ordenes: "ver_ordenes", transacciones: "ver_finanzas", liquidaciones: "ver_finanzas", mensajeria: "ver_soporte", reportes: "ver_soporte", resenas: "ver_soporte",
    anuncios: "banners", finanzas: "ver_finanzas", diseno: "diseno", ventas: "ver_ventas", tasa: "ver_tablero", precios: "ver_tablero", qrs: "qr_tiendas", administradores: "ver_personal", control: "ver_personal", caja: "ver_personal" };
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
      const abierto = S.gAbiertos.has(m.g) || m.hijos.some(([k]) => k === S.ruta);
      const pend = m.hijos.reduce((n, [, , c]) => n + (c && S.cuentas?.[c] ? S.cuentas[c] : 0), 0);
      h += `<button type="button" class="grupo ${abierto ? "abierto" : ""}" data-grupo="${esc(m.g)}" aria-expanded="${abierto}"><span style="display:flex;gap:12px;align-items:center"><span class="i" style="width:22px;text-align:center">${m.i}</span>${m.g}</span><span class="g-der">${!abierto && pend ? `<span class="cuenta">${pend}</span>` : ""}<span class="flecha">⌄</span></span></button>`;
      if (m.cap) h += `<div class="cap" ${abierto ? "" : "hidden"}>${m.cap}</div>`;
      h += `<div class="sub" ${abierto ? "" : "hidden"}>${m.hijos.map(([k, t, c]) => `<a href="#${k}" class="${S.ruta === k ? "on" : ""}">${t}${c && S.cuentas?.[c] ? `<span class="cuenta">${S.cuentas[c]}</span>` : ""}</a>`).join("")}</div>`;
    }
    if (S.yo?.es_ceo) h += `<div style="margin:14px 12px 4px;font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--suave)">CENTRO DE MANDO (CEO)</div>`
      + it("usuarios", "Usuarios y permisos", "🔑") + it("correos", "Correos corporativos", "✉") + it("auditoria", "Auditoría del equipo", "🛡") + it("historial", "Historial de actividad", "📒");
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
    const d = await api("/admin/qrs"), papelera = S.qrPapelera === true, lista = papelera ? d.papelera : d.activos;
    main.querySelector("h1").insertAdjacentHTML("afterend", `<p class="total" style="margin-top:-8px">Cada QR tiene un nombre y un código únicos. Se imprime y se pega en la caja: el técnico lo escanea al llegar y la caja autoriza el retiro con un OK.</p>`);
    main.innerHTML += `<div class="qr-barra">${esSA() && !papelera ? `<button class="btn pri" id="qnuevo">＋ Nuevo QR</button>` : "<span></span>"}
        <div class="qr-vista"><button class="${papelera ? "" : "on"}" data-pap="0">Activos (${d.activos.length})</button><button class="${papelera ? "on" : ""}" data-pap="1">🗑 Papelera (${d.papelera.length})</button></div></div>
      ${lista.length ? `<div class="qr-grid">${lista.map((q) => `<div class="card qr-card"><div class="total">${q.codigo}${q.principal ? ` · <span class="est ok">Principal</span>` : ""}</div>
          <div class="qr-nom">${esc(q.nombre)}</div><div class="total">${esc(q.tienda)} · ${esc(q.zona)}</div>
          <img class="qr-img" data-qimg="${q.id}" alt="Código QR de ${esc(q.nombre)}"><div class="total">${q.escaneos} escaneo(s)</div>
          <div class="total">Creado por ${esc(q.creado_por)} · ${fmt("", q.creado)}</div>
          ${esSA() ? `<div class="qr-acc">${papelera ? `<button class="btn sec" data-qrec="${q.id}">↺ Recuperar</button>`
            : `<button class="btn sec" data-qnom="${q.id}">✎ Nombre</button><button class="btn sec" data-qimp="${q.id}">🖨 Imprimir</button><button class="btn rojo" data-qdel="${q.id}">🗑 Eliminar</button>`}</div>` : ""}</div>`).join("")}</div>`
        : `<div class="fin-vacio">${papelera ? "La papelera está vacía." : "Todavía no hay QR. Crea el primero con «＋ Nuevo QR»."}</div>`}`;
    for (const q of lista) cargarQR(main.querySelector(`[data-qimg="${q.id}"]`), q.id);
    main.querySelectorAll("[data-pap]").forEach((b) => (b.onclick = () => { S.qrPapelera = b.dataset.pap === "1"; pintar(true); }));
    const n = $("#qnuevo"); if (n) n.onclick = () => cajonFin("Nuevo QR", finSel("qti", "Tienda", d.tiendas.map((t) => [t.id, t.nombre]), d.tiendas[0]?.id) +
      finCampo("qno", "Nombre del QR", "", "text", 'placeholder="Ej. Caja 1 – San Martín"'), () => api("/admin/qrs", { body: { tienda_id: Number($("#qti").value), nombre: $("#qno").value } }), "QR de las tiendas");
    main.querySelectorAll("[data-qnom]").forEach((b) => (b.onclick = () => { const q = lista.find((x) => x.id === Number(b.dataset.qnom));
      cajonFin("Cambiar nombre", finCampo("qno", "Nombre del QR", q.nombre), () => api(`/admin/qrs/${q.id}`, { method: "PUT", body: { nombre: $("#qno").value } }), "QR de las tiendas"); }));
    main.querySelectorAll("[data-qdel]").forEach((b) => (b.onclick = () => { const q = lista.find((x) => x.id === Number(b.dataset.qdel));
      cajonFin("Enviar a la papelera", `<p class="total">El QR «${esc(q.nombre)}» deja de servir en la caja hasta que lo recuperes de la papelera.</p>`, () => api(`/admin/qrs/${q.id}/papelera`, { body: {} }), "QR de las tiendas"); }));
    main.querySelectorAll("[data-qrec]").forEach((b) => (b.onclick = () => api(`/admin/qrs/${b.dataset.qrec}/recuperar`, { body: {} }).then(() => pintar(true))));
    main.querySelectorAll("[data-qimp]").forEach((b) => (b.onclick = () => { const q = lista.find((x) => x.id === Number(b.dataset.qimp)), img = main.querySelector(`[data-qimg="${q.id}"]`);
      const w = window.open(""); if (!w) return; w.document.write(`<div style="font-family:sans-serif;text-align:center"><h2>${esc(q.nombre)}</h2><p>${esc(q.tienda)} · ${q.codigo}</p><img src="${img.src}" style="width:70%"></div><script>print()<\/script>`); }));
  }
  async function historial(main) {
    S.hTab = S.hTab || "actividad";
    if (!S.finHasta) { S.finPre = "30"; S.finHasta = hoyLocal(); S.finDesde = restaDias(S.finHasta, 29); }
    const F = (S.hFil = S.hFil || {}), ses = S.hTab === "sesiones";
    const datos = await api(`/ceo/${ses ? "sesiones" : "historial"}?desde=${S.finDesde}&hasta=${S.finHasta}`);
    main.querySelector("h1").insertAdjacentHTML("afterend", `<p class="total" style="margin-top:-8px">Todo lo que hacen los superadministradores y el centro de control en sus sesiones: ingresos, intentos fallidos, pantallas consultadas, cambios y descargas. No se guardan claves ni lo que escribieron, y nadie puede borrarlo desde el panel.</p>`);
    const uniq = (k) => [...new Set(datos.map((x) => x[k]))].filter(Boolean).sort();
    const sel = (k, todos, ops) => `<select class="sel" data-hf="${k}"><option value="">${todos}</option>${ops.map(([v, t]) => `<option value="${esc(v)}" ${F[k] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    const q = (F.q || "").toLowerCase();
    const filas = datos.filter((x) => (!F.disp || x.dispositivo === F.disp) && (!F.quien || x.usuario === F.quien) && (!F.tipo || x.tipo === F.tipo) && (!F.sesion || x.sesion === F.sesion)
      && (!q || [x.texto, x.usuario, x.ip].some((v) => String(v || "").toLowerCase().includes(q))));
    const porPag = 30, paginas = Math.max(1, Math.ceil(filas.length / porPag)); S.hPag = Math.min(S.hPag || 1, paginas);
    const vista = filas.slice((S.hPag - 1) * porPag, S.hPag * porPag);
    const fh = (iso) => new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
    const cuentas = {}; if (!ses) filas.forEach((x) => (cuentas[x.tipo_texto] = (cuentas[x.tipo_texto] || 0) + 1));
    main.innerHTML += `<div class="fin-desc"><div class="qr-vista"><button class="${ses ? "" : "on"}" data-ht="actividad">Actividad</button><button class="${ses ? "on" : ""}" data-ht="sesiones">Sesiones</button></div>
        <button class="btn sec" id="hcsv">⬇ Descargar Excel (CSV)</button></div>${finPeriodo()}
      <div class="fin-filtros">${ses ? "" : `<input class="finp fbus" id="hq" placeholder="⌕ Buscar actividad" value="${esc(F.q || "")}">`}
        ${sel("disp", "Todos los equipos", uniq("dispositivo").map((v) => [v, v]))}${sel("quien", "Todas las personas", uniq("usuario").map((v) => [v, v]))}
        ${ses ? "" : sel("tipo", "Toda la actividad", [["ingreso", "Ingreso"], ["ingreso_fallido", "Ingreso fallido"], ["consulta", "Consulta"], ["cambio", "Cambio"], ["descarga", "Descarga"], ["cierre_sesion", "Cierre de sesión"]])}
        ${F.sesion && !ses ? `<button class="btn sec" id="hsinses">Sesión ${esc(F.sesion)} ✕</button>` : ""}</div>
      <div class="tabla"><div class="fl-cab">${ses ? `${filas.length} sesión(es)` : `${filas.length} registro(s)${Object.keys(cuentas).length ? " · " + Object.entries(cuentas).map(([k, v]) => `${k}: ${v}`).join(" · ") : ""}`}</div>
      <table><thead><tr>${(ses ? ["Usuario", "Rol", "Inicio", "Última actividad", "Duración", "Actividades", "IP y dispositivo", "Estado", ""] : ["Fecha y hora", "Usuario", "Rol", "Tipo", "Actividad", "IP y dispositivo", "Sesión"]).map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>
      ${vista.length ? vista.map((x) => ses
        ? `<tr><td class="nombre">${esc(x.usuario)}</td><td>${esc(x.rol)}</td><td>${fmt("", x.inicio)}</td><td>${fmt("", x.ultima)}</td><td>${dur(x.minutos)}</td><td>${x.actividades}</td>
            <td>${esc(x.ip)}<br><small class="total">${esc(x.dispositivo)}</small></td><td><span class="est ${x.estado === "activa" ? "ok" : "neutro"}">${esc(x.estado)}</span></td><td><button class="btn sec" data-hses="${x.id}">Ver</button></td></tr>`
        : `<tr><td>${fh(x.en)}</td><td class="nombre">${esc(x.usuario)}</td><td>${esc(x.rol)}</td><td><span class="est ${x.tipo === "ingreso_fallido" ? "mal" : x.tipo === "cambio" ? "pend" : "neutro"}">${esc(x.tipo_texto)}</span></td>
            <td>${esc(x.texto)}</td><td>${esc(x.ip)}<br><small class="total">${esc(x.dispositivo)}</small></td><td class="nombre">${esc(x.sesion || "—")}</td></tr>`).join("")
        : `<tr><td colspan="9" class="total" style="text-align:center;padding:26px">No hay registros en este período.</td></tr>`}</tbody></table>
      <div class="pie"><span>Página ${S.hPag} de ${paginas}</span><span style="display:flex;gap:8px"><button id="hant" ${S.hPag <= 1 ? "disabled" : ""}>← Anterior</button><button id="hsig" ${S.hPag >= paginas ? "disabled" : ""}>Siguiente →</button></span></div></div>`;
    enlazarPeriodo(main);
    main.querySelectorAll("[data-ht]").forEach((b) => (b.onclick = () => { S.hTab = b.dataset.ht; S.hPag = 1; pintar(true); }));
    main.querySelectorAll("[data-hf]").forEach((s2) => (s2.onchange = () => { F[s2.dataset.hf] = s2.value; S.hPag = 1; pintar(true); }));
    main.querySelectorAll("[data-hses]").forEach((b) => (b.onclick = () => { S.hTab = "actividad"; F.sesion = b.dataset.hses; S.hPag = 1; pintar(true); }));
    const hs = $("#hsinses"); if (hs) hs.onclick = () => { F.sesion = ""; pintar(true); };
    const hq = $("#hq"); let reloj; if (hq) hq.oninput = (e) => { clearTimeout(reloj); reloj = setTimeout(() => { F.q = e.target.value; S.hPag = 1; pintar(true); }, 400); };
    $("#hant").onclick = () => { S.hPag--; pintar(true); }; $("#hsig").onclick = () => { S.hPag++; pintar(true); };
    $("#hcsv").onclick = () => {
      const cab = ses ? ["Usuario", "Rol", "Inicio", "Última actividad", "Minutos", "Actividades", "IP", "Dispositivo", "Estado"] : ["Fecha y hora", "Usuario", "Rol", "Tipo", "Actividad", "IP", "Dispositivo", "Sesión"];
      const csv = [cab].concat(filas.map((x) => ses ? [x.usuario, x.rol, x.inicio, x.ultima, x.minutos, x.actividades, x.ip, x.dispositivo, x.estado] : [fh(x.en), x.usuario, x.rol, x.tipo_texto, x.texto, x.ip, x.dispositivo, x.sesion]))
        .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = `aha-home-historial-${S.hTab}-${S.finDesde}-a-${S.finHasta}.csv`; a.click();
      api("/panel-api/actividad", { body: { tipo: "descarga", texto: `Descargó el historial de ${S.hTab}` } }).catch(() => {});
    };
  }
  async function cargarQR(img, id) {
    // el servidor genera la imagen del QR
    if (!img) return;
    const r = await fetch(`/admin/qrs/${id}.png`, { headers: { Authorization: "Bearer " + S.token } });
    if (r.ok) img.src = URL.createObjectURL(await r.blob());
  }

  // ---------- Centro de mando: usuarios del personal, claves y limitaciones ----------
  // ---------- Finanzas y contabilidad ----------
  const FIN_TABS = [["resumen", "Resumen", "Finanzas y contabilidad"], ["movimientos", "Movimientos", "Movimientos"], ["pagos", "Pagos recibidos", "Pagos recibidos"],
    ["gastos", "Gastos", "Gastos"], ["reclamos", "Reclamos", "Reclamos"], ["pendientes", "Por cobrar y pagar", "Por cobrar y por pagar"], ["cierre", "Cierre de caja", "Cierre de caja"],
    ["cuentas", "Bancos y cuentas", "Bancos y cuentas"], ["medios", "Tipos de pago", "Tipos de pago"]];
  const FIN_TEXTO = {
    movimientos: "Libro único de ingresos y gastos, con filtros y conciliación.",
    pagos: "Todo lo que entró: los cobros de la caja, los presupuestos y las penalidades llegan solos; los demás ingresos se registran con «＋ Ingreso».",
    gastos: "Pagos a técnicos, materiales, nómina, servidor, publicidad, comisiones, impuestos y reembolsos.",
    reclamos: "Reclamos de dinero de clientes o tiendas. Al marcar uno como «Reembolsado», el reembolso queda registrado como gasto.",
    pendientes: "Se arma solo con lo que ocurre en las aplicaciones y los gastos que registres. El sistema no mueve dinero: deja constancia de lo que ya pagaste o recibiste.",
    cierre: "Compara lo que el sistema dice que se cobró en la caja de la tienda con lo que se contó. No incluye presupuestos ni penalidades, que se confirman aparte.",
  };
  const GRAD = { zelle: "g-zelle", efectivo: "g-cash", banco_nacional: "g-nac", banco_internacional: "g-int", otro: "g-otro" };
  const ICONO_MEDIO = { zelle: "Z", efectivo: "$", banco_nacional: "🏦", banco_internacional: "🌎", otro: "＋" };
  const m2 = (x) => Number(x || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dmy = (f) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—");
  const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const restaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
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
  function finPeriodo() {
    const pre = [["hoy", "Hoy", 1], ["7", "7 días", 7], ["30", "30 días", 30], ["90", "90 días", 90], ["365", "1 año", 365]];
    return `<div class="fin-periodo">${pre.map(([k, t]) => `<button class="${S.finPre === k ? "on" : ""}" data-pre="${k}">${t}</button>`).join("")}
      <label>Desde <input type="date" id="fdesde" value="${S.finDesde}"></label><label>Hasta <input type="date" id="fhasta" value="${S.finHasta}"></label></div>`;
  }
  function enlazarPeriodo(raiz) {
    raiz.querySelectorAll("[data-pre]").forEach((b) => (b.onclick = () => { const n = { hoy: 1, 7: 7, 30: 30, 90: 90, 365: 365 }[b.dataset.pre];
      S.finPre = b.dataset.pre; S.finHasta = hoyLocal(); S.finDesde = restaDias(S.finHasta, n - 1); S.finPag = 1; pintar(true); }));
    const fd = raiz.querySelector("#fdesde"), fh = raiz.querySelector("#fhasta");
    if (fd) fd.onchange = () => { S.finDesde = fd.value; S.finPre = ""; S.finPag = 1; pintar(true); };
    if (fh) fh.onchange = () => { S.finHasta = fh.value; S.finPre = ""; S.finPag = 1; pintar(true); };
  }
  async function finanzas(main) {
    S.finTab = S.finTab || "resumen";
    if (!S.finHasta) { S.finPre = "30"; S.finHasta = hoyLocal(); S.finDesde = restaDias(S.finHasta, 29); }
    const cat = await api("/finanzas/catalogo");
    const edita = cat.puede_editar, tab = FIN_TABS.find((x) => x[0] === S.finTab) || FIN_TABS[0];
    main.querySelector(".migas").innerHTML = `Finanzas › <b>${esc(tab[2])}</b>`; main.querySelector("h1").textContent = tab[2];
    main.innerHTML += `<div class="fin-barra"><div class="tabs">${FIN_TABS.map(([k, t]) => `<button class="${S.finTab === k ? "on" : ""}" data-ft="${k}">${t}</button>`).join("")}</div></div>
      ${edita ? `<div class="fin-acc"><button class="btn sec" data-nuevo="ingreso">＋ Ingreso</button><button class="btn sec" data-nuevo="reclamo">＋ Reclamo</button><button class="btn pri" data-nuevo="gasto">＋ Registrar gasto</button></div>` : ""}<div id="fin"></div>`;
    main.querySelectorAll("[data-ft]").forEach((b) => (b.onclick = () => { S.finTab = b.dataset.ft; S.finPag = 1; S.finFil = {}; pintar(true); }));
    main.querySelectorAll("[data-nuevo]").forEach((b) => (b.onclick = () => (b.dataset.nuevo === "reclamo" ? fichaReclamo(cat, null) : fichaMovimiento(cat, b.dataset.nuevo))));
    const fin = $("#fin");
    if (S.finTab === "resumen") return finResumen(fin, cat);
    if (["movimientos", "pagos", "gastos"].includes(S.finTab)) return finLibro(fin, cat);
    if (S.finTab === "reclamos") return finReclamos(fin, cat);
    if (S.finTab === "pendientes") return finPendientes(fin, cat);
    if (S.finTab === "cierre") return finCierre(fin, cat);
    if (S.finTab === "cuentas") return finCuentas(fin, cat);
    return finMedios(fin, cat);
  }
  const pctVs = (v, malo) => v === null || v === undefined ? `<span class="fk-vs">Sin período anterior</span>`
    : `<span class="fk-vs ${(v >= 0) !== !!malo ? "sube" : "baja"}">${v >= 0 ? "↗" : "↘"} ${m2(Math.abs(v))}% vs. anterior</span>`;
  function barrasLista(items, total) {
    const max = Math.max(1, ...items.map((x) => Number(x.usd)));
    return items.length ? items.map((x) => `<div class="fb-fila"><div class="fb-t"><span>${esc(x.nombre)}</span><b>$${m2(x.usd)}</b></div><i style="width:${(Number(x.usd) * 100) / max}%"></i></div>`).join("")
      : `<div class="fin-vacio">Nada en este período.</div>`;
  }
  async function finResumen(fin, cat) {
    const [r, recl] = await Promise.all([api(`/finanzas/tablero?desde=${S.finDesde}&hasta=${S.finHasta}`), api("/finanzas/reclamos")]);
    const abiertos = recl.filter((x) => ["abierto", "en_revision"].includes(x.estado)).slice(0, 3);
    const ing = Number(r.ingresos_usd), gas = Number(r.gastos_usd), res = Number(r.resultado_usd);
    const tile = (ic, t, v, nota, serie) => `<div class="fin-kpi"><div class="fk-t"><span class="fk-ic">${ic}</span>${t}</div><div class="fk-v">${v}</div><div class="fk-n">${nota}</div>${serie ? spark(serie, 30) : ""}</div>`;
    fin.innerHTML = finPeriodo() + `<div class="fin-kpis tres">
        ${tile("↗", "Ingresos", "$" + m2(ing), pctVs(r.var_ingresos), r.serie_ingresos)}
        ${tile("↘", "Gastos", "$" + m2(gas), pctVs(r.var_gastos, true), r.serie_gastos)}
        ${tile("≈", "Resultado", (res < 0 ? "−$" : "$") + m2(Math.abs(res)), pctVs(r.var_resultado))}
        ${tile("%", "Margen", r.margen === null ? "—" : r.margen + "%", "Resultado sobre ingresos")}
        ${tile("!", "Reclamos abiertos", r.reclamos_abiertos, "$" + m2(r.reclamos_monto_usd) + " en disputa")}
        ${tile("Bs", "Tasa BCV", r.tasa ? m2(r.tasa) : "—", r.tasa ? "Bs por USD" : "Sin cargar")}
        ${tile("←", "Por cobrar", "$" + m2(r.por_cobrar_usd), `${r.por_cobrar_n} cuenta(s) · ${r.por_confirmar_n} pago(s) por confirmar ($${m2(r.por_confirmar_usd)})`)}
        ${tile("→", "Por pagar", "$" + m2(r.por_pagar_usd), `${r.por_pagar_n} cuenta(s) · incluye $${m2(r.propinas_por_pagar_usd)} de propinas`)}
        ${tile("✓", "Sin conciliar", r.sin_conciliar, "Movimientos por comprobar en el banco o la caja")}</div>
      <div class="fin-medio">
        <div class="fin-lado"><div class="fin-lado-t">⚑ Reclamos por atender <a href="#" data-ir="reclamos">Ver todos</a></div>
          ${abiertos.length ? abiertos.map((x, i) => `<div class="mini-grad mg${i}" data-rec="${x.id}"><span class="chip-est">${esc(x.estado_texto)}</span><b>$${m2(x.monto_usd)}</b>
            <div class="mg-t">${esc(x.cliente)}</div><div class="mg-s">${esc(x.motivo)}${x.orden ? " · " + esc(x.orden) : ""}</div><span class="mg-ir">›</span></div>`).join("")
            : `<div class="fin-vacio">Sin reclamos abiertos.</div>`}
          <div class="fin-lado-t" style="margin-top:12px">⇄ Bancos y cuentas <a href="#" data-ir="cuentas">Ver todas</a></div>
          ${r.cuentas.length ? r.cuentas.slice(0, 3).map((c) => `<div class="cta-mini"><span class="fk-ic">${ICONO_MEDIO[c.categoria] || "🏦"}</span><div><b>${esc(c.nombre)}</b><small>${esc(c.categoria_texto)}${c.identificador ? " · " + esc(c.identificador) : ""}</small></div><span>${c.moneda === "Bs" ? "Bs" : "$"} ${m2(c.saldo)}</span></div>`).join("")
            : `<div class="fin-vacio">Agrega tus bancos en «Bancos y cuentas».</div>`}
        </div>
        <div class="fin-hero"><div class="fh-top"><span class="chip-est">💼 Estado del negocio</span><span class="chip-est">${dmy(r.desde)} al ${dmy(r.hasta)}</span></div>
          <div class="fh-tit">${res < 0 ? "Pérdida" : "Ganancia"} del período</div><div class="fh-num">${res < 0 ? "−" : ""}$${m2(Math.abs(res))}</div>
          <div class="fh-sub">Entraron <b>$${m2(ing)}</b> y salieron <b>$${m2(gas)}</b> · <span class="ley"><i></i>Ingresos</span> <span class="ley l2"><i></i>Gastos</span></div>
          ${lineas(r.serie_ingresos, r.serie_gastos)}
          <div class="fh-acc"><button class="btn blanco" data-ir="pagos">▸ Ver pagos</button><button class="btn vidrio" id="fexp">⇩ Exportar</button></div></div>
      </div>
      <div class="fin-sec-t">Ingresos por tipo de pago <small>$${m2(ing)} en el período</small></div>
      <div class="fin-grads">${r.por_tipo_pago.map((x) => `<div class="grad ${GRAD[x.categoria]}"><div class="gr-top"><span class="chip-est">${x.pct ? x.pct + "%" : "—"}</span><span class="gr-ic">${ICONO_MEDIO[x.categoria]}</span></div>
          <div class="gr-c">${anillo(x.pct)}</div><div class="gr-t">${esc(x.nombre)}</div><div class="gr-v">$${m2(x.usd)}</div></div>`).join("")}</div>
      <div class="card fin-bloque"><div class="tit"><span>Ingresos por concepto</span></div>${barrasLista(r.por_concepto)}</div>
      <div class="card fin-bloque"><div class="tit"><span>Gastos por categoría</span></div>${barrasLista(r.por_gasto)}</div>
      <div class="card fin-bloque"><div class="tit"><span>Ingresos por tienda</span></div>${barrasLista(r.por_tienda)}</div>
      <div class="card fin-bloque"><div class="tit"><span>Ingresos por método</span><span class="total">USD: $${m2(r.metodo_usd)} · Bs: $${m2(r.metodo_bs)}</span></div>
        ${r.por_metodo.length ? r.por_metodo.map((m) => `<div class="fm-fila"><div><span>${esc(m.metodo)} (${m.cobros})</span>${m.bs ? `<small>Bs ${m2(m.bs)}</small>` : ""}</div><b>$${m2(m.usd)}</b></div>`).join("") : `<div class="fin-vacio">Nada en este período.</div>`}</div>
      <p class="total fin-nota">Solo cuenta lo confirmado. Las propinas no son ingreso ni gasto de AHA HOME: pertenecen a los técnicos. Los montos en bolívares usan la tasa BCV guardada en cada cobro.</p>`;
    enlazarPeriodo(fin);
    fin.querySelectorAll("[data-ir]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.finTab = a.dataset.ir; pintar(true); }));
    fin.querySelectorAll("[data-rec]").forEach((d) => (d.onclick = () => fichaReclamo(cat, recl.find((x) => x.id === Number(d.dataset.rec)))));
    $("#fexp").onclick = async () => { const l = await api(`/finanzas/libro?desde=${S.finDesde}&hasta=${S.finHasta}`); descargarLibro(l.filas, "finanzas"); };
  }
  function descargarLibro(filas, nombre) {
    const csv = [["Fecha", "Tipo", "Concepto", "Detalle", "Orden", "Cliente o beneficiario", "Tipo de pago", "Referencia", "Cuenta", "Monto USD", "Monto Bs", "Estado", "Conciliado", "Tienda"]]
      .concat(filas.map((f) => [f.fecha, f.tipo === "ingreso" ? "Ingreso" : "Gasto", f.concepto, f.detalle, f.orden, f.cliente, f.medio, f.referencia, f.cuenta,
        (f.tipo === "gasto" ? "-" : "") + f.monto_usd, f.monto_bs || "", f.estado, f.conciliado ? "Sí" : "No", f.tienda]))
      .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `aha-home-${nombre}-${S.finDesde}-a-${S.finHasta}.csv`; a.click();
    api("/panel-api/actividad", { body: { tipo: "descarga", texto: `Descargó ${nombre} (${dmy(S.finDesde)} al ${dmy(S.finHasta)})` } }).catch(() => {});
  }
  function tablaFin(cols, filas, acc) {
    return `<div class="tabla"><table><thead><tr>${cols.map(([, t]) => `<th>${t}</th>`).join("")}${acc ? "<th></th>" : ""}</tr></thead><tbody>
      ${filas.length ? filas.map((f, i) => `<tr>${cols.map(([k]) => `<td>${f[k] ?? "—"}</td>`).join("")}${acc ? `<td>${acc(f, i)}</td>` : ""}</tr>`).join("") : `<tr><td colspan="${cols.length + 1}" class="total" style="text-align:center;padding:26px">Todavía no hay registros.</td></tr>`}</tbody></table></div>`;
  }
  const estFin = (e) => `<span class="est ${{ cobrado: "ok", confirmado: "ok", conciliado: "ok", reembolsado: "ok", registrado: "neutro", abierto: "pend", en_revision: "pend", "por confirmar": "pend", "por pagar": "info", anulado: "mal", rechazado: "mal" }[e] || "neutro"}">${esc(String(e).replace("_", " "))}</span>`;
  async function finLibro(fin, cat) {
    const l = await api(`/finanzas/libro?desde=${S.finDesde}&hasta=${S.finHasta}`);
    const F = (S.finFil = S.finFil || {}), tab = S.finTab;
    const base = l.filas.filter((f) => tab === "movimientos" || (tab === "pagos" ? f.tipo === "ingreso" : f.tipo === "gasto"));
    const q = (F.q || "").toLowerCase();
    const filas = base.filter((f) => (!F.tipo || f.tipo === F.tipo) && (!F.concepto || f.concepto === F.concepto) && (!F.medio || f.medio === F.medio) && (!F.estado || f.estado === F.estado)
      && (!F.tienda || f.tienda === F.tienda) && (!F.conc || (F.conc === "si" ? f.conciliado : !f.conciliado))
      && (!q || [f.orden, f.cliente, f.referencia, f.concepto, f.detalle].some((v) => String(v || "").toLowerCase().includes(q))));
    const cuenta = (f) => f.estado === "confirmado" && !f.propina;
    const entra = filas.filter((f) => cuenta(f) && f.tipo === "ingreso").reduce((a, f) => a + Number(f.monto_usd), 0);
    const sale = filas.filter((f) => cuenta(f) && f.tipo === "gasto").reduce((a, f) => a + Number(f.monto_usd), 0);
    const porPag = 25, paginas = Math.max(1, Math.ceil(filas.length / porPag)); S.finPag = Math.min(S.finPag || 1, paginas);
    const vista = filas.slice((S.finPag - 1) * porPag, S.finPag * porPag);
    const sel = (k, todos, ops) => `<select class="sel" data-fil="${k}"><option value="">${todos}</option>${ops.map(([v, t]) => `<option value="${esc(v)}" ${F[k] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    const uniq = (k) => [...new Set(base.map((f) => f[k]))].filter(Boolean).sort().map((v) => [v, v]);
    fin.innerHTML = `<div class="fin-desc"><p class="total">${FIN_TEXTO[tab]}</p><button class="btn sec" id="fcsv">⬇ Descargar Excel (CSV)</button></div>` + finPeriodo() +
      `<div class="fin-filtros"><input class="finp fbus" id="fq" placeholder="⌕ Orden, cliente, referencia" value="${esc(F.q || "")}">
        ${tab === "movimientos" ? sel("tipo", "Ingresos y gastos", [["ingreso", "Solo ingresos"], ["gasto", "Solo gastos"]]) : ""}
        ${sel("concepto", "Todos los conceptos", uniq("concepto"))}${sel("medio", "Todos los tipos de pago", uniq("medio"))}
        ${sel("estado", "Todos los estados", [["confirmado", "Confirmado"], ["por confirmar", "Por confirmar"], ["por pagar", "Por pagar"], ["anulado", "Anulado"]])}
        ${sel("tienda", "Todas las tiendas", uniq("tienda"))}${sel("conc", "Conciliación", [["si", "Conciliado"], ["no", "Sin conciliar"]])}</div>
      <div class="tabla fin-libro"><div class="fl-cab"><span>${filas.length} movimiento(s) · confirmado: entra <b class="sube">$${m2(entra)}</b> · sale <b class="baja">$${m2(sale)}</b></span></div>
      <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Orden</th><th>Cliente o beneficiario</th><th>Tipo de pago</th><th style="text-align:right">Monto</th><th>Estado</th><th>Conciliado</th><th></th></tr></thead><tbody>
      ${vista.length ? vista.map((f) => `<tr class="${f.estado === "anulado" ? "anulada" : ""}"><td>${dmy(f.fecha)}</td>
        <td><b>${esc(f.concepto)}</b>${f.detalle ? `<br><small class="total">${esc(f.detalle)}</small>` : ""}</td><td>${esc(f.orden || "—")}</td><td>${esc(f.cliente || "—")}</td>
        <td>${f.medio && f.medio !== "—" ? esc(f.medio) : "—"}${f.referencia || f.cuenta ? `<br><small class="total">${esc([f.referencia, f.cuenta].filter(Boolean).join(" · "))}</small>` : ""}</td>
        <td class="fl-monto ${f.tipo === "ingreso" ? "sube" : "baja"}"><b>${f.tipo === "ingreso" ? "+" : "−"}$${m2(f.monto_usd)}</b>${f.monto_bs ? `<br><small class="total">Bs ${m2(f.monto_bs)}</small>` : ""}</td>
        <td>${estFin(f.estado)}</td>
        <td>${f.estado === "confirmado" ? `<label class="fl-conc"><input type="checkbox" data-conc="${f.clave}" ${f.conciliado ? "checked" : ""} ${cat.puede_editar ? "" : "disabled"}> ${f.conciliado ? "Sí" : "No"}</label>` : "—"}</td>
        <td><div class="acc"><button title="Ver" data-ver="${f.clave}">👁</button>${cat.puede_editar && f.mov_id && f.estado !== "anulado" ? `<button title="Anular" data-anu="${f.mov_id}">⊘</button>` : ""}</div></td></tr>`).join("")
        : `<tr><td colspan="9" class="total" style="text-align:center;padding:26px">No hay movimientos con estos filtros.</td></tr>`}</tbody></table>
      <div class="pie"><span>Página ${S.finPag} de ${paginas}</span><span style="display:flex;gap:8px"><button id="fant" ${S.finPag <= 1 ? "disabled" : ""}>← Anterior</button><button id="fsig" ${S.finPag >= paginas ? "disabled" : ""}>Siguiente →</button></span></div></div>`;
    enlazarPeriodo(fin);
    fin.querySelectorAll("[data-fil]").forEach((s) => (s.onchange = () => { F[s.dataset.fil] = s.value; S.finPag = 1; pintar(true); }));
    let reloj; $("#fq").oninput = (e) => { clearTimeout(reloj); reloj = setTimeout(() => { F.q = e.target.value; S.finPag = 1; pintar(true).then?.(() => { const i = $("#fq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 400); };
    $("#fant").onclick = () => { S.finPag--; pintar(true); }; $("#fsig").onclick = () => { S.finPag++; pintar(true); };
    $("#fcsv").onclick = () => descargarLibro(filas, tab);
    fin.querySelectorAll("[data-conc]").forEach((c) => (c.onchange = () => api("/finanzas/conciliar", { body: { clave: c.dataset.conc, conciliado: c.checked } }).then(() => pintar(true)).catch(() => pintar(true))));
    fin.querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => verMovimiento(filas.find((f) => f.clave === b.dataset.ver))));
    fin.querySelectorAll("[data-anu]").forEach((b) => (b.onclick = () => cajonFin("Anular movimiento", `<p class="total">El movimiento deja de contar en los totales. No se puede deshacer.</p><label class="flab">Motivo</label><textarea id="amo" class="finp" rows="3" placeholder="Ej. registrado dos veces"></textarea>`,
      () => api(`/finanzas/movimientos/${b.dataset.anu}`, { method: "PUT", body: { estado: "anulado", motivo: $("#amo").value } }))));
  }
  function verMovimiento(f) {
    const fila = (t, v) => v ? `<div class="fv-fila"><span>${t}</span><b>${v}</b></div>` : "";
    const c = cajonFin(esc(f.concepto), `<div class="fv">${fila("Fecha", dmy(f.fecha))}${fila("Tipo", f.tipo === "ingreso" ? "Ingreso" : "Gasto")}${fila("Detalle", esc(f.detalle))}
      ${fila("Orden", esc(f.orden))}${fila("Cliente o beneficiario", esc(f.cliente))}${fila("Tienda", esc(f.tienda))}${fila("Tipo de pago", esc(f.medio))}${fila("Referencia", esc(f.referencia))}
      ${fila("Cuenta", esc(f.cuenta))}${fila("Monto", (f.tipo === "ingreso" ? "+" : "−") + "$" + m2(f.monto_usd))}${fila("Monto en bolívares", f.monto_bs ? "Bs " + m2(f.monto_bs) : "")}
      ${fila("Estado", estFin(f.estado))}${fila("Conciliado", f.estado === "confirmado" ? (f.conciliado ? "Sí" : "No") : "")}${fila("Motivo de anulación", esc(f.motivo_anulacion || ""))}
      ${fila("Origen", { caja: "Caja de la tienda", presupuesto: "Presupuesto", penalidad: "Penalidad", propina: "Propina (es del técnico)", materiales: "Materiales al técnico", manual: "Registro manual" }[f.origen])}</div>`, async () => {});
    c.querySelector("#fg").hidden = true;
  }
  async function finPendientes(fin, cat) {
    const p = await api("/finanzas/pendientes");
    const dias = (n) => `<span class="est ${n >= 7 ? "mal" : "info"}">${n} día(s)</span>`;
    const bloque = (t, sub, total, cols, filas, vacio) => `<div class="tabla fin-pend"><div class="fl-cab"><span><b>${t}</b> · ${filas.length} · ${sub}</span><b>$${m2(total)}</b></div>
      <table><thead><tr>${cols.map(([, h]) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${filas.length ? filas.map((f) => `<tr>${cols.map(([k]) => `<td>${f[k] ?? "—"}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${cols.length}" class="total">${vacio}</td></tr>`}</tbody></table></div>`;
    fin.innerHTML = `<p class="total">${FIN_TEXTO.pendientes}</p>` +
      bloque("Pagos por confirmar", "el cliente dice que pagó", p.confirmar_total, [["concepto", "Concepto"], ["orden", "Orden"], ["cliente", "Cliente"], ["pago", "Pago"], ["dias", "Antigüedad"], ["monto", "Monto"]],
        p.confirmar.map((x) => ({ ...x, concepto: `<b>${esc(x.concepto)}</b>`, cliente: esc(x.cliente), pago: esc(x.pago), dias: dias(x.dias), monto: `<b>$${m2(x.monto_usd)}</b>` })), "Nada pendiente.") +
      bloque("Por cobrar", "falta que el cliente pague", p.cobrar_total, [["concepto", "Concepto"], ["orden", "Orden"], ["cliente", "Cliente"], ["dias", "Antigüedad"], ["monto", "Monto"]],
        p.cobrar.map((x) => ({ ...x, concepto: `<b>${esc(x.concepto)}</b>`, cliente: esc(x.cliente), dias: dias(x.dias), monto: `<b>$${m2(x.monto_usd)}</b>` })), "Nada por cobrar.") +
      bloque("Por pagar", "técnicos, reembolsos y gastos", p.pagar_total, [["concepto", "Concepto"], ["orden", "Orden"], ["quien", "A quién"], ["dias", "Antigüedad"], ["monto", "Monto"], ["acc", ""]],
        p.pagar.map((x) => ({ ...x, concepto: `<b>${esc(x.concepto)}</b>`, quien: esc(x.quien), dias: dias(x.dias), monto: `<b>$${m2(x.monto_usd)}</b>`,
          acc: cat.puede_editar ? `<button class="btn sec" data-pagar="${x.clave}">Registrar pago</button>` : "" })), "Nada por pagar.");
    fin.querySelectorAll("[data-pagar]").forEach((b) => (b.onclick = () => { const x = p.pagar.find((y) => y.clave === b.dataset.pagar);
      cajonFin("Registrar pago", `<div class="card" style="min-height:0;margin-top:10px"><b>${esc(x.concepto)}</b>${x.orden && x.orden !== "—" ? " · " + esc(x.orden) : ""}<div class="total">Para ${esc(x.quien)}</div><div class="grande">$${m2(x.monto_usd)}</div></div>
        ${finSel("pmp", "Tipo de pago", [["", "Elige el tipo de pago"]].concat(cat.medios.filter((m) => m.activo).map((m) => [m.id, m.nombre])), "")}
        ${finSel("pct", "Cuenta (opcional)", [["", "Ninguna"]].concat(cat.cuentas.filter((c) => c.activo).map((c) => [c.id, `${c.nombre} · ${c.moneda}`])), "")}
        ${finCampo("prf", "Referencia", "")}<div class="total">Obligatoria si no es efectivo. El sistema no mueve dinero: deja constancia de lo que ya pagaste.</div>`,
        () => api("/finanzas/pendientes/pagar", { body: { clave: x.clave, medio_id: $("#pmp").value ? Number($("#pmp").value) : null, cuenta_id: $("#pct").value ? Number($("#pct").value) : null, referencia: $("#prf").value } })); }));
  }
  async function finCierre(fin, cat) {
    const tiendas = (await api("/admin/tiendas").catch(() => [])) || [];
    S.cierreTienda = S.cierreTienda || tiendas[0]?.id; S.cierreDia = S.cierreDia || hoyLocal();
    if (!S.cierreTienda) { fin.innerHTML = `<div class="fin-vacio">No hay tiendas registradas.</div>`; return; }
    const [c, hist] = await Promise.all([api(`/finanzas/cierre?tienda_id=${S.cierreTienda}&dia=${S.cierreDia}`), api("/finanzas/cierres")]);
    const mon = (m, v) => (m === "Bs" ? "Bs " : "$") + m2(v);
    const cerrado = c.cerrado;
    fin.innerHTML = `<p class="total">${FIN_TEXTO.cierre}</p>
      <div class="tabla fin-cierre"><div class="fl-cab"><b>${cerrado ? "Caja cerrada" : "Cerrar caja"}</b><span class="fc-sel"><select class="sel" id="ctienda">${c.tiendas.map((t) => `<option value="${t.id}" ${t.id === Number(S.cierreTienda) ? "selected" : ""}>${esc(t.nombre)}</option>`).join("")}</select>
        <input type="date" id="cdia" value="${S.cierreDia}" max="${hoyLocal()}"></span></div>
      <table><thead><tr><th>Método</th><th>Cobros</th><th style="text-align:right">Según el sistema</th><th>Contado</th><th style="text-align:right">Diferencia</th></tr></thead><tbody>
      ${(cerrado ? cerrado.detalle : c.metodos).map((m) => `<tr><td><b>${esc(m.texto)}</b></td><td>${m.cobros}</td><td style="text-align:right"><b>${mon(m.moneda, m.sistema)}</b></td>
        <td>${cerrado ? mon(m.moneda, m.contado) : `<input class="finp fc-in" type="number" step="0.01" min="0" data-cont="${m.metodo}" data-sis="${m.sistema}" data-mon="${m.moneda}" placeholder="0,00">`}</td>
        <td style="text-align:right" class="fc-dif" data-dif="${m.metodo}">${cerrado ? (Number(m.diferencia) ? `<b class="baja">${mon(m.moneda, m.diferencia)}</b>` : "—") : "—"}</td></tr>`).join("")}</tbody></table>
      ${cerrado ? `<div class="fc-pie"><span class="est ${cerrado.cuadra ? "ok" : "mal"}">${cerrado.cuadra ? "Cuadra" : "Con diferencias"}</span> <span class="total">Cerrada por ${esc(cerrado.cerrado_por)} · ${fmt("", cerrado.cerrado_en)}${cerrado.nota ? " · " + esc(cerrado.nota) : ""}</span></div>`
        : cat.puede_editar ? `<div class="fc-pie"><input class="finp" id="cnota" placeholder="Nota (obligatoria si hay diferencias)"><button class="btn pri" id="ccerrar">Cerrar caja</button></div><p class="error" id="cerr"></p>` : ""}</div>
      <div class="fin-sec-t">Cierres anteriores</div>
      ${tablaFin([["dia", "Día"], ["tienda", "Tienda"], ["res", "Resultado"], ["por", "Cerrado por"], ["nota", "Nota"]], hist.map((h) => ({ dia: dmy(h.dia), tienda: `<b class="acento">${esc(h.tienda)}</b>`,
        res: `<span class="est ${h.cuadra ? "ok" : "mal"}">${h.abierto ? "Reabierto" : h.cuadra ? "Cuadra" : "Con diferencias"}</span>${h.diferencias.length ? `<br><small class="total">${h.diferencias.map(esc).join("<br>")}</small>` : ""}`,
        por: `${esc(h.cerrado_por)}<br><small class="total">${fmt("", h.cerrado_en)}</small>`, nota: esc(h.nota || "—"), _h: h })),
        cat.puede_editar ? (f) => (f._h.abierto ? "" : `<button class="btn sec" data-reabrir="${f._h.id}">Reabrir</button>`) : null)}`;
    $("#ctienda").onchange = (e) => { S.cierreTienda = e.target.value; pintar(true); };
    $("#cdia").onchange = (e) => { S.cierreDia = e.target.value; pintar(true); };
    fin.querySelectorAll("[data-cont]").forEach((i) => (i.oninput = () => { const d = Number(i.value || 0) - Number(i.dataset.sis), td = fin.querySelector(`[data-dif="${i.dataset.cont}"]`);
      td.innerHTML = i.value === "" ? "—" : Math.abs(d) < 0.005 ? `<span class="sube">Cuadra</span>` : `<b class="baja">${d > 0 ? "+" : "−"}${mon(i.dataset.mon, Math.abs(d))}</b>`; }));
    const cc = $("#ccerrar"); if (cc) cc.onclick = async () => {
      const contado = {}; fin.querySelectorAll("[data-cont]").forEach((i) => (contado[i.dataset.cont] = Number(i.value || 0)));
      try { await api("/finanzas/cierres", { body: { tienda_id: Number(S.cierreTienda), dia: S.cierreDia, contado, nota: $("#cnota").value } }); pintar(true); }
      catch (e) { $("#cerr").textContent = e.message; } };
    fin.querySelectorAll("[data-reabrir]").forEach((b) => (b.onclick = () => api(`/finanzas/cierres/${b.dataset.reabrir}/reabrir`, { body: {} }).then(() => pintar(true))));
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
  function cajonFin(titulo, cuerpo, alGuardar, seccion = "Finanzas") {
    document.querySelector(".cajon")?.remove();
    const c = document.createElement("div"); c.className = "cajon";
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="total">${esc(seccion)}</span><button class="btn sec" id="cer">✕</button></div>
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
      finSel("mc", "Categoría", cats, cats[0][0]) + finCampo("md", "Descripción", "", "text", 'placeholder="Ej. pago semanal grupo A"') +
      finCampo("mb", tipo === "gasto" ? "Beneficiario" : "Cliente o pagador", "", "text", 'placeholder="Opcional"') +
      (tipo === "gasto" ? `<label class="fchk"><input type="checkbox" id="mpp"> Todavía no se ha pagado (dejar por pagar)</label>` : "") +
      finCampo("mf", "Fecha", hoyLocal(), "date") +
      `<div class="fila2"><div>${finCampo("mm", "Monto", "", "number", 'step="0.01" min="0"')}</div><div>${finSel("mo", "Moneda", [["USD", "Dólares"], ["Bs", "Bolívares"]], "USD")}</div></div>
       <div class="total" id="mconv"></div>` +
      finSel("mp", "Tipo de pago", [["", "Elige el tipo de pago"]].concat(cat.medios.filter((m) => m.activo).map((m) => [m.id, m.nombre])), "") +
      finSel("mk", "Cuenta (opcional)", [["", "Ninguna"]].concat(cat.cuentas.filter((c) => c.activo).map((c) => [c.id, `${c.nombre} · ${c.moneda}`])), "") +
      finCampo("mr", "Referencia", "") + `<div class="total">Obligatoria si no es efectivo. Cada cuenta solo recibe pagos de su moneda.</div>` +
      finCampo("mn", "Orden (opcional)", "", "text", 'placeholder="WO-1234"'),
      () => api("/finanzas/movimientos", { body: { tipo, categoria: $("#mc").value, descripcion: $("#md").value, fecha: $("#mf").value, monto: Number($("#mm").value), moneda: $("#mo").value,
        medio_id: $("#mp").value ? Number($("#mp").value) : null, cuenta_id: $("#mk").value ? Number($("#mk").value) : null, referencia: $("#mr").value, orden: $("#mn").value,
        beneficiario: $("#mb").value, por_pagar: !!$("#mpp")?.checked } }));
    const conv = () => { const v = Number($("#mm").value || 0); $("#mconv").textContent = $("#mo").value === "Bs" && cat.tasa ? `≈ $${m2(v / cat.tasa)} a la tasa BCV de Bs ${m2(cat.tasa)}` : ""; };
    $("#mm").oninput = conv; $("#mo").onchange = conv;
  }
  function fichaReclamo(cat, x) {
    if (!x) return cajonFin("Nuevo reclamo", finCampo("rcl", "Cliente o tienda") + finCampo("ror", "Orden (opcional)", "", "text", 'placeholder="WO-1234"') +
      `<label class="flab">Motivo</label><textarea id="rmo" class="finp" rows="3" placeholder="Ej. cobro doble en caja"></textarea>` + finCampo("rmn", "Monto en disputa (USD)", "", "number", 'step="0.01" min="0"'),
      () => api("/finanzas/reclamos", { body: { cliente: $("#rcl").value, orden: $("#ror").value, motivo: $("#rmo").value, monto: Number($("#rmn").value || 0) } }));
    if (x.estado === "reembolsado") {
      const c = cajonFin(`Reclamo ${x.codigo}`, `<div class="card" style="min-height:0;margin-top:10px"><b>${esc(x.cliente)}</b>${x.orden ? " · " + esc(x.orden) : ""}<div class="total">${esc(x.motivo)}</div><div class="grande">$${m2(x.monto_usd)}</div></div>
        <div class="aviso-ok" style="margin-top:12px">✓ Reembolsado${x.medio ? " por " + esc(x.medio) : ""}. Un reclamo reembolsado no se reabre ni se paga de nuevo.</div>${x.resolucion ? `<p class="total">${esc(x.resolucion)}</p>` : ""}`, async () => {});
      c.querySelector("#fg").hidden = true; return;
    }
    cajonFin(`Reclamo ${x.codigo}`, `<div class="card" style="min-height:0;margin-top:10px"><b>${esc(x.cliente)}</b>${x.orden ? " · " + esc(x.orden) : ""}<div class="total">${esc(x.motivo)}</div><div class="grande">$${m2(x.monto_usd)}</div></div>` +
      finSel("res", "Estado", Object.entries(cat.estados_reclamo), x.estado) + `<label class="flab">Resolución</label><textarea id="rrs" class="finp" rows="3">${esc(x.resolucion || "")}</textarea>` +
      `<div class="fila2"><div>${finSel("rmp", "Tipo de pago", [["", "Elige"]].concat(cat.medios.filter((m) => m.activo).map((m) => [m.id, m.nombre])), "")}</div>
       <div>${finSel("rct", "Cuenta (opcional)", [["", "Ninguna"]].concat(cat.cuentas.filter((c) => c.activo && c.moneda === "USD").map((c) => [c.id, c.nombre])), "")}</div></div>` +
      finCampo("rrf", "Referencia", "") +
      `<div class="total" style="margin-top:8px">Obligatoria si no es efectivo. Al marcarlo «Reembolsado» el sistema no mueve dinero: deja constancia de lo que ya devolviste y lo suma a los gastos. No puede superar lo pagado en la orden.</div>`,
      () => api(`/finanzas/reclamos/${x.id}`, { method: "PUT", body: { estado: $("#res").value, resolucion: $("#rrs").value, medio_id: $("#rmp").value ? Number($("#rmp").value) : null,
        cuenta_id: $("#rct").value ? Number($("#rct").value) : null, referencia: $("#rrf").value } }));
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
  const MENUS_NOMBRE = { cliente: "Cliente · menú de abajo", cliente_lateral: "Cliente · menú ☰ (hoy solo lo ve quien no ha verificado su correo)", tecnico: "Técnico · menú de abajo" };
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
      f.innerHTML = inp("marca.nombre", "Nombre de la app", D.marca.nombre, 'maxlength="30"') + inp("marca.eslogan", "Eslogan", D.marca.eslogan, 'maxlength="60"') + `<div class="total" style="margin:-4px 0 8px">Por ahora la app no muestra el eslogan en ninguna pantalla.</div>` +
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

  // ---------- Campana: avisos al momento (cada servicio nuevo de la caja, cancelaciones, reprogramaciones…) ----------
  const ICO_VENTA = { "Nuevo servicio": "🛒", "Servicio cancelado": "✕", "Servicio reprogramado": "↻", "Entrega fallida": "⚠", "Servicio completado": "✓" };
  const CLASE_VENTA = { nuevo: "v-nuevo", cancelado: "v-cancel", reprogramado: "v-reprog", fallido: "v-fallido", completado: "v-comp" };
  const icoNoti = (t) => ICO_VENTA[Object.keys(ICO_VENTA).find((k) => t.startsWith(k))] || "🔔";
  const claseNoti = (t) => t.startsWith("Nuevo") ? "v-nuevo" : t.startsWith("Servicio cancelado") ? "v-cancel" : t.startsWith("Servicio reprogramado") ? "v-reprog" : t.startsWith("Entrega fallida") ? "v-fallido" : t.startsWith("Servicio completado") ? "v-comp" : "";
  async function revisarCampana(inicio) {
    if (!S.token || !$("#camn")) return;
    try {
      const ns = await api("/notificaciones"); S.notis = ns;
      const sin = ns.filter((n) => !n.leida), b = $("#camn"), total = sin.length + pendientesCampana().reduce((t, x) => t + x.n, 0);
      b.hidden = !total; b.textContent = total > 9 ? "9+" : total;
      const vistos = S.notiVistas || new Set(ns.map((n) => n.id));
      const llegaron = inicio ? [] : sin.filter((n) => !vistos.has(n.id));
      llegaron.slice(0, 3).reverse().forEach(brindis);
      if (llegaron.length && S.ruta === "ventas" && !document.querySelector(".cajon")) pintar(true);  // Ventas se actualiza sola
      S.notiVistas = new Set(ns.map((n) => n.id));
      if (!$("#camm").hidden) pintarCampana();
    } catch { /* sin conexión */ }
    clearTimeout(S.camT); S.camT = setTimeout(() => revisarCampana(false), 15000);
  }
  function brindis(n) {
    let pila = document.querySelector(".brindis-pila"); if (!pila) { pila = document.createElement("div"); pila.className = "brindis-pila"; document.body.appendChild(pila); }
    const d = document.createElement("div"); d.className = "brindis " + claseNoti(n.titulo);
    d.innerHTML = `<span class="bz-ic">${icoNoti(n.titulo)}</span><div><b>${esc(n.titulo)}</b><small>${esc(n.texto)}</small></div>`;
    d.onclick = () => { d.remove(); if (puede("ventas")) location.hash = "ventas"; };
    pila.appendChild(d); setTimeout(() => d.classList.add("fuera"), 9000); setTimeout(() => d.remove(), 9500);
  }
  function pendientesCampana() {
    const c = S.cuentas || {}, l = [];
    if (c.verif && puede("verificaciones")) l.push({ n: c.verif, t: "Verificaciones de técnicos por revisar", r: "verificaciones", i: "👷" });
    if (c.rep && puede("reportes")) l.push({ n: c.rep, t: "Reportes abiertos", r: "reportes", i: "⚠" });
    return l;
  }
  function pintarCampana() {
    const m = $("#camm"), ns = S.notis || [], tab = S.camTab || "nuevas";
    const nuevas = ns.filter((n) => !n.leida), leidas = ns.filter((n) => n.leida), lista = tab === "nuevas" ? nuevas : leidas, pend = pendientesCampana();
    const item = (n) => `<div class="cm-i ${n.leida ? "" : "nueva"} ${claseNoti(n.titulo)}" data-n="${n.id}"><span class="bz-ic">${icoNoti(n.titulo)}</span>
        <div><b>${esc(n.titulo)}</b><small>${esc(n.texto)}</small><em>${fmt("", n.fecha)}</em></div></div>`;
    m.innerHTML = `<div class="cm-cab"><b>Notificaciones</b>${nuevas.length ? `<button class="enlace" id="cmtodas">Marcar todas como leídas</button>` : ""}</div>
      <div class="cm-tabs"><button class="${tab === "nuevas" ? "on" : ""}" data-ct="nuevas">Nuevas (${nuevas.length + pend.reduce((t, x) => t + x.n, 0)})</button><button class="${tab === "leidas" ? "on" : ""}" data-ct="leidas">Leídas</button></div>
      <div class="cm-lista">${tab === "nuevas" && pend.length ? `<div class="cm-sec">PENDIENTES POR ATENDER</div>` + pend.map((x) => `<a class="cm-i nueva" href="#${x.r}"><span class="bz-ic">${x.i}</span><div><b>${x.t}</b><small>${x.n} pendiente(s) · toca para ir</small></div></a>`).join("") : ""}
        ${lista.length ? (tab === "nuevas" ? `<div class="cm-sec">AVISOS</div>` : "") + lista.slice(0, 25).map(item).join("")
          : tab === "nuevas" && pend.length ? "" : `<div class="fin-vacio">${tab === "nuevas" ? "Estás al día: no hay avisos nuevos." : "Todavía no hay avisos leídos."}</div>`}</div>
      ${puede("ventas") ? `<a class="cm-pie" href="#ventas">Ver todo en Ventas ›</a>` : ""}`;
    m.querySelectorAll("[data-ct]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.camTab = b.dataset.ct; pintarCampana(); }));
    m.querySelectorAll("a.cm-i").forEach((a) => (a.onclick = () => { m.hidden = true; }));
    const t = $("#cmtodas"); if (t) t.onclick = async (e) => { e.stopPropagation(); await api("/notificaciones/leer", { body: {} }); revisarCampana(true); };
    m.querySelectorAll("[data-n]").forEach((x) => (x.onclick = async () => { await api(`/notificaciones/${x.dataset.n}/leer`, { body: {} }).catch(() => {}); m.hidden = true; if (puede("ventas")) location.hash = "ventas"; revisarCampana(true); }));
  }
  document.addEventListener("click", (e) => { const m = document.getElementById("camm"); if (m && !m.hidden && !e.target.closest(".campana")) m.hidden = true; });

  // ---------- Departamento de ventas ----------
  const VEN_TABS = [["resumen", "Resumen"], ["nuevo", "Nuevos"], ["cancelado", "Cancelados"], ["reprogramado", "Reprogramados"], ["fallido", "Entregas fallidas"], ["completado", "Completados"]];
  async function ventasPag(main) {
    S.venTab = S.venTab || "resumen"; S.venDias = S.venDias || 30;
    main.innerHTML += `<div class="fin-barra"><div class="tabs">${VEN_TABS.map(([k, t]) => `<button class="${S.venTab === k ? "on" : ""}" data-vt="${k}">${t}</button>`).join("")}</div>
      <select class="sel" id="vdias">${[1, 7, 30, 90].map((d) => `<option value="${d}" ${d === S.venDias ? "selected" : ""}>${d === 1 ? "Hoy" : d + " días"}</option>`).join("")}</select></div><div id="ven"></div>`;
    main.querySelectorAll("[data-vt]").forEach((b) => (b.onclick = () => { S.venTab = b.dataset.vt; pintar(true); }));
    $("#vdias").onchange = (e) => { S.venDias = Number(e.target.value); pintar(true); };
    const v = $("#ven");
    if (S.venTab !== "resumen") {
      const ms = await api(`/ventas/movimientos?tipo=${S.venTab}&dias=${S.venDias}`);
      v.innerHTML = tablaFin([["en", "Cuándo"], ["orden", "Orden"], ["cliente", "Cliente"], ["tienda", "Tienda"], ["cajero", "Caja"], ["servicio", "Servicio"], ["monto", "Monto"], ["nota", "Detalle"]],
        ms.map((m) => ({ en: fmt("", m.en), orden: `<b>${esc(m.orden)}</b>`, cliente: esc(m.cliente), tienda: esc(m.tienda), cajero: esc(m.cajero), servicio: `${esc(m.servicio)}<br><small class="total">${m.articulos} artículo(s) · cita ${esc(m.cita)}</small>`,
          monto: `$${m2(m.monto_usd)}<br><small class="total">${esc(m.pago)}</small>`, nota: `<small>${esc(m.nota)}</small><br><small class="total">por ${esc(m.por)}</small>` })));
      return;
    }
    const r = await api(`/ventas/resumen?dias=${S.venDias}`);
    const tile = (ic, t, val, nota, cls = "") => `<div class="fin-kpi ${cls}"><div class="fk-t"><span class="fk-ic">${ic}</span>${t}</div><div class="fk-v">${val}</div><div class="fk-n">${nota}</div></div>`;
    const maxT = Math.max(1, ...Object.values(r.por_tienda));
    v.innerHTML = `<div class="fin-kpis tres">
        ${tile("🛒", "Servicios nuevos", r.nuevos, r.dias === 1 ? "Hoy" : `Últimos ${r.dias} días`)}
        ${tile("✕", "Cancelados", r.cancelados, r.tasa_cancelacion === null ? "—" : `${r.tasa_cancelacion}% de los nuevos`)}
        ${tile("↻", "Reprogramados", r.reprogramados, "Cambio de fecha")}
        ${tile("⚠", "Entregas fallidas", r.fallidos, "Con penalidad")}
        ${tile("✓", "Completados", r.completados, `${r.en_curso} en curso ahora`)}
        ${tile("$", "Ticket promedio", "$" + m2(r.ticket_usd), "Por servicio nuevo")}</div>
      <div class="fin-medio">
        <div class="fin-lado"><div class="fin-lado-t">⚡ Lo último <a href="#" data-vir="nuevo">Ver todo</a></div>
          ${r.ultimos.length ? r.ultimos.slice(0, 6).map((m) => `<div class="v-item ${CLASE_VENTA[m.tipo]}"><span class="bz-ic">${icoNoti(m.tipo_texto)}</span><div><b>${esc(m.tipo_texto)} · ${esc(m.orden)}</b>
            <small>${esc(m.cliente)} · ${esc(m.tienda)}</small><em>${fmt("", m.en)}</em></div><span class="v-m">$${m2(m.monto_usd)}</span></div>`).join("") : `<div class="fin-vacio">Todavía no hay movimientos.</div>`}</div>
        <div class="fin-hero v-hero"><div class="fh-top"><span class="chip-est">📈 Departamento de ventas</span></div>
          <div class="fh-tit">Vendido en caja en el período</div><div class="fh-num">$${m2(r.vendido_usd)}</div>
          <div class="fh-sub"><b>${r.nuevos}</b> servicios nuevos · <span class="ley"><i></i>Nuevos</span> <span class="ley l2"><i></i>Cancelados y fallidos</span></div>
          ${lineas(r.serie_nuevos, r.serie_bajas)}
          <div class="fh-acc"><button class="btn blanco" data-vir="nuevo">▸ Ver servicios nuevos</button><button class="btn vidrio" data-vir="cancelado">Ver cancelados</button></div></div>
      </div>
      <div class="fin-dos">
        <div class="card"><div class="tit"><span>Servicios nuevos por tienda</span><span class="total">${r.nuevos}</span></div>${Object.keys(r.por_tienda).length ? `<div class="barras-h">${Object.entries(r.por_tienda).map(([k, n]) => `<div><span>${esc(k)}</span><i style="width:${(n * 100) / maxT}%"></i><b>${n}</b></div>`).join("")}</div>` : `<div class="fin-vacio">Sin servicios en el período.</div>`}
          <div class="tit" style="margin-top:18px"><span>Ranking de cajas</span></div>${r.por_cajero.length ? r.por_cajero.slice(0, 5).map((c, i) => `<div class="cta-mini"><span class="fk-ic">${i + 1}</span><div><b>${esc(c.cajero)}</b><small>${c.servicios} servicio(s)</small></div><span>$${m2(c.monto_usd)}</span></div>`).join("") : ""}</div>
        <div class="card"><div class="tit"><span>Por tipo de servicio</span><span class="total">${r.nuevos}</span></div>${dona(r.por_servicio)}</div>
      </div>`;
    v.querySelectorAll("[data-vir]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.venTab = a.dataset.vir; pintar(true); }));
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
    $("#sal2").onclick = () => salir(true);
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
      if (!["supervisor", "superadmin", "ventas"].includes(S.yo.rol)) { salir(); alert("El panel es solo para el equipo de oficina (superadmin, centro de control y ventas). La caja usa la app."); return; }
    }
    if (S.yo.clave_temporal) return cambioObligatorio(app);
    if (!puede(S.ruta) && !(S.ruta === "usuarios" && S.yo.es_ceo) && !(S.ruta === "auditoria" && S.yo.es_ceo) && !(S.ruta === "correos" && S.yo.es_ceo) && !(S.ruta === "historial" && S.yo.es_ceo)) {
      const primera = Object.keys(PERM_RUTA).find((k) => puede(k)); S.ruta = primera || "sinpermisos"; location.hash = S.ruta;
    }
    if (puedeHacer("ver_tablero")) try { const r = await datos(30); S.cuentas = { verif: r.verificaciones_pendientes, rep: r.reportes_abiertos }; S.notif = r.verificaciones_pendientes + r.reportes_abiertos; } catch { /* sin datos */ }
    const [g, t] = TITULOS[S.ruta] || ["", S.ruta];
    if (!soloContenido || !$(".main")) {
      app.innerHTML = `<div class="top"><button class="hamb" id="hamb">☰</button><div class="marca"><svg><use href="#logo"/></svg>AHA HOME</div>
        <div class="buscar"><input id="bg" placeholder="Presiona / para buscar"><div class="resultados" id="rg" style="display:none"></div></div><div class="esp"></div>
        <button class="ico-btn" id="tema" title="Tema claro u oscuro">${document.documentElement.dataset.tema === "oscuro" ? "☀" : "☾"}</button>
        <div class="campana"><button class="ico-btn" id="cam" title="Notificaciones">🔔<span class="badge" id="camn" hidden></span></button><div class="cam-menu" id="camm" hidden></div></div>
        <div class="usuario"><button class="ico-btn" style="width:auto;padding:0 12px;border-radius:19px" id="um">${esc(S.yo.nombre)} ⌄</button><div class="menu" id="umm" style="display:none"><button disabled>${S.yo.es_ceo ? "CEO" : S.yo.rol === "superadmin" ? "Superadministrador" : S.yo.rol === "ventas" ? "Departamento de ventas" : "Centro de control"}</button><button id="mic">🔑 Cambiar mi clave</button><button id="sal">Cerrar sesión</button></div></div></div>
        <div class="cuerpo"><nav class="lat ${S.latOculta ? "oculto" : ""}">${menuHTML()}</nav><main class="main"></main></div>`;
      $("#hamb").onclick = () => { S.latOculta = !S.latOculta; $(".lat").classList.toggle("oculto"); };
      $("#tema").onclick = () => { const n = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro"; document.documentElement.dataset.tema = n; localStorage.setItem("ahahome.panel.tema", n); pintar(); };
      $("#cam").onclick = (e) => { e.stopPropagation(); const m = $("#camm"); m.hidden = !m.hidden; if (!m.hidden) pintarCampana(); };
      revisarCampana(true);
      $("#um").onclick = () => { const m = $("#umm"); m.style.display = m.style.display === "none" ? "block" : "none"; };
      $("#sal").onclick = () => salir(true);
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
      else if (S.ruta === "ventas") await ventasPag(main);
      else if (S.ruta === "inicio") await inicio(main);
      else if (S.ruta === "anuncios") await anuncios(main);
      else if (S.ruta === "auditoria") await auditoria(main);
      else if (S.ruta === "tasa") await pagTasa(main);
      else if (S.ruta === "tarifas") await pagTarifas(main);
      else if (S.ruta === "precios") await pagPrecios(main);
      else if (S.ruta === "qrs") await pagQrs(main);
      else if (S.ruta === "historial") await historial(main);
      else await tabla(main, S.ruta);
    } catch (e) { main.innerHTML += `<p class="error">${esc(e.message)}</p>`; }
    anotarConsulta(main);
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
      try { const r = await api("/auth/login", { body: { usuario: $("#u").value, password: $("#p").value } }); S.token = r.token; S.sesion = r.sesion || ""; localStorage.setItem("ahahome.panel.token", r.token); localStorage.setItem("ahahome.panel.sesion", S.sesion); S.yo = null; S.consultaVista = ""; pintar(); }
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
  // Menú: abrir y cerrar grupos
  document.addEventListener("click", (e) => {
    const g = e.target.closest(".lat .grupo"); if (!g) return;
    const k = g.dataset.grupo; S.gAbiertos.has(k) ? S.gAbiertos.delete(k) : S.gAbiertos.add(k);
    const ab = S.gAbiertos.has(k); g.classList.toggle("abierto", ab); g.setAttribute("aria-expanded", ab);
    let s = g.nextElementSibling; while (s && (s.classList.contains("cap") || s.classList.contains("sub"))) { s.hidden = !ab; if (s.classList.contains("sub")) break; s = s.nextElementSibling; }
  });

  // Listas desplegables con el estilo del panel (SIS-008)
  let listaAbierta = null;
  function cerrarLista() { if (!listaAbierta) return; listaAbierta.ul.remove(); listaAbierta.btn.setAttribute("aria-expanded", "false"); listaAbierta = null; }
  function textoSel(sel) { const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ""; }
  function abrirLista(sel, btn) {
    cerrarLista();
    const ul = document.createElement("ul"); ul.className = "sel-lista"; ul.setAttribute("role", "listbox");
    const opts = [...sel.options];
    opts.forEach((o, i) => {
      const li = document.createElement("li"); li.setAttribute("role", "option"); li.dataset.i = i; li.textContent = o.textContent;
      if (o.disabled) li.setAttribute("aria-disabled", "true");
      if (i === sel.selectedIndex) { li.classList.add("elegida"); li.setAttribute("aria-selected", "true"); }
      li.onmousedown = (e) => e.preventDefault();
      li.onclick = () => { if (!o.disabled) elegir(i); };
      ul.appendChild(li);
    });
    document.body.appendChild(ul);
    const r = btn.getBoundingClientRect(), alto = Math.min(ul.scrollHeight, 300), abajo = innerHeight - r.bottom;
    ul.style.minWidth = r.width + "px"; ul.style.left = Math.min(r.left, innerWidth - ul.offsetWidth - 8) + "px";
    ul.style.top = (abajo < alto + 12 && r.top > abajo ? r.top - alto - 6 : r.bottom + 6) + "px";
    let foco = Math.max(0, sel.selectedIndex), buscado = "", reloj;
    const marcar = (i) => { foco = i; ul.querySelectorAll("li").forEach((li) => li.classList.toggle("foco", +li.dataset.i === i)); ul.children[i]?.scrollIntoView({ block: "nearest" }); };
    const elegir = (i) => { if (i !== sel.selectedIndex) { sel.selectedIndex = i; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); }
      btn.querySelector(".sel-txt").textContent = textoSel(sel); cerrarLista(); btn.focus(); };
    listaAbierta = { ul, btn, sel, teclas: (e) => {
      const n = opts.length;
      if (e.key === "ArrowDown") { e.preventDefault(); let i = foco; do { i = Math.min(n - 1, i + 1); } while (opts[i]?.disabled && i < n - 1); marcar(i); }
      else if (e.key === "ArrowUp") { e.preventDefault(); let i = foco; do { i = Math.max(0, i - 1); } while (opts[i]?.disabled && i > 0); marcar(i); }
      else if (e.key === "Home") { e.preventDefault(); marcar(0); } else if (e.key === "End") { e.preventDefault(); marcar(n - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(foco); }
      else if (e.key === "Escape" || e.key === "Tab") { cerrarLista(); }
      else if (e.key.length === 1) { buscado += e.key.toLowerCase(); clearTimeout(reloj); reloj = setTimeout(() => (buscado = ""), 700);
        const i = opts.findIndex((o) => o.textContent.trim().toLowerCase().startsWith(buscado)); if (i >= 0) marcar(i); }
    } };
    btn.setAttribute("aria-expanded", "true"); marcar(foco);
  }
  function listaBonita(sel) {
    if (sel.dataset.bonita || sel.multiple || sel.size > 1) return;
    sel.dataset.bonita = "1";
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "sel-btn " + sel.className;
    btn.style.cssText = sel.style.cssText; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    const lab = sel.id && document.querySelector(`label[for="${sel.id}"]`); if (lab) btn.setAttribute("aria-label", lab.textContent.trim());
    btn.innerHTML = `<span class="sel-txt"></span><span class="sel-flecha" aria-hidden="true">⌄</span>`;
    btn.querySelector(".sel-txt").textContent = textoSel(sel);
    btn.disabled = sel.disabled;
    sel.classList.add("sel-oculto"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    sel.insertAdjacentElement("afterend", btn);
    btn.onclick = () => (listaAbierta?.btn === btn ? cerrarLista() : abrirLista(sel, btn));
    btn.onkeydown = (e) => { if (listaAbierta?.btn === btn) return listaAbierta.teclas(e);
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); abrirLista(sel, btn); } };
    const sync = () => { btn.querySelector(".sel-txt").textContent = textoSel(sel); btn.disabled = sel.disabled; };
    sel.addEventListener("change", sync);
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true });
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    Object.defineProperty(sel, "value", { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
  }
  document.addEventListener("mousedown", (e) => { if (listaAbierta && !e.target.closest(".sel-lista") && e.target.closest(".sel-btn") !== listaAbierta.btn) cerrarLista(); });
  window.addEventListener("resize", cerrarLista);
  document.addEventListener("scroll", (e) => { if (listaAbierta && !e.target.closest?.(".sel-lista")) cerrarLista(); }, true);
  const mejorar = () => { ponerOjos(document.body); document.querySelectorAll("select:not([data-bonita])").forEach(listaBonita); };
  new MutationObserver(mejorar).observe(document.body, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => { S.ruta = location.hash.slice(1) || "inicio"; document.querySelector(".cajon")?.remove(); window.scrollTo(0, 0); pintar(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); $("#bg")?.focus(); } });
  pintar();
})();
