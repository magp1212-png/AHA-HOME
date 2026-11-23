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
    { sec: "ADMINISTRACIÓN AHA HOME" },
    { g: "Personal interno", i: "🛡", hijos: [["administradores", "Superadministradores"], ["control", "Centro de control"], ["caja", "Operadores de caja"]] },
  ];
  const TITULOS = { inicio: ["Tableros", "Panel principal"], tecnicos: ["Técnicos", "Técnicos y ayudantes"], empresas: ["Registros", "Empresas aliadas"], clientes: ["Registros", "Clientes"],
    equipo: ["Administración", "Personal AHA HOME"], administradores: ["Administración", "Superadministradores"], control: ["Administración", "Centro de control"], caja: ["Administración", "Operadores de caja"], anuncios: ["Recursos", "Banners y aliados"], ordenes: ["Órdenes", "Lista"], transacciones: ["Órdenes", "Transacciones"],
    mensajeria: ["Centro de soporte", "Mensajería"], liquidaciones: ["Órdenes", "Liquidaciones"], verificaciones: ["Técnicos", "Verificaciones"], reportes: ["Centro de soporte", "Reportes"],
    resenas: ["Centro de soporte", "Reseñas"], auditoria: ["Centro de mando", "Auditoría del equipo"] };

  function menuHTML() {
    const it = (k, t, i) => `<a class="it ${S.ruta === k ? "on" : ""}" href="#${k}"><span class="i">${i}</span>${t}</a>`;
    let h = "";
    for (const m of MENU) {
      if (m.sec) { h += `<div style="margin:14px 12px 4px;font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--suave)">${m.sec}</div>`; continue; }
      if (m.k) { h += it(m.k, m.t, m.i); continue; }
      h += `<div class="grupo"><span style="display:flex;gap:12px"><span class="i" style="width:22px;text-align:center">${m.i}</span>${m.g}</span><span>⌄</span></div>`;
      if (m.cap) h += `<div class="cap">${m.cap}</div>`;
      h += `<div class="sub">${m.hijos.map(([k, t, c]) => `<a href="#${k}" class="${S.ruta === k ? "on" : ""}">${t}${c && S.cuentas?.[c] ? `<span class="cuenta">${S.cuentas[c]}</span>` : ""}</a>`).join("")}</div>`;
    }
    if (S.yo?.es_ceo) h += `<div style="height:10px"></div>` + it("auditoria", "Centro de mando", "🛡");
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
  async function inicio(main) {
    const vis = TARJETAS.filter((c) => !S.ocultas.includes(c.id));
    main.innerHTML += `<button class="ocultar" id="ocu">${S.verOcultar ? "LISTO ⌃" : "HIDE CARDS ⌄"}</button>
      ${S.verOcultar ? `<div class="card" style="min-height:0;margin-bottom:18px;display:flex;flex-wrap:wrap;gap:10px">${TARJETAS.map((c) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-oc="${c.id}" ${S.ocultas.includes(c.id) ? "" : "checked"}>${c.t}</label>`).join("")}</div>` : ""}
      <div class="grid">${vis.map((c) => `<div class="card ${c.ancho === 2 ? "ancho2" : ""}" id="c-${c.id}"><div class="tit"><span>${c.t}</span>${c.sinDias ? `<span class="total" data-tot="${c.id}"></span>` : `<span style="display:flex;gap:8px;align-items:center"><span class="total" data-tot="${c.id}"></span><select class="sel" data-dias="${c.id}">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${(S.dias[c.id] || 30) === d ? "selected" : ""}>${d === 365 ? "1 año" : d + " días"}</option>`).join("")}</select></span>`}</div><div class="cont">…</div></div>`).join("")}</div>
      <div class="pie-app">AHA HOME — Hacemos todo por ti · Onyxa LLC © 2026</div>`;
    $("#ocu").onclick = () => { S.verOcultar = !S.verOcultar; pintar(); };
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

  // ---------- Armado ----------
  async function pintar(soloContenido) {
    const app = $("#app");
    if (!S.token) return login(app);
    if (!S.yo) {
      try { S.yo = await api("/yo"); } catch { return; }
      if (!["supervisor", "superadmin"].includes(S.yo.rol)) { salir(); alert("El panel es solo para el superadmin y el centro de control. La caja usa la app."); return; }
    }
    try { const r = await datos(30); S.cuentas = { verif: r.verificaciones_pendientes, rep: r.reportes_abiertos }; S.notif = r.verificaciones_pendientes + r.reportes_abiertos; } catch { /* sin datos */ }
    const [g, t] = TITULOS[S.ruta] || ["", S.ruta];
    if (!soloContenido || !$(".main")) {
      app.innerHTML = `<div class="top"><button class="hamb" id="hamb">☰</button><div class="marca"><svg><use href="#logo"/></svg>AHA HOME</div>
        <div class="buscar"><input id="bg" placeholder="Presiona / para buscar"><div class="resultados" id="rg" style="display:none"></div></div><div class="esp"></div>
        <button class="ico-btn" id="tema" title="Tema claro u oscuro">${document.documentElement.dataset.tema === "oscuro" ? "☀" : "☾"}</button>
        <a class="ico-btn" href="#verificaciones" title="Pendientes">🔔${S.notif ? `<span class="badge">${S.notif}</span>` : ""}</a>
        <div class="usuario"><button class="ico-btn" style="width:auto;padding:0 12px;border-radius:19px" id="um">${esc(S.yo.nombre)} ⌄</button><div class="menu" id="umm" style="display:none"><button disabled>${S.yo.es_ceo ? "CEO" : S.yo.rol === "superadmin" ? "Superadministrador" : "Centro de control"}</button><button id="sal">Cerrar sesión</button></div></div></div>
        <div class="cuerpo"><nav class="lat ${S.latOculta ? "oculto" : ""}">${menuHTML()}</nav><main class="main"></main></div>`;
      $("#hamb").onclick = () => { S.latOculta = !S.latOculta; $(".lat").classList.toggle("oculto"); };
      $("#tema").onclick = () => { const n = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro"; document.documentElement.dataset.tema = n; localStorage.setItem("ahahome.panel.tema", n); pintar(); };
      $("#um").onclick = () => { const m = $("#umm"); m.style.display = m.style.display === "none" ? "block" : "none"; };
      $("#sal").onclick = salir;
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
      if (S.ruta === "inicio") await inicio(main);
      else if (S.ruta === "anuncios") await anuncios(main);
      else if (S.ruta === "auditoria") await auditoria(main);
      else await tabla(main, S.ruta);
    } catch (e) { main.innerHTML += `<p class="error">${esc(e.message)}</p>`; }
  }

  function login(app) {
    app.innerHTML = `<div class="login"><form id="f"><div style="display:flex;align-items:center;gap:12px"><svg width="44" height="44"><use href="#logo"/></svg><b style="font-size:22px">AHA HOME</b></div>
      <div style="font-size:22px;font-weight:800">Panel del superadministrador</div><div class="total" style="margin-top:-6px">Solo personal autorizado · cada ingreso queda registrado</div>
      <label>Correo</label><input id="u" autocomplete="username" required><label>Contraseña</label><input id="p" type="password" autocomplete="current-password" required>
      <p class="error" id="e"></p><button class="btn pri" style="height:48px">Entrar</button></form></div>`;
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault();
      try { const r = await api("/auth/login", { body: { usuario: $("#u").value, password: $("#p").value } }); S.token = r.token; localStorage.setItem("ahahome.panel.token", r.token); S.yo = null; pintar(); }
      catch (e) { $("#e").textContent = e.message; }
    };
  }

  window.addEventListener("hashchange", () => { S.ruta = location.hash.slice(1) || "inicio"; document.querySelector(".cajon")?.remove(); pintar(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); $("#bg")?.focus(); } });
  pintar();
})();
