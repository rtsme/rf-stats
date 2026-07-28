"use strict";
// RF Activity dashboard — fetches the static JSON published by webexport.py and renders it.
const RACES = ["Accretia", "Bellato", "Cora"];
const RACE_COL = { Accretia: "#d26050", Bellato: "#5b8dd9", Cora: "#8fc24a" };
const $ = (s, r = document) => r.querySelector(s);
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
const getJSON = u => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });

let PLAYERS = {};  // name(lower) -> slug, for players that have a detail page
let SMAP = {};     // name(lower) -> summary row, for EVERY player ever seen (search index)
let SEARCH = [];   // the same rows, for scanning
let DETAIL_RULE = { min_kills: 100, active_days: 90 };   // replaced by the published values
let ACH = { catalogue: [], rarity: {} };
const TIER_CLASS = ["", "t1", "t2", "t3", "t4"];   // bronze → gold by tier index
const fmtVal = (v, f) => f === "ratio" ? (Math.round(v * 100) / 100).toFixed(2) : Number(v).toLocaleString();

function raceTag(race) {
  if (!race) return '<span style="color:var(--dim)">—</span>';
  return `<span class="${race}"><span class="dot ${race}"></span>${esc(race)}</span>`;
}
// a player name; clickable if we have a detail page OR a search-index summary for them
function pName(name) {
  const low = String(name || "").toLowerCase();
  const known = PLAYERS[low] || SMAP[low];
  return `<span class="pname${known ? " known" : ""}"${known ? ` data-name="${esc(name)}"` : ""}>${esc(name)}</span>`;
}

// ---------- player search ----------
const RACE_OF = { A: "Accretia", B: "Bellato", C: "Cora" };
function searchPlayers(q, limit = 25) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const r of SEARCH) {
    const n = r[0].toLowerCase();
    const at = n.indexOf(q);
    if (at < 0) continue;
    hits.push([n === q ? 0 : (at === 0 ? 1 : 2), -r[2], r]);   // exact, then prefix, then kills
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return hits.slice(0, limit).map(h => h[2]);
}
function renderResults(rows) {
  const box = $("#presults");
  if (!rows.length) {
    box.innerHTML = '<div class="pr-empty">No player found.</div>';
  } else {
    box.innerHTML = rows.map(r => `<button class="pr" data-name="${esc(r[0])}">
        <span class="pr-name">${esc(r[0])}</span>
        <span class="pr-race ${RACE_OF[r[1]] || ""}">${r[1] ? `<span class="dot ${RACE_OF[r[1]]}"></span>${esc(RACE_OF[r[1]])}` : "—"}</span>
        <span class="pr-stat">${r[2].toLocaleString()}<i>kills</i></span>
        <span class="pr-stat">${fmtVal(r[4])}<i>K/D</i></span>
        ${r[7].length ? `<span class="pr-badges">${r[7].length}★</span>` : ""}
      </button>`).join("");
  }
  box.hidden = false;
}
function initSearch() {
  const input = $("#psearch"), box = $("#presults");
  const run = () => {
    const q = input.value;
    if (!q.trim()) { box.hidden = true; return; }
    renderResults(searchPlayers(q));
  };
  input.addEventListener("input", run);
  input.addEventListener("focus", run);
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { box.hidden = true; input.blur(); }
    if (e.key === "Enter") {
      const first = box.querySelector(".pr");
      if (first) { openPlayer(first.dataset.name); box.hidden = true; }
    }
  });
  box.addEventListener("click", e => {
    const b = e.target.closest(".pr");
    if (b) { openPlayer(b.dataset.name); box.hidden = true; }
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".searchbar")) box.hidden = true;
  });
}

// ---------- player detail modal ----------
function closePlayer() { $("#playerModal").hidden = true; }
async function openPlayer(name) {
  const low = String(name || "").toLowerCase();
  const slug = PLAYERS[low], summary = SMAP[low];
  if (!slug && !summary) return;
  const card = $("#playerCard");
  card.innerHTML = '<div class="loading">loading…</div>';
  $("#playerModal").hidden = false;
  if (!slug) return renderPlayerLite(card, summary);   // findable, but no full page published
  try {
    renderPlayer(card, await getJSON(`data/players/${slug}.json`));
  } catch (e) {
    if (summary) return renderPlayerLite(card, summary);
    card.innerHTML = `<button class="modal-close">×</button><div class="loading">Couldn't load ${esc(name)}.</div>`;
  }
}

