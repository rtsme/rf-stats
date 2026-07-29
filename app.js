"use strict";
// RF Activity dashboard — fetches the static JSON published by webexport.py and renders it.
const RACES = ["Accretia", "Bellato", "Cora"];
const RACE_COL = { Accretia: "#d26050", Bellato: "#5b8dd9", Cora: "#8fc24a" };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
const getJSON = u => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });

let PLAYERS = {};  // name(lower) -> slug, for players that have a detail page
let SMAP = {};     // name(lower) -> summary row, for EVERY player ever seen (search index)
let SEARCH = [];   // the same rows, for scanning
let DETAIL_RULE = { min_kills: 100, active_days: 90 };   // replaced by the published values
let AKA = { groups: [], of: {} };   // approved alt-character links (display only)

// other characters known to be the same player
function akaFor(name) {
  const gi = AKA.of[String(name || "").toLowerCase()];
  if (gi == null) return [];
  return (AKA.groups[gi] || []).filter(n => n.toLowerCase() !== String(name).toLowerCase());
}
// "Also known as" block + the button explaining how to submit a link
const akaCombined = name => (AKA.combined || [])[AKA.of[String(name || "").toLowerCase()]] || null;

function akaHTML(name, combined) {
  const others = akaFor(name);
  const canCombine = !!akaCombined(name);
  return `<div class="aka">
      <span class="label" style="display:inline">Also known as</span>
      ${others.length
        ? `<span class="aka-names">${others.map(pName).join("")}</span>`
        : '<span class="dim">— none recorded</span>'}
      ${canCombine ? `<button class="aka-combine${combined ? " on" : ""}" data-combine="${esc(name)}">${
        combined ? "Show this character" : "Show combined"}</button>` : ""}
      <button class="aka-btn" data-aka="${esc(name)}">+ Link characters</button>
    </div>`;
}

