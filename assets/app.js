/* Home lab landing page.
 * Renders service tiles from config.json and colours them with status pulled
 * from one or more Healthchecks instances (proxied by Caddy — see README). */

(() => {
  "use strict";

  // Populated by loadConfig() before anything renders.
  let CFG = null;

  const STATUS_LABEL = {
    up: "up",
    down: "down",
    grace: "late",
    paused: "paused",
    new: "no pings",
    unknown: "not monitored",
    error: "monitor unreachable",
  };

  // Order matters: drives the tally row, worst first. `error` is counted too,
  // otherwise an unreachable monitor would drop its services out of the
  // summary entirely and the row would quietly stop adding up.
  const TALLY_ORDER = ["down", "grace", "error", "up", "paused", "new", "unknown"];

  // Shown only when non-zero; down/grace/up are always worth a slot.
  const TALLY_IF_PRESENT = new Set(["error", "paused", "new", "unknown"]);

  const $ = (id) => document.getElementById(id);

  /* Inline icon set — 24×24, stroked with currentColor. Kept inline rather
   * than pulled from an icon CDN so the page still renders correctly with the
   * internet down, which is exactly when you need the dashboard most. */
  const ICONS = {
    // Media / *arr — the download-oriented ones carry a down arrow.
    tv:       '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/><path d="M12 11v5m-2.2-2.2L12 16.2l2.2-2.2"/>',
    film:     '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M17 9h5M2 15h5M17 15h5"/><path d="M12 8.5v5m-2-2 2 2 2-2"/>',
    music:    '<path d="M12 15V5l8-2v9"/><circle cx="9.8" cy="15.2" r="2.2"/><circle cx="17.8" cy="13.2" r="2.2"/><path d="M4 10v7.5m-2.2-2.3L4 17.5l2.2-2.3"/>',
    book:     '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M4 17.2h15"/><path d="M11.5 6.5v5m-2.2-2.2 2.2 2.2 2.2-2.2"/>',
    captions: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M10 10.5H7.5A1.5 1.5 0 0 0 6 12v1a1.5 1.5 0 0 0 1.5 1.5H10M18 10.5h-2.5A1.5 1.5 0 0 0 14 12v1a1.5 1.5 0 0 0 1.5 1.5H18"/>',
    search:   '<circle cx="10.5" cy="10.5" r="7"/><path d="m15.6 15.6 5 5"/>',
    play:     '<circle cx="12" cy="12" r="9.5"/><path d="M10 8.2 16 12l-6 3.8z"/>',
    request:  '<rect x="3" y="3.5" width="18" height="17" rx="2"/><path d="M7 9h10M7 13h5"/><path d="M13.5 16.5h5m-2.5-2.5v5"/>',
    chart:    '<path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21"/><path d="m7 15 3.5-4 3 2.5L20 7"/>',
    download: '<path d="M12 3v11m-4-4 4 4 4-4"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',

    // Infrastructure
    server:     '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><path d="M7 6.5h.01M7 17.5h.01"/>',
    proxy:      '<path d="M3 6h4l10 12h4M3 18h4l3-3.6"/><path d="m18 3 3 3-3 3m0 6 3 3-3 3"/>',
    containers: '<rect x="2.5" y="12.5" width="8" height="8" rx="1"/><rect x="13.5" y="12.5" width="8" height="8" rx="1"/><rect x="8" y="3.5" width="8" height="8" rx="1"/>',
    shield:     '<path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.4 7.5 10 4.4-1.6 7.5-5.4 7.5-10v-6z"/><path d="m9 12 2 2 4-4"/>',
    pulse:      '<path d="M2 12h4l2.5-6 4 13 3-9 2 2h4.5"/>',
    globe:      '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5a15 15 0 0 1 0 19 15 15 0 0 1 0-19"/>',

    // Home & files
    home:     '<path d="m3 10.5 9-7.5 9 7.5"/><path d="M5.5 9.2V20h13V9.2"/><path d="M10 20v-6h4v6"/>',
    cloud:    '<path d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 9.4 4.3 4.3 0 0 1 17.5 19z"/>',
    photo:    '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.8"/><path d="m3 17.5 5-4.5 4.5 4 3.5-3 5 4"/>',
    lock:     '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14.5V17"/>',
    document: '<path d="M14 2.5H7A1.5 1.5 0 0 0 5.5 4v16A1.5 1.5 0 0 0 7 21.5h10a1.5 1.5 0 0 0 1.5-1.5V7z"/><path d="M14 2.5V7h4.5"/><path d="M8.5 12.5h7M8.5 16.5h5"/>',
    archive:  '<rect x="2.5" y="3.5" width="19" height="5" rx="1"/><path d="M4.5 8.5v11A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-11"/><path d="M10 13h4"/>',

    // Networking
    network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v3.5m0 0-5.5 5.5m5.5-5.5 5.5 5.5"/>',
    wifi:    '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12.4a10 10 0 0 1 13 0M9 16.3a5 5 0 0 1 6 0"/><circle cx="12" cy="19.8" r="1.3"/>',
    link:    '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1.4 1.4"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1.4-1.4"/>',

    // Monitoring / data
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M20 12c0 1.7-3.6 3-8 3s-8-1.3-8-3"/>',
    gauge:    '<path d="M3.2 17.5a9.5 9.5 0 1 1 17.6 0"/><path d="m12 13.5 4-4.5"/><circle cx="12" cy="14.8" r="1.6"/>',
    cpu:      '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6m6-3.5V6M9 18v3.5m6-3.5v3.5M2.5 9H6m-3.5 6H6m12-6h3.5M18 15h3.5"/>',
    disk:     '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="2.8"/><path d="m14.2 14.2 4.2 4.2"/>',
    clock:    '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l4 2.5"/>',
    bell:     '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>',

    // Automation / dev
    workflow: '<rect x="2.5" y="3" width="7.5" height="6" rx="1.5"/><rect x="14" y="15" width="7.5" height="6" rx="1.5"/><path d="M6.2 9v6a3 3 0 0 0 3 3H14"/>',
    terminal: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="m7 10 3 2.5-3 2.5M13.5 15.5h4"/>',
    git:      '<circle cx="6.5" cy="6" r="2.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="6" r="2.5"/><path d="M6.5 8.5v7M17.5 8.5c0 4.2-4.6 4.4-8.2 5.7"/>',
    bot:      '<rect x="4" y="8" width="16" height="12" rx="3"/><circle cx="9.2" cy="14" r="1.3"/><circle cx="14.8" cy="14" r="1.3"/><path d="M12 8V4.5M10.3 3h3.4"/>',
    flask:    '<path d="M9.5 3v6.2L4.2 18.4A2 2 0 0 0 5.9 21.5h12.2a2 2 0 0 0 1.7-3.1L14.5 9.2V3"/><path d="M8 3h8M7.2 15h9.6"/>',
    camera:   '<path d="m2.5 8.2 15-5.2 2 6-15 5.2z"/><path d="M6 13.4V17a2 2 0 0 0 2 2h2.6"/><circle cx="12.4" cy="19.6" r="1.9"/>',

    // Productivity
    wiki:     '<path d="M12 6.5C10.5 4.8 8.3 4 5.5 4H3v13h2.5c2.8 0 5 .8 6.5 2.5"/><path d="M12 6.5C13.5 4.8 15.7 4 18.5 4H21v13h-2.5c-2.8 0-5 .8-6.5 2.5"/><path d="M12 6.5v13"/>',
    tasks:    '<path d="m3 7 2.5 2.5L10 5"/><path d="m3 17 2.5 2.5L10 15"/><path d="M13 7.5h8M13 17.5h8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    mail:     '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3.2 7 8.8 6 8.8-6"/>',
    key:      '<circle cx="8" cy="15.2" r="4.3"/><path d="m11.1 12.1 8.4-8.4M16.8 6.4l2.7 2.7M14.2 9l2.6 2.6"/>',
    rss:      '<circle cx="6" cy="18" r="1.9"/><path d="M4 10.8A9.2 9.2 0 0 1 13.2 20M4 4.4A15.6 15.6 0 0 1 19.6 20"/>',
    utensils: '<path d="M6 3v7.5a2 2 0 0 0 4 0V3M8 12.5V21"/><path d="M17.2 3c-1.5 0-2.6 2.1-2.6 5.2s1.1 4.3 2.6 4.3 2.6-1.2 2.6-4.3S18.7 3 17.2 3M17.2 12.5V21"/>',
  };

  function iconNode(svc) {
    // A value containing a slash or a dot is treated as an image path/URL.
    if (svc.icon && /[\/.]/.test(svc.icon)) {
      return el("img", { src: svc.icon, alt: "", loading: "lazy" });
    }
    const paths = ICONS[svc.icon];
    if (!paths) return null; // caller falls back to a monogram

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths; // static strings from the map above, never user input
    return svg;
  }

  /* JSON has no comment syntax, so by convention any key beginning with "_" is
   * documentation and gets ignored. That has to be enforced, not just assumed:
   * a stray "_comment" inside `sources` would otherwise be treated as a real
   * Healthchecks instance and fetched. */
  const isComment = (key) => key.startsWith("_");
  const isCommentOnly = (obj) =>
    !obj || typeof obj !== "object" || Object.keys(obj).every(isComment);

  const realEntries = (obj) =>
    Object.entries(obj || {}).filter(([key]) => !isComment(key));
  const realItems = (arr) =>
    (Array.isArray(arr) ? arr : []).filter((item) => !isCommentOnly(item));

  const slugify = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children || [])) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const UNITS = [
    ["year", 31536000], ["month", 2592000], ["day", 86400],
    ["hour", 3600], ["minute", 60], ["second", 1],
  ];

  function relTime(iso) {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;
    const diff = (then - Date.now()) / 1000;
    for (const [unit, secs] of UNITS) {
      if (Math.abs(diff) >= secs || unit === "second") {
        return RTF.format(Math.round(diff / secs), unit);
      }
    }
    return null;
  }

  // Compact form for tiles, where horizontal room is scarce: "4m ago", "2d ago".
  // relTime() stays for tooltips and the orphan list, which can afford words.
  function shortAge(iso) {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;
    const s = Math.max(0, (Date.now() - then) / 1000);
    if (s < 60) return "just now";
    for (const [suffix, secs] of [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]]) {
      if (s >= secs) return `${Math.floor(s / secs)}${suffix} ago`;
    }
    return "just now";
  }

  const clockTime = (d) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* ---------------- data ---------------- */

  // Fetch every configured source in parallel. A source that is down must not
  // take the page with it — each result is settled independently.
  async function loadChecks() {
    const entries = realEntries(CFG.sources);

    const results = await Promise.all(
      entries.map(async ([key, src]) => {
        try {
          const res = await fetch(src.endpoint, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = await res.json();
          const checks = Array.isArray(body.checks) ? body.checks : [];

          const bySlug = new Map();
          for (const c of checks) {
            const key = c.slug || slugify(c.name || "");
            if (key) bySlug.set(key, c);
          }
          return { key, src, ok: true, checks, bySlug };
        } catch (err) {
          return { key, src, ok: false, error: err.message, checks: [], bySlug: new Map() };
        }
      })
    );

    return new Map(results.map((r) => [r.key, r]));
  }

  /* ---------------- rendering ---------------- */

  function monogram(name) {
    const words = String(name).trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return String(name).slice(0, 2).toUpperCase();
  }

  // Stable colour from the name, so unconfigured tiles still look deliberate.
  function autoColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h} 52% 45%)`;
  }

  function hostOf(url) {
    try { return new URL(url).host; } catch { return url; }
  }

  function buildTile(svc, resolved) {
    const { status, check } = resolved;

    const icon = el("div", {
      class: "tile-icon",
      style: `background:${svc.color || autoColor(svc.name)}`,
    });
    const glyph = iconNode(svc);
    if (glyph) icon.appendChild(glyph);
    else icon.textContent = monogram(svc.name);

    // Prefer the real ping age over a static description — it is the piece of
    // information that changes, and the reason to look at the page at all.
    const ping = check ? shortAge(check.last_ping) : null;
    // A check that exists but has never pinged, and an unreachable monitor,
    // both still say so — falling back to `desc` there would make them
    // indistinguishable from a service that isn't monitored at all.
    let sub;
    if (ping) sub = `${STATUS_LABEL[status]} · ${ping}`;
    else if (check || status === "error") sub = STATUS_LABEL[status];
    else sub = svc.desc || hostOf(svc.url);

    const tooltipBits = [svc.name, STATUS_LABEL[status]];
    if (check && check.last_ping) tooltipBits.push(`last ping ${relTime(check.last_ping)}`);
    if (check && check.next_ping) tooltipBits.push(`next due ${relTime(check.next_ping)}`);
    if (svc.desc) tooltipBits.push(svc.desc);

    return el(
      "a",
      {
        class: "tile",
        href: svc.url,
        "data-status": status,
        "data-search": [svc.name, svc.desc, svc.tags, hostOf(svc.url), check && check.tags]
          .filter(Boolean).join(" ").toLowerCase(),
        title: tooltipBits.join(" — "),
        target: "_blank",
        rel: "noopener noreferrer",
      },
      [
        icon,
        el("div", { class: "tile-body" }, [
          el("span", { class: "tile-name", text: svc.name }),
          el("span", { class: "tile-sub", text: sub }),
        ]),
        el("span", { class: "dot tile-status", "data-status": status, "aria-label": STATUS_LABEL[status] }),
      ]
    );
  }

  // Which instance a service belongs to when it doesn't say. Explicit
  // `defaultSource` wins; otherwise the first one declared, so any number of
  // instances can be configured under any names you like.
  function defaultSourceKey() {
    if (CFG.defaultSource) return CFG.defaultSource;
    const first = realEntries(CFG.sources)[0];
    return first ? first[0] : null;
  }

  function resolve(svc, sources, consumed) {
    // `check: null` is an explicit opt-out, distinct from "not set".
    if (svc.check === null) return { status: "unknown", check: null };

    const sourceKey = svc.source || defaultSourceKey();
    const source = sources.get(sourceKey);
    if (!source) return { status: "unknown", check: null };
    if (!source.ok) return { status: "error", check: null };

    const slug = svc.check || slugify(svc.name);
    const check = source.bySlug.get(slug);
    if (!check) return { status: "unknown", check: null };

    consumed.add(`${sourceKey}::${slug}`);
    return { status: check.status || "unknown", check };
  }

  function render(sources) {
    const board = $("board");
    board.textContent = "";

    const counts = Object.fromEntries(TALLY_ORDER.map((s) => [s, 0]));
    const consumed = new Set();

    for (const group of realItems(CFG.groups)) {
      const grid = el("div", { class: "grid" });
      const services = realItems(group.services);
      let alarms = 0;

      for (const svc of services) {
        const resolved = resolve(svc, sources, consumed);
        counts[resolved.status] = (counts[resolved.status] || 0) + 1;
        if (resolved.status === "down" || resolved.status === "grace") alarms++;
        grid.appendChild(buildTile(svc, resolved));
      }

      const head = el("div", { class: "group-head" }, [
        el("h2", { text: group.name }),
        el("span", { class: "group-count", text: String(services.length) }),
      ]);
      if (alarms) {
        head.appendChild(el("span", { class: "group-alarm", text: `${alarms} needs attention` }));
      }

      board.appendChild(el("section", { class: "group", "data-group": group.name }, [head, grid]));
    }

    renderTallies(counts);
    renderSources(sources);
    renderOrphans(sources, consumed);

    $("refreshed").textContent = `updated ${clockTime(new Date())}`;
    applyFilter();
  }

  function renderTallies(counts) {
    const box = $("tallies");
    box.textContent = "";
    for (const status of TALLY_ORDER) {
      const n = counts[status] || 0;
      if (!n && TALLY_IF_PRESENT.has(status)) continue;
      box.appendChild(
        el("span", { class: `tally${n ? "" : " is-zero"}` }, [
          el("span", { class: "dot", "data-status": status }),
          el("b", { text: String(n) }),
          document.createTextNode(" " + STATUS_LABEL[status]),
        ])
      );
    }
  }

  function renderSources(sources) {
    const box = $("sources");
    box.textContent = "";
    for (const { key, src, ok, checks, error } of sources.values()) {
      box.appendChild(
        el("span", { class: `source${ok ? "" : " err"}`, title: ok ? src.endpoint : `${src.endpoint} — ${error}` }, [
          el("span", { class: "dot", "data-status": ok ? "up" : "down" }),
          document.createTextNode(`${src.label || key}: ${ok ? `${checks.length} checks` : "unreachable"}`),
        ])
      );
    }
  }

  // Anything reporting in that no tile claims. Without this, a check you added
  // on the server but forgot to wire up here would silently go unwatched.
  function renderOrphans(sources, consumed) {
    const section = $("orphans");
    const list = $("orphan-list");
    list.textContent = "";
    let n = 0;

    for (const { key, src, ok, checks } of sources.values()) {
      if (!ok) continue;
      for (const c of checks) {
        const slug = c.slug || slugify(c.name || "");
        if (consumed.has(`${key}::${slug}`)) continue;
        n++;
        const ping = relTime(c.last_ping);
        list.appendChild(
          el("span", { class: "orphan", title: `${src.label || key} · slug: ${slug || "—"}` }, [
            el("span", { class: "dot", "data-status": c.status || "unknown" }),
            document.createTextNode(c.name || slug || "(unnamed)"),
            ping ? el("small", { text: ping }) : null,
          ])
        );
      }
    }

    section.hidden = n === 0;
  }

  /* ---------------- filter ---------------- */

  function applyFilter() {
    const q = $("search").value.trim().toLowerCase();
    for (const group of document.querySelectorAll(".group")) {
      let shown = 0;
      for (const tile of group.querySelectorAll(".tile")) {
        const hit = !q || tile.dataset.search.includes(q);
        tile.classList.toggle("hidden", !hit);
        if (hit) shown++;
      }
      group.hidden = shown === 0;
    }
  }

  /* ---------------- theme ---------------- */

  function initTheme() {
    const btn = $("theme-toggle");
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }

    const isDark = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr) return attr === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };

    // Show the action, not the current state.
    const paint = () => { btn.textContent = isDark() ? "☀" : "☾"; };

    btn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      paint();
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
    paint();
  }

  /* ---------------- boot ---------------- */

  let timer = null;

  async function refresh(manual) {
    const btn = $("refresh");
    if (manual) btn.classList.add("spinning");
    try {
      render(await loadChecks());
    } finally {
      if (manual) setTimeout(() => btn.classList.remove("spinning"), 400);
    }
  }

  function schedule() {
    clearInterval(timer);
    const secs = Math.max(10, Number(CFG.refreshSeconds) || 60);
    timer = setInterval(() => {
      if (!document.hidden) refresh(false);
    }, secs * 1000);
  }

  const CONFIG_FILE = "config.json";

  // Shown in place of the board when there is no usable config. Kept as DOM
  // nodes rather than innerHTML because parse errors quote the file back.
  function fatal(heading, detail) {
    const box = el("p", { class: "empty" }, [el("strong", { text: heading })]);
    for (const line of [].concat(detail || [])) {
      box.appendChild(el("br"));
      box.appendChild(typeof line === "string" ? document.createTextNode(line) : line);
    }
    const board = $("board");
    board.textContent = "";
    board.appendChild(box);
  }

  // JSON.parse reports a character offset, not a line. Turn it into the
  // line/column an editor would show you.
  function errorLocation(text, err) {
    const at = /position (\d+)/.exec(String(err.message));
    if (!at) return "";
    const upto = text.slice(0, Number(at[1]));
    const line = upto.split("\n").length;
    const col = upto.length - upto.lastIndexOf("\n");
    return ` (line ${line}, column ${col})`;
  }

  async function loadConfig() {
    let text;
    try {
      const res = await fetch(CONFIG_FILE, { cache: "no-store" });
      if (res.status === 404) {
        // The config is gitignored, so a fresh clone won't have one yet.
        fatal(`No ${CONFIG_FILE} found.`, [
          "Copy the template to get started:",
          el("code", { text: "cp config.example.json config.json" }),
        ]);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      fatal(`Could not read ${CONFIG_FILE}.`, String(err.message || err));
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("file is empty");
      if (!Array.isArray(parsed.groups)) throw new Error('no "groups" array found');
      return parsed;
    } catch (err) {
      fatal(`${CONFIG_FILE} could not be parsed${errorLocation(text, err)}.`, [
        String(err.message || err),
        "JSON allows no comments and no trailing commas.",
      ]);
      return null;
    }
  }

  function init() {
    document.title = CFG.title || "Home Lab";
    $("site-title").textContent = CFG.title || "Home Lab";
    $("foot-note").textContent =
      `Status via Healthchecks · auto-refresh every ${Math.max(10, Number(CFG.refreshSeconds) || 60)}s · edit ${CONFIG_FILE} to add services`;

    initTheme();

    $("search").addEventListener("input", applyFilter);
    $("refresh").addEventListener("click", () => refresh(true));

    document.addEventListener("keydown", (e) => {
      const search = $("search");
      if (e.key === "/" && document.activeElement !== search) {
        e.preventDefault();
        search.focus();
        search.select();
      } else if (e.key === "Escape" && document.activeElement === search) {
        search.value = "";
        applyFilter();
        search.blur();
      }
    });

    // Catch up immediately when the tab comes back rather than waiting out
    // the rest of the interval on stale data.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh(false);
    });

    refresh(false);
    schedule();
  }

  async function boot() {
    CFG = await loadConfig();
    if (CFG) init(); // loadConfig() has already explained any failure
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
