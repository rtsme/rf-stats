"use strict";
// RF Activity dashboard — fetches the static JSON published by webexport.py and renders it.
const RACES = ["Accretia", "Bellato", "Cora"];
const RACE_COL = { Accretia: "#d26050", Bellato: "#5b8dd9", Cora: "#8fc24a" };
const $ = (s, r = document) => r.querySelector(s);
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
const getJSON = u => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });

function raceTag(race) {
  if (!race) return '<span style="color:var(--dim)">—</span>';
  return `<span class="${race}"><span class="dot ${race}"></span>${esc(race)}</span>`;
}

// ---------- tabs (charts are built lazily so their canvas is visible when sized) ----------
const TAB_INIT = { trends: initTrends };
const tabDone = {};
function showTab(name) {
  document.querySelectorAll("nav.tabs button").forEach(x => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll("section").forEach(s => s.classList.toggle("active", s.id === name));
  if (TAB_INIT[name] && !tabDone[name]) {
    tabDone[name] = true;
    TAB_INIT[name]().catch(e => console.error(e));
  }
}
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- Player of the Month ----------
async function initPotm() {
  const idx = await getJSON("data/potm/index.json");
  const sel = $("#monthSel");
  sel.innerHTML = idx.months.map(m => `<option value="${m.key}">${esc(m.label)} — ${esc(m.winner)}</option>`).join("");
  sel.addEventListener("change", () => loadPotm(sel.value));
  if (idx.months.length) loadPotm(idx.months[0].key);
  else $("#potmBody").innerHTML = '<div class="loading">No months published yet.</div>';
}

async function loadPotm(key) {
  const body = $("#potmBody");
  body.innerHTML = '<div class="loading">loading…</div>';
  const s = await getJSON(`data/potm/${key}.json`);
  const w = s.winner, wt = s.weights, ck = wt.cw_kill_mult, lwm = wt.lost_war_mult;
  const wr = s.winning_race;
  const tiles = [
    ["Lost wars kills", w.kills_cw_lost, ck * lwm * w.kills_cw_lost, "var(--gold)"],
    ["Won war kills", w.kills_cw_won, ck * w.kills_cw_won, "var(--cora)"],
    ["Chip bearer", w.bearer, w.pts_bearer, "var(--muted)"],
    ["Other kills", w.kills_out, w.pts_out, "var(--bellato)"],
  ];
  const warsSub = w.wars_fought ? ` · ${w.wars_fought} chip wars fought · ${w.wars_lost} lost` : "";
  body.innerHTML = `
    <div class="spotlight">
      <div>
        <div class="crown">★ CROWNED${wr ? ` · winning race ${esc(wr)}` : ""}</div>
        <div class="name">${esc(w.name)}</div>
        <div class="who ${w.race || ""}">${raceTag(w.race)}<span style="color:var(--dim);font-weight:600">${warsSub}</span></div>
      </div>
      <div class="score"><b>${fmt(w.score)}</b><span>SCORE</span></div>
    </div>
    <div class="label">Score breakdown</div>
    <div class="tiles">${tiles.map(([t, n, p, c]) =>
      `<div class="tile"><div class="t" style="color:${c}">${t}</div><div class="n">${n}</div><div class="p">+${fmt(p)} pts</div></div>`).join("")}</div>
    <div class="bonus">★ hardship bonus +${fmt(w.hardship_bonus)} pts</div>
    <div class="label" style="margin-bottom:8px">Runners-up</div>
    <table><thead><tr><th></th><th>Player</th><th>Race</th><th class="num">Wars fought</th><th class="num">Score</th></tr></thead>
      <tbody>${s.runners.map((r, i) =>
        `<tr><td class="rank">${i + 2}</td><td>${esc(r.name)}</td><td>${raceTag(r.race)}</td>
         <td class="num">${r.wars_fought}</td><td class="num score">${fmt(r.score)}</td></tr>`).join("")
      || '<tr><td colspan="5" class="loading">No other ranked players.</td></tr>'}</tbody></table>`;
}

// ---------- Leaderboards ----------
let BOARDS = null;
function board(title, rows, valLabel) {
  const t = el("div", "panel");
  t.appendChild(el("p", "card-title", esc(title)));
  const tbl = el("table");
  tbl.innerHTML = `<thead><tr><th></th><th>Player</th><th>Race</th><th class="num">${esc(valLabel)}</th></tr></thead>
    <tbody>${rows.map((r, i) =>
      `<tr><td class="rank">${i + 1}</td><td>${esc(r.player)}</td><td>${raceTag(r.race)}</td><td class="num">${r.c}</td></tr>`).join("")
    || '<tr><td colspan="4" class="loading">No data.</td></tr>'}</tbody>`;
  t.appendChild(tbl);
  return t;
}
function renderBoards() {
  const w = $("#boardWin").value, b = BOARDS[w], box = $("#boardsBody");
  box.innerHTML = "";
  box.appendChild(board("Top killers", b.killers, "Kills"));
  box.appendChild(board("Top chip bearers", b.bearers, "Held"));
  box.appendChild(board("Most deaths", b.deaths, "Deaths"));
}
async function initBoards() {
  BOARDS = await getJSON("data/leaderboards.json");
  $("#boardWin").addEventListener("change", renderBoards);
  renderBoards();
}

// ---------- Trends (charts) ----------
const CHART_BASE = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "#ede6da" } } },
  scales: {
    x: { ticks: { color: "#9a8a78", maxTicksLimit: 8 }, grid: { color: "#2a231c" } },
    y: { ticks: { color: "#9a8a78" }, grid: { color: "#2a231c" }, beginAtZero: true },
  },
};
async function initTrends() {
  const pop = await getJSON("data/population.json");
  const s = pop.latest;
  if (s) $("#popNow").innerHTML = [
    ["Online", s.total_online, "var(--text)"], ["Accretia", s.pop_accretia, "var(--accretia)"],
    ["Bellato", s.pop_bellato, "var(--bellato)"], ["Cora", s.pop_cora, "var(--cora)"],
  ].map(([k, v, c]) => `<div class="stat"><b style="color:${c}">${v ?? "—"}</b><span>${k}</span></div>`).join("");

  const px = pop.series.map(r => r.taken_at.slice(5, 16));
  new Chart($("#popChart"), {
    type: "line", options: CHART_BASE,
    data: {
      labels: px, datasets: [
        { label: "Total", data: pop.series.map(r => r.total_online), borderColor: "#e0a83e", tension: .25, pointRadius: 0 },
        { label: "Accretia", data: pop.series.map(r => r.pop_accretia), borderColor: RACE_COL.Accretia, tension: .25, pointRadius: 0 },
        { label: "Bellato", data: pop.series.map(r => r.pop_bellato), borderColor: RACE_COL.Bellato, tension: .25, pointRadius: 0 },
        { label: "Cora", data: pop.series.map(r => r.pop_cora), borderColor: RACE_COL.Cora, tension: .25, pointRadius: 0 },
      ],
    },
  });

  const cw = await getJSON("data/chipwins.json");
  new Chart($("#cwChart"), {
    type: "line", options: CHART_BASE,
    data: {
      labels: cw.series.map(r => r.date), datasets: RACES.map(rc =>
        ({ label: rc, data: cw.series.map(r => r[rc] || 0), borderColor: RACE_COL[rc], tension: .25, pointRadius: 0 })),
    },
  });
}

// ---------- boot ----------
(async function () {
  try {
    const meta = await getJSON("data/meta.json");
    $("#meta").innerHTML = `${meta.total_events.toLocaleString()} events · ${esc(meta.earliest)} → ${esc(meta.latest)}
      · <span title="when this snapshot was published">updated ${esc(meta.generated_at)}</span>`;
  } catch (e) { $("#meta").textContent = "Could not load data."; }
  initPotm().catch(e => $("#potmBody").innerHTML = `<div class="loading">Error: ${esc(e.message)}</div>`);
  initBoards().catch(e => $("#boardsBody").innerHTML = `<div class="loading">Error: ${esc(e.message)}</div>`);
  // Trends (charts) init lazily on first tab open — see showTab().
})();