// the whole person: every linked character merged (see db.combined_stats)
function renderCombined(card, name) {
  const c = akaCombined(name);
  if (!c) return;
  const list = (arr, key) => (arr && arr.length)
    ? arr.map(x => `<li>${pName(x[key])}<span class="x">×${x.c}</span></li>`).join("")
    : '<li class="dim">—</li>';
  card.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <div class="phead">
      <div class="pname-big">${esc(c.names.join(" + "))}</div>
      <div class="dim">Combined across ${c.names.length} linked characters</div>
    </div>
    <div class="pstats">
      ${pstat("Kills", c.kills.toLocaleString())}${pstat("Deaths", c.deaths.toLocaleString())}
      ${kdStat(c.kd, c.kd_notrap)}${pstat("Chip wars", c.wars.toLocaleString())}
      ${c.chip_bearer_count ? pstat("Chip bearer", "×" + c.chip_bearer_count) : ""}
      ${c.weapon ? pstat("Top weapon", c.weapon) : ""}
      ${c.avg_victim_level != null ? pstat("Avg victim lvl", c.avg_victim_level) : ""}
    </div>
    ${c.first_seen ? `<div class="dim small">First seen ${esc(c.first_seen)}</div>` : ""}
    ${akaHTML(name, true)}
    <div class="pcols">
      <div><div class="label">Most killed</div><ul class="plist">${list(c.top_victims, "victim")}</ul></div>
      <div><div class="label">Killed most by</div><ul class="plist">${list(c.nemeses, "killer")}</ul></div>
    </div>
    <div class="label">Recent PvP</div>
    <ul class="plist recent">${(c.recent || []).map(r =>
      `<li><code>${esc(r.event_time)}</code> ${esc(r.message)}</li>`).join("") || '<li class="dim">—</li>'}</ul>
    <div class="lite-note">Fights between these characters are left out, and a chip war both
      fought in counts once. Leaderboards and achievements stay per character.</div>`;
}
function akaDialog(name) {
  const cmd = `/aka request character: ${name},OtherCharacter`;
  const card = $("#playerCard");
  card.insertAdjacentHTML("beforeend", `
    <div class="aka-help" id="akaHelp">
      <b>Link ${esc(name)} to another character</b>
      <p>Alt characters are linked by hand after a moderator checks them, so the request goes
         through the Discord bot. Run this on a Discord with BunnyBot, replacing
         <code>OtherCharacter</code> with your other character — add more separated by commas:</p>
      <code id="akaCmd">${esc(cmd)}</code>
      <button class="aka-copy" id="akaCopy">Copy command</button>
      <p class="dim">A moderator approves it, and the link then shows here. Linking is for display
         only — kills, K/D and achievements stay separate per character. Ask a moderator to run
         <code>/aka remove</code> if you want a link undone.</p>
    </div>`);
  $("#akaHelp").scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("#akaCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      $("#akaCopy").textContent = "Copied ✓";
    } catch (e) { $("#akaCopy").textContent = "Select the text above to copy"; }
  });
}
let ACH = { catalogue: [], rarity: {} };
const TIER_CLASS = ["", "t1", "t2", "t3", "t4"];   // bronze → gold by tier index
const fmtVal = (v, f) => f === "ratio" ? (Math.round(v * 100) / 100).toFixed(2) : Number(v).toLocaleString();

function raceTag(race) {
  if (!race) return '<span style="color:var(--dim)">—</span>';
  return `<span class="${race}"><span class="dot ${race}"></span>${esc(race)}</span>`;
}
// highest achievement tier a player holds — names are tinted by it (4 legendary, 3 gold)
function bestTier(name) {
  const row = SMAP[String(name || "").toLowerCase()];
  const badges = row && row[7];
  return badges && badges.length ? Math.max(...badges.map(b => b[1])) : 0;
}
const tierClassFor = name => ({ 4: " lgnd", 3: " gld" })[bestTier(name)] || "";

// a player name; clickable if we have a detail page OR a search-index summary for them
function pName(name) {
  const low = String(name || "").toLowerCase();
  const known = PLAYERS[low] || SMAP[low];
  return `<span class="pname${known ? " known" : ""}${tierClassFor(name)}"${
    known ? ` data-name="${esc(name)}"` : ""}>${esc(name)}</span>`;
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
        <span class="pr-name${tierClassFor(r[0])}">${esc(r[0])}</span>
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
  const [name, race, kills, deaths, kd, wars, bearer, badges, kdnt] = r;
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
      ${kdStat(kd, kdnt)}${pstat("Chip wars", wars.toLocaleString())}
      ${bearer ? pstat("Chip bearer", "×" + bearer) : ""}
    </div>
    ${akaHTML(name)}
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
const pstat = (label, val, sub) => `<div class="pstat"><b>${esc(val)}</b><span>${esc(label)}</span>${
  sub ? `<em>${esc(sub)}</em>` : ""}</div>`;
// K/D tile: the badge is judged on the trap-free figure, so show it when it differs
const kdStat = (kd, kdnt) => pstat("K/D", fmtVal(kd),
  (kdnt != null && kdnt !== kd) ? `${fmtVal(kdnt)} excl. traps` : null);

// earned badge: tier colour, value, rarity, and the next tier to chase
function badgeHTML(b) {
  const rar = ACH.rarity[`${b.id}:${b.tier}`];
  const pips = Array.from({ length: b.tiers }, (_, i) =>
    `<i class="${i < b.tier ? "on" : ""}"></i>`).join("");
  const bits = [esc(b.desc) + ": " + fmtVal(b.value, b.fmt)];
  if (rar) bits.push(`earned by ${rar} player${rar === 1 ? "" : "s"}`);
  if (b.next_at) bits.push(`next tier at ${fmtVal(b.next_at, b.fmt)}`);
  return `<div class="badge ${TIER_CLASS[b.tier] || "t1"}" data-ach="${esc(b.id)}"
      title="${esc(bits.join(" · "))} — click to see the leaderboard">
      <div class="bname">${icon(b.id)}${esc(b.name)}</div>
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
      <div class="pname-big">${raceTag(p.race)} <span class="${tierClassFor(p.name).trim()}">${esc(p.name)}</span></div>
      ${tags ? `<div class="dim">${esc(tags)}</div>` : ""}
    </div>
    <div class="pstats">
      ${pstat("Kills", p.kills)}${pstat("Deaths", p.deaths)}${kdStat(p.kd, p.kd_notrap)}
      ${p.chip_bearer_count ? pstat("Chip bearer", "×" + p.chip_bearer_count) : ""}
      ${p.weapon ? pstat("Top weapon", p.weapon) : ""}
      ${p.avg_victim_level != null ? pstat("Avg victim lvl", p.avg_victim_level) : ""}
    </div>
    ${p.first_seen ? `<div class="dim small">First seen ${esc(p.first_seen)}</div>` : ""}
    ${akaHTML(p.name)}
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
  const more = e.target.closest(".amore");          // expand / collapse a leaderboard
  if (more) {
    const card = more.closest(".acard"), id = card.dataset.ach;
    const a = (ACH.catalogue || []).find(x => x.id === id);
    card.outerHTML = achCardHTML(a, ACH.top || {}, !card.dataset.open);
    return;
  }
  const jump = e.target.closest(".badge[data-ach]");  // badge -> its catalogue entry
  if (jump) return gotoAchievement(jump.dataset.ach);
  const cb = e.target.closest(".aka-combine");
  if (cb) {
    const card = $("#playerCard");
    return cb.classList.contains("on") ? openPlayer(cb.dataset.combine)
                                       : renderCombined(card, cb.dataset.combine);
  }
  const ab = e.target.closest(".aka-btn");
  if (ab) { if (!$("#akaHelp")) akaDialog(ab.dataset.aka); return; }
  const pn = e.target.closest(".pname.known");
  if (pn) return openPlayer(pn.dataset.name);
  if (e.target.closest(".modal-close") || e.target.classList.contains("modal-bg")) closePlayer();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closePlayer(); });