// summary card built from the search index (no per-player page for this player)
function renderPlayerLite(card, r) {
  const [name, race, kills, deaths, kd, wars, bearer, badges] = r;
  const full = RACE_OF[race] || null;
  const bl = badges.map(([id, tier]) => {
    const a = (ACH.catalogue || []).find(x => x.id === id);
    return a ? { id, tier, tiers: a.tiers.length, name: a.tiers[tier - 1].name, group: a.group,
                 desc: a.desc, fmt: a.fmt, value: null, at: a.tiers[tier - 1].at, next_at: null } : null;
  }).filter(Boolean);
  card.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <div class="phead"><div class="pname-big">${raceTag(full)} ${esc(name)}</div></div>
    <div class="pstats">
      ${pstat("Kills", kills.toLocaleString())}${pstat("Deaths", deaths.toLocaleString())}
      ${pstat("K/D", fmtVal(kd))}${pstat("Chip wars", wars.toLocaleString())}
      ${bearer ? pstat("Chip bearer", "×" + bearer) : ""}
    </div>
    ${bl.length ? `<div class="label">Achievements <span class="dim">— ${bl.length}</span></div>
      <div class="badges"><div class="brow">${bl.map(b =>
        `<div class="badge ${TIER_CLASS[b.tier] || "t1"}" title="${esc(b.desc)} · ${esc(b.name)}">
           <div class="bname">${esc(b.name)}</div><div class="bmeta">${esc(b.group)}</div></div>`).join("")}</div></div>` : ""}
    <div class="lite-note">
      <b>Summary view.</b> The totals and achievements above cover this player's entire
      recorded history — nothing is missing from them.
      <br>Detailed pages — favourite targets, nemeses and recent fights — are kept for players
      with <b>${DETAIL_RULE.min_kills}+ kills</b> who have fought in the
      <b>last ${DETAIL_RULE.active_days} days</b>, plus anyone currently in a leaderboard,
      Player of the Month podium or achievement top 10. This player doesn't meet that yet,
      so their detail page isn't regenerated each update.
    </div>`;
}
const pstat = (label, val) => `<div class="pstat"><b>${esc(val)}</b><span>${esc(label)}</span></div>`;

// earned badge: tier colour, value, rarity, and the next tier to chase
function badgeHTML(b) {
  const rar = ACH.rarity[`${b.id}:${b.tier}`];
  const pips = Array.from({ length: b.tiers }, (_, i) =>
    `<i class="${i < b.tier ? "on" : ""}"></i>`).join("");
  const bits = [esc(b.desc) + ": " + fmtVal(b.value, b.fmt)];
  if (rar) bits.push(`earned by ${rar} player${rar === 1 ? "" : "s"}`);
  if (b.next_at) bits.push(`next tier at ${fmtVal(b.next_at, b.fmt)}`);
  return `<div class="badge ${TIER_CLASS[b.tier] || "t1"}" title="${esc(bits.join(" · "))}">
      <div class="bname">${esc(b.name)}</div>
      <div class="bmeta">${fmtVal(b.value, b.fmt)}${rar ? ` · ${rar}` : ""}</div>
      <div class="pips">${pips}</div>
    </div>`;
}
// unearned: progress toward the first tier
function nextHTML(n) {
  return `<div class="nextb" title="${esc(n.desc)}">
      <div class="nbtop"><span>${esc(n.name)}</span>
        <span class="dim">${fmtVal(n.value, n.fmt)} / ${fmtVal(n.goal, n.fmt)}</span></div>
      <div class="bar"><div style="width:${n.pct}%"></div></div>
    </div>`;
}
function achSection(p) {
  const badges = p.badges || [], next = p.next_badges || [];
  if (!badges.length && !next.length) return "";
  let h = "";
  if (badges.length) {
    const groups = {};
    badges.forEach(b => (groups[b.group] = groups[b.group] || []).push(b));
    h += `<div class="label">Achievements <span class="dim">— ${badges.length}</span></div>
          <div class="badges">${Object.entries(groups).map(([g, list]) =>
            `<div class="bgroup"><div class="gname">${esc(g)}</div>
             <div class="brow">${list.map(badgeHTML).join("")}</div></div>`).join("")}</div>`;
  }
  if (next.length) {
    h += `<div class="label">Working toward</div><div class="nextbs">${next.map(nextHTML).join("")}</div>`;
  }
  return h;
}
function renderPlayer(card, p) {
  const tags = p.char_class || "";  // race is already shown in the big name
  const list = (arr, key) => (arr && arr.length)
    ? arr.map(x => `<li>${pName(x[key])}<span class="x">×${x.c}</span></li>`).join("")
    : '<li class="dim">—</li>';
  card.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <div class="phead">
      <div class="pname-big">${raceTag(p.race)} ${esc(p.name)}</div>
      ${tags ? `<div class="dim">${esc(tags)}</div>` : ""}
    </div>
    <div class="pstats">
      ${pstat("Kills", p.kills)}${pstat("Deaths", p.deaths)}${pstat("K/D", fmt(p.kd))}
      ${p.chip_bearer_count ? pstat("Chip bearer", "×" + p.chip_bearer_count) : ""}
      ${p.weapon ? pstat("Top weapon", p.weapon) : ""}
      ${p.avg_victim_level != null ? pstat("Avg victim lvl", p.avg_victim_level) : ""}
    </div>
    ${p.first_seen ? `<div class="dim small">First seen ${esc(p.first_seen)}</div>` : ""}
    ${achSection(p)}
    <div class="pcols">
      <div><div class="label">Most killed</div><ul class="plist">${list(p.top_victims, "victim")}</ul></div>
      <div><div class="label">Killed most by</div><ul class="plist">${list(p.nemeses, "killer")}</ul></div>
    </div>
    <div class="label">Recent PvP</div>
    <ul class="plist recent">${(p.recent && p.recent.length)
      ? p.recent.map(r => `<li><code>${esc(r.event_time)}</code> ${esc(r.message)}</li>`).join("")
      : '<li class="dim">—</li>'}</ul>`;
}
document.addEventListener("click", e => {
  const pn = e.target.closest(".pname.known");
  if (pn) return openPlayer(pn.dataset.name);
  if (e.target.closest(".modal-close") || e.target.classList.contains("modal-bg")) closePlayer();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closePlayer(); });