// ---------- tabs (charts built lazily so their canvas is visible when sized) ----------
// The replay is a self-contained page in cw/ rather than part of this one — it owns the
// whole viewport and its own animation loop, and keeping it separate means it can't collide
// with anything here. Loaded only when the tab is opened; it pulls ~850KB of map and events.
async function initCw() {
  const f = $("#cwFrame");
  if (f && !f.src) f.src = "cw/";
}
const TAB_INIT = { trends: initTrends, achv: async () => initAchv(), cw: initCw };
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

// ---------- the /monthly report, rendered for the site ----------
function monthlyHTML(mo, inProgress) {
  if (!mo) return "";
  const races = ["Accretia", "Bellato", "Cora"];
  const nameRace = t => t ? `${pName(t[0])}<span class="mv-c">×${t[1].toLocaleString()}</span>` : '<span class="dim">—</span>';
  const awards = [
    ["★ Top killer", mo.top_killer, "total kills"],
    ["⚔ Friendly fire", mo.friendly_fire, "same-race kills"],
    ["● Lowbie killer", mo.lowbie_killer, "kills of lvl ≤ 50"],
    ["◎ Trap magnet", mo.trap_magnet, "deaths to traps"],
  ];
  return `
    <div class="label mhead">Monthly report${inProgress
      ? ' <span class="dim" style="font-weight:400;text-transform:none">— month still running</span>' : ""}</div>
    <div class="panel mpanel">
      <div class="mtop">
        <div><span class="label">Winning race</span><span class="dim"> · chip-war wins</span></div>
        <div class="mkills">${(mo.total_kills || 0).toLocaleString()}<span>kills this month</span></div>
      </div>
      <div class="mraces">${races.map(r => {
        const win = r === mo.winning_race;
        return `<div class="mrace ${r}${win ? " win" : ""}">
          ${win ? '<div class="mwin">★ WINNER</div>' : ""}
          <div class="mrname">${raceTag(r)}</div>
          <div class="mrn">${mo.race_wins[r] || 0}</div>
          <ol class="mbear">${(mo.top_bearers[r] || []).map(([n, c]) =>
            `<li>${pName(n)}<span class="x">×${c}</span></li>`).join("")
            || '<li class="dim">—</li>'}</ol>
        </div>`;
      }).join("")}</div>
      <div class="label" style="margin:14px 0 8px">Awards</div>
      <div class="mawards">${awards.map(([title, list, sub]) => `
        <div class="maward">
          <div class="mat">${esc(title)}</div>
          <div class="maw">${nameRace((list || [])[0])}</div>
          <div class="masub">${esc(sub)}</div>
          ${(list || [])[1] ? `<div class="marun">runner-up ${nameRace(list[1])}</div>` : ""}
        </div>`).join("")}</div>
    </div>`;
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
    <div class="label mhead first">Player of the Month</div>
    <div class="panel mpanel">
    <div class="spotlight">
      <div>
        <div class="crown">${s.in_progress ? "◆ CURRENT LEADER" : "★ CROWNED"}${
          wr ? ` · winning race ${esc(wr)}` : ""} ${moveHTML(w.move)}</div>
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
      || '<tr><td colspan="6" class="loading">No other ranked players.</td></tr>'}</tbody></table>
    </div>
    ${monthlyHTML(s.monthly, s.in_progress)}`;
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

// ---------- achievement icons ----------
// Inline SVG rather than emoji or an icon font: they inherit the tier colour via
// currentColor, stay crisp at any size, and add nothing to the page's downloads.
const ICONS = {
  kills: '<path d="M12 3c-4.4 0-8 3.1-8 7 0 2.4 1.3 4.5 3.3 5.7V19a2 2 0 002 2h5.4a2 2 0 002-2v-3.3C18.7 14.5 20 12.4 20 10c0-3.9-3.6-7-8-7z"/><circle cx="9.2" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10" r="1.4" fill="currentColor" stroke="none"/>',
  streak: '<path d="M13 2L5 14h6l-2 8 8-12h-6z"/>',
  kd: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  giant: '<path d="M6 15.5l6-6 6 6M6 9.5l6-6 6 6"/>',
  nemesis: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
  deaths: '<path d="M6.5 21V10.5a5.5 5.5 0 1111 0V21z"/><path d="M4 21h16M12 9.5v5M9.5 12h5"/>',
  trapdeaths: '<path d="M4 9a8 8 0 0016 0"/><path d="M6.5 10l1 3M10 11.6l.6 3M14 11.6l-.6 3M17.5 10l-1 3"/>',
  bearer: '<rect x="7.5" y="7.5" width="9" height="9" rx="1.4"/><path d="M10 3.5v4M14 3.5v4M10 16.5v4M14 16.5v4M3.5 10h4M3.5 14h4M16.5 10h4M16.5 14h4"/>',
  wars: '<path d="M12 3l8 3v6c0 4.4-3.2 8.3-8 9.5C7.2 20.3 4 16.4 4 12V6z"/>',
  firstblood: '<path d="M12 3s6 6.5 6 10.5A6 6 0 0112 20a6 6 0 01-6-6.5C6 9.5 12 3 12 3z"/>',
  lostwar: '<path d="M5.5 21V3.5M5.5 5h11l-2 3 2 3h-11"/>',
  nuke: '<path d="M4 11a8 4.5 0 0116 0z"/><path d="M9 11.5v3.5c0 1.8 1.2 2.8 3 2.8s3-1 3-2.8V11.5"/><path d="M7.5 20.5h9"/>',
  crowned: '<path d="M4 8.5l3 9h10l3-9-5 3-3-5.5-3 5.5z"/>',
  mvp: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21.5l5-2.5 5 2.5-1.5-8"/>',
  w_staff: '<path d="M6.5 21L17 5.5"/><circle cx="18.2" cy="4" r="2.4"/>',
  w_bow: '<path d="M6.5 3.5a13 13 0 010 17"/><path d="M6.5 12h12.5M15 8.2l4 3.8-4 3.8"/>',
  w_launcher: '<rect x="3" y="9" width="13.5" height="6" rx="2"/><path d="M16.5 12h4.5M6.5 15v3.5"/>',
  w_firearm: '<path d="M3 8.5h13v5h-3l-2 4H8l1-4H3z"/>',
  w_mau: '<rect x="5" y="7.5" width="14" height="9.5" rx="2"/><path d="M9 12.5h6M12 3.5v4"/>',
  w_spear: '<path d="M4 20L19.5 4.5"/><path d="M20 4l-1.2 5.2-4-4z"/>',
  w_throw: '<path d="M12 2.5l2.8 6.7 6.7 2.8-6.7 2.8-2.8 6.7-2.8-6.7L2.5 12l6.7-2.8z"/>',
  w_trap: '<path d="M4 9a8 8 0 0016 0"/><path d="M6.5 10l1 3M10 11.6l.6 3M14 11.6l-.6 3M17.5 10l-1 3"/>',
  w_sword: '<path d="M6 18L17.5 6.5"/><path d="M14 4h6v6"/><path d="M3.5 16.5l4 4"/>',
  w_axe: '<path d="M13.5 3a6.5 6.5 0 016.5 6.5l-6.5 2z"/><path d="M13 11.5L4 20.5"/>',
  w_mace: '<path d="M4 20.5l7-7"/><circle cx="16" cy="8" r="3.8"/><path d="M16 2.2v2M16 11.8v2M10.2 8h2M19.8 8h2"/>',
  w_knife: '<path d="M4.5 19.5l8.5-8.5"/><path d="M13 11l6.5-6.5 1 4.3-4.3 1z"/>',
  w_animus: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2"/>',
  w_tower: '<path d="M7 21V8l5-4 5 4v13z"/><path d="M7 8h10M10 21v-5h4v5"/>',
};
const icon = id => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
  ICONS[id] || '<circle cx="12" cy="12" r="7.5"/>'}</svg>`;

// ---------- Achievements catalogue ----------
const ACH_SHOWN = 10;                 // rows per card before "show all"
let achFilter = { q: "", group: "", sort: "default" };

function achCardHTML(a, top, expanded) {
  const rows = top[a.id] || [];
  const shown = expanded ? rows : rows.slice(0, ACH_SHOWN);
  const held = ACH.rarity[`${a.id}:1`] || 0;
  return `<div class="acard" data-ach="${esc(a.id)}"${expanded ? ' data-open="1"' : ""}>
    <div class="ahead">
      <span class="aicon ${TIER_CLASS[4]}">${icon(a.id)}</span>
      <div>
        <div class="atitle">${esc(a.tiers[a.tiers.length - 1].name)}</div>
        <div class="dim small">${esc(a.desc)}</div>
      </div>
    </div>
    <div class="tiers">${a.tiers.map((t, i) => {
      const rar = ACH.rarity[`${a.id}:${i + 1}`] || 0;
      const pct = held ? Math.max(3, Math.round(100 * rar / held)) : 0;
      return `<span class="tchip ${TIER_CLASS[i + 1] || "t1"}"
        title="${esc(t.name)} — reach ${fmtVal(t.at, a.fmt)} · earned by ${rar} player${rar === 1 ? "" : "s"}">
        <span class="tn">${esc(t.short || t.name)}</span><b>${fmtVal(t.at, a.fmt)}</b><i>${rar}</i>
        <span class="tbar" style="width:${pct}%"></span></span>`;
    }).join("")}</div>
    <ol class="atop">${shown.length ? shown.map((r, i) => `
      <li><span class="ar">${i + 1}</span>${pName(r.name)}
          <span class="av">${fmtVal(r.value, a.fmt)}</span></li>`).join("")
      : '<li class="dim">Nobody yet.</li>'}</ol>
    ${rows.length > ACH_SHOWN
      ? `<button class="amore">${expanded ? "Show less" : `Show all ${rows.length}`}</button>` : ""}
  </div>`;
}