// ---------- tabs (charts built lazily so their canvas is visible when sized) ----------
const TAB_INIT = { trends: initTrends, achv: async () => initAchv() };
const tabDone = {};
function showTab(name) {
  document.querySelectorAll("nav.tabs button").forEach(x => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll("section").forEach(s => s.classList.toggle("active", s.id === name));
  if (TAB_INIT[name] && !tabDone[name]) { tabDone[name] = true; TAB_INIT[name]().catch(e => console.error(e)); }
}
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

// rank change since midnight (derived by re-scoring the month with an earlier cutoff)
function moveHTML(m) {
  if (!m) return "";
  if (m.prev == null) return '<span class="mv new" title="new in the top 11 today">NEW</span>';
  if (m.delta > 0) return `<span class="mv up" title="up ${m.delta} since midnight">▲${m.delta}</span>`;
  if (m.delta < 0) return `<span class="mv dn" title="down ${-m.delta} since midnight">▼${-m.delta}</span>`;
  return '<span class="mv same" title="unchanged since midnight">–</span>';
}

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
        <div class="crown">★ CROWNED${wr ? ` · winning race ${esc(wr)}` : ""} ${moveHTML(w.move)}</div>
        <div class="name">${pName(w.name)}</div>
        <div class="who ${w.race || ""}">${raceTag(w.race)}<span style="color:var(--dim);font-weight:600">${warsSub}</span></div>
      </div>
      <div class="score"><b>${fmt(w.score)}</b><span>SCORE</span></div>
    </div>
    <div class="label">Score breakdown</div>
    <div class="tiles">${tiles.map(([t, n, p, c]) =>
      `<div class="tile"><div class="t" style="color:${c}">${t}</div><div class="n">${n}</div><div class="p">+${fmt(p)} pts</div></div>`).join("")}</div>
    <div class="bonus">★ hardship bonus +${fmt(w.hardship_bonus)} pts</div>
    <div class="label" style="margin-bottom:8px">Runners-up${s.move_since
      ? ' <span class="dim" style="font-weight:400;text-transform:none">— ▲▼ change since midnight</span>' : ""}</div>
    <table><thead><tr><th></th><th></th><th>Player</th><th>Race</th><th class="num">Wars fought</th><th class="num">Score</th></tr></thead>
      <tbody>${s.runners.map((r, i) =>
        `<tr><td class="rank">${i + 2}</td><td class="mvc">${moveHTML(r.move)}</td>
         <td>${pName(r.name)}</td><td>${raceTag(r.race)}</td>
         <td class="num">${r.wars_fought}</td><td class="num score">${fmt(r.score)}</td></tr>`).join("")
      || '<tr><td colspan="6" class="loading">No other ranked players.</td></tr>'}</tbody></table>`;
}

// ---------- Leaderboards ----------
let BOARDS = null;
function board(title, rows, valLabel) {
  const t = el("div", "panel");
  t.appendChild(el("p", "card-title", esc(title)));
  const tbl = el("table");
  tbl.innerHTML = `<thead><tr><th></th><th>Player</th><th>Race</th><th class="num">${esc(valLabel)}</th></tr></thead>
    <tbody>${rows.map((r, i) =>
      `<tr><td class="rank">${i + 1}</td><td>${pName(r.player)}</td><td>${raceTag(r.race)}</td><td class="num">${r.c}</td></tr>`).join("")
    || '<tr><td colspan="4" class="loading">No data.</td></tr>'}</tbody>`;
  t.appendChild(tbl);
  return t;
}
function renderBoards() {
  // fall back to any available window key (keeps boards working across a data-format change)
  const b = BOARDS[$("#boardWin").value] || BOARDS[Object.keys(BOARDS)[0]] || {}, box = $("#boardsBody");
  box.innerHTML = "";
  box.appendChild(board("Top killers", b.killers || [], "Kills"));
  box.appendChild(board("Top chip bearers", b.bearers || [], "Held"));
  box.appendChild(board("Most deaths", b.deaths || [], "Deaths"));
}
async function initBoards() {
  BOARDS = await getJSON("data/leaderboards.json");
  $("#boardWin").addEventListener("change", renderBoards);
  renderBoards();
}

// ---------- Achievements catalogue ----------
function initAchv() {
  const box = $("#achvBody"), cat = ACH.catalogue || [], top = ACH.top || {};
  if (!cat.length) {
    box.innerHTML = '<div class="loading">No achievement data published yet.</div>';
    return;
  }
  const tierCount = cat.reduce((n, a) => n + a.tiers.length, 0);
  $("#achvMeta").innerHTML = `${cat.length} achievements · ${tierCount} tiers ·
    hover a tier to see how many players have reached it`;

  const groups = {};
  cat.forEach(a => (groups[a.group] = groups[a.group] || []).push(a));
  box.innerHTML = Object.entries(groups).map(([g, list]) => `
    <div class="label" style="margin:14px 0 8px">${esc(g)}</div>
    <div class="acards">${list.map(a => {
      const rows = top[a.id] || [];
      return `<div class="acard">
        <div class="ahead">
          <div class="atitle">${esc(a.tiers[a.tiers.length - 1].name)}</div>
          <div class="dim small">${esc(a.desc)}</div>
        </div>
        <div class="tiers">${a.tiers.map((t, i) => {
          const rar = ACH.rarity[`${a.id}:${i + 1}`] || 0;
          return `<span class="tchip ${TIER_CLASS[i + 1] || "t1"}"
            title="${esc(t.name)} — reach ${fmtVal(t.at, a.fmt)} · earned by ${rar} player${rar === 1 ? "" : "s"}">
            ${esc(t.name)} <b>${fmtVal(t.at, a.fmt)}</b> <i>${rar}</i></span>`;
        }).join("")}</div>
        <ol class="atop">${rows.length ? rows.map((r, i) => `
          <li><span class="ar">${i + 1}</span>${pName(r.name)}
              <span class="av">${fmtVal(r.value, a.fmt)}</span></li>`).join("")
          : '<li class="dim">Nobody yet.</li>'}</ol>
      </div>`;
    }).join("")}</div>`).join("");
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
  try { PLAYERS = await getJSON("data/players/index.json"); } catch (e) { PLAYERS = {}; }
  try { ACH = await getJSON("data/achievements.json"); } catch (e) { /* badges just lose rarity */ }
  try {
    const si = await getJSON("data/players/search.json");
    SEARCH = si.players || [];
    if (si.detail_rule) DETAIL_RULE = si.detail_rule;
    SEARCH.forEach(r => { SMAP[r[0].toLowerCase()] = r; });
    initSearch();
  } catch (e) {
    $("#psearch").placeholder = "Player search unavailable";
    $("#psearch").disabled = true;
  }
  initPotm().catch(e => $("#potmBody").innerHTML = `<div class="loading">Error: ${esc(e.message)}</div>`);
  initBoards().catch(e => $("#boardsBody").innerHTML = `<div class="loading">Error: ${esc(e.message)}</div>`);
  // Trends (charts) init lazily on first tab open — see showTab().
})();