function renderAchCards() {
  const cat = ACH.catalogue || [], top = ACH.top || {};
  const q = achFilter.q.toLowerCase();
  let list = cat.filter(a => {
    if (achFilter.group && a.group !== achFilter.group) return false;
    if (!q) return true;
    return (a.desc + " " + a.tiers.map(t => t.name).join(" ")).toLowerCase().includes(q);
  });
  const rarity = a => ACH.rarity[`${a.id}:4`] || 0;
  if (achFilter.sort === "rare") list = [...list].sort((x, y) => rarity(x) - rarity(y));
  if (achFilter.sort === "common") list = [...list].sort((x, y) =>
    (ACH.rarity[`${y.id}:1`] || 0) - (ACH.rarity[`${x.id}:1`] || 0));

  const box = $("#achvCards");
  if (!list.length) { box.innerHTML = '<div class="loading">Nothing matches that.</div>'; return; }
  if (achFilter.sort === "default") {
    const groups = {};
    list.forEach(a => (groups[a.group] = groups[a.group] || []).push(a));
    box.innerHTML = Object.entries(groups).map(([g, items]) => `
      <div class="label ghead">${esc(g)}</div>
      <div class="acards">${items.map(a => achCardHTML(a, top, false)).join("")}</div>`).join("");
  } else {
    box.innerHTML = `<div class="acards">${list.map(a => achCardHTML(a, top, false)).join("")}</div>`;
  }
}

function initAchv() {
  const box = $("#achvBody"), cat = ACH.catalogue || [], top = ACH.top || {};
  if (!cat.length) {
    box.innerHTML = '<div class="loading">No achievement data published yet.</div>';
    return;
  }
  const tierCount = cat.reduce((n, a) => n + a.tiers.length, 0);
  $("#achvMeta").innerHTML = `${cat.length} achievements · ${tierCount} tiers ·
    hover a tier to see how many players have reached it`;

  // ── recently achieved ──
  const recent = ACH.recent || [];
  const recentHTML = recent.length ? `
    <div class="panel recents">
      <p class="card-title">Recently achieved <span class="label">— newest first</span></p>
      <ol class="rlist">${recent.map(r => `<li>
          <span class="rwhen">${esc(r.at.slice(0, 16))}</span>
          ${pName(r.player)}
          <span class="rbadge ${TIER_CLASS[r.tier] || "t1"}">${icon(r.id)}${esc(r.name)}</span>
          <span class="rgroup">${esc(r.group)}</span>
        </li>`).join("")}</ol>
    </div>` : "";

  const groupNames = [...new Set(cat.map(a => a.group))];
  box.innerHTML = recentHTML + `
    <div class="achbar">
      <input id="achq" type="search" placeholder="Filter achievements…" autocomplete="off">
      <div class="chips" id="achgroups">
        <button class="fchip on" data-g="">All</button>
        ${groupNames.map(g => `<button class="fchip" data-g="${esc(g)}">${esc(g)}</button>`).join("")}
      </div>
      <select id="achsort">
        <option value="default">Grouped</option>
        <option value="rare">Rarest first</option>
        <option value="common">Most earned</option>
      </select>
    </div>
    <div id="achvCards"></div>`;
  renderAchCards();

  $("#achq").addEventListener("input", e => { achFilter.q = e.target.value; renderAchCards(); });
  $("#achsort").addEventListener("change", e => { achFilter.sort = e.target.value; renderAchCards(); });
  $("#achgroups").addEventListener("click", e => {
    const b = e.target.closest(".fchip");
    if (!b) return;
    achFilter.group = b.dataset.g;
    $$(".fchip").forEach(x => x.classList.toggle("on", x === b));
    renderAchCards();
  });
}

// jump from a badge on a player card to that achievement in the catalogue
function gotoAchievement(id) {
  closePlayer();
  achFilter = { q: "", group: "", sort: "default" };
  showTab("achv");
  setTimeout(() => {
    const el = document.querySelector(`.acard[data-ach="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  }, 60);
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
  if (pop.since) {
    const [y, m, d] = pop.since.slice(0, 10).split("-");
    $("#popSince").textContent = `This data is only available from ${d}-${m}-${y}`;
  }

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

  await initRichTrends();
}

// Maps and advanced classes — both come from the richer kill feed, which only started naming
// them partway through, so these say so instead of looking mysteriously empty.
const MAP_COL = ["#e0a83e", "#7fb2e5", "#c98ee0", "#8fc24a", "#e07f7f", "#5fc9b8"];

async function initRichTrends() {
  let t;
  try { t = await getJSON("data/trends.json"); } catch (e) { return; }

  if (t.since) {
    const [y, m, d] = t.since.slice(0, 10).split("-");
    $("#richSince").textContent = `Map and class data is only available from ${d}-${m}-${y}`;
  }
  $("#mapWin").textContent = `— last ${t.maps.days} days`;
  $("#classWin").textContent = `— last ${t.classes.days} days`;

  const totals = t.maps.totals || [];
  if (!totals.length) {
    $("#mapList").innerHTML = `<div class="dim small">No map data yet.</div>`;
  } else {
    const max = totals[0].kills;
    $("#mapList").innerHTML = totals.map(r => `
      <div class="maprow">
        <span class="mapname">${esc(r.map)}</span>
        <span class="mapbar"><i style="width:${(100 * r.kills / max).toFixed(1)}%"></i></span>
        <b>${r.kills.toLocaleString()}</b>
      </div>`).join("");
  }

  // stacked daily view of the busiest maps, so you can see a map heat up day to day
  const d = t.maps.daily || { maps: [], days: [] };
  if (d.days.length) {
    new Chart($("#mapChart"), {
      type: "bar",
      options: {
        ...CHART_BASE,
        scales: {
          x: { ...CHART_BASE.scales.x, stacked: true },
          y: { ...CHART_BASE.scales.y, stacked: true },
        },
      },
      data: {
        labels: d.days.map(r => r.date.slice(5)),
        datasets: d.maps.map((m, i) => ({
          label: m, data: d.days.map(r => r[m] || 0),
          backgroundColor: MAP_COL[i % MAP_COL.length],
        })),
      },
    });
  }

  const cls = t.classes.top || [];
  if (cls.length) {
    // Horizontal bars: the scales have to be declared here rather than spread from
    // CHART_BASE — its explicit x/y would override the axis swap and draw nothing.
    $("#classChart").parentElement.style.height = Math.max(240, 22 * cls.length) + "px";
    new Chart($("#classChart"), {
      type: "bar",
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: "#9a8a78", precision: 0 },
               grid: { color: "#2a231c" } },
          y: { ticks: { color: "#ede6da" }, grid: { display: false } },
        },
      },
      data: {
        labels: cls.map(r => r.class),
        datasets: [{
          label: "Players", data: cls.map(r => r.players),
          backgroundColor: "#e0a83e", borderRadius: 3,
        }],
      },
    });
  }
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
  try { AKA = await getJSON("data/aka.json"); } catch (e) { /* no links published yet */ }
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
