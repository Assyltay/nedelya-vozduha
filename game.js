// «Неделя воздуха»: screens and flow. Numbers come from data.js (his data) and model.js (game rules).
(function () {
  "use strict";
  var D = window.AIR_DATA, M = window.AirModel, F = D.facts, R = M.RULES;
  var app = document.getElementById("app");
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
                "сентября", "октября", "ноября", "декабря"];
  var SEASON_RU = { winter: "зимняя", spring: "весенняя", summer: "летняя", autumn: "осенняя" };
  var CLASS_SIZE = 16;
  var STORE = "air-week-game-v1";

  // round 0 = first week (a week that can be won), round 1 = winter week, round 2 = free play
  var state = { player: null, round: 0, start: null, plan: [], day: 0, done: [], screen: "start", q: 0 };

  // ---------- helpers ----------
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; }
  function show(html) { app.innerHTML = ""; app.appendChild(el(html)); window.scrollTo(0, 0); }
  function n1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); }
  function n0(x) { return String(Math.round(x)).replace("-", "−"); }
  function signed(x) { var r = Math.round(x); return (r > 0 ? "+" : "") + n0(r); }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    return b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  }
  function dateOf(iso, plus) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + (plus || 0)); return d; }
  function fmtDate(d, withYear) { return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + (withYear ? " " + d.getUTCFullYear() : ""); }
  function range(iso) {
    var a = dateOf(iso), b = dateOf(iso, 6);
    return a.getUTCMonth() === b.getUTCMonth()
      ? a.getUTCDate() + "-" + fmtDate(b, true)
      : "с " + fmtDate(a, a.getUTCFullYear() !== b.getUTCFullYear()) + " по " + fmtDate(b, true);
  }
  function color(pm) {
    return pm <= 15 ? "var(--c0)" : pm <= 25 ? "var(--c1)" : pm <= 37.5 ? "var(--c2)" :
           pm <= 50 ? "var(--c3)" : pm <= 75 ? "var(--c4)" : "var(--c5)";
  }
  function chip(pm) {
    return '<span class="chip' + (pm <= 37.5 ? " light" : "") + '" style="background:' + color(pm) + '">' + n1(pm) + "</span>";
  }
  // "в 1,4 раза выше нормы", "в 7 раз выше нормы", "чуть выше нормы", "в норме"
  function vsNorm(pm) {
    if (pm <= R.who) return "в норме";
    var k = Math.round(pm / R.who * 10) / 10;
    if (k < 1.1) return "чуть выше нормы";
    var whole = k === Math.round(k);
    var word = whole ? plural(k, "раз", "раза", "раз") : "раза";
    return "в " + n1(k).replace(",0", "") + " " + word + " выше нормы";
  }
  function bar(pm, max) {
    var w = Math.min(100, 100 * pm / max), who = 100 * R.who / max;
    return '<div class="bar"><i style="width:' + w + "%;background:" + color(pm) + '"></i><b style="left:' + who + '%"></b></div>';
  }
  function label(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label; return id; }
  function planText(day, c) {
    return label(M.ACTIVITY[day.kind], c.act) + ", " + label(M.MASK, c.mask).toLowerCase() +
           ", окно: " + label(M.WINDOW, c.win).toLowerCase();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function weekByStart(s) { for (var i = 0; i < D.weeks.length; i++) if (D.weeks[i].start === s) return D.weeks[i]; return null; }

  // ---------- saving progress (a reload or a back swipe must not lose the plan) ----------
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode: play without saving */ } }
  function load() { try { var s = JSON.parse(sessionStorage.getItem(STORE) || "null"); return s && s.screen && weekByStart(s.start) ? s : null; } catch (e) { return null; } }
  function go(screen) {
    state.screen = screen; save();
    try { history.pushState({ s: screen }, ""); } catch (e) { /* ignore */ }
    render();
  }
  window.addEventListener("popstate", function () {
    // the phone's back gesture steps back inside the game instead of leaving the page
    if (state.screen === "plan" && state.day > 0) { state.day--; }
    else if (state.screen === "plan") { state.screen = "intro"; }
    else if (state.screen === "rules") { state.screen = state.back || "start"; }
    else if (state.screen === "play") { state.screen = "end"; }
    save();
    try { history.pushState({ s: state.screen }, ""); } catch (e) { /* ignore */ }
    render();
  });

  // ---------- which real week a player gets ----------
  var WINNABLE = D.weeks.filter(function (w) { return w.season !== "winter" && M.weekBest(w) > 0; });
  var WINTER = D.weeks.filter(function (w) { return w.season === "winter"; });
  var HARD_OTHER = D.weeks.filter(function (w) { return w.season !== "winter" && M.weekBest(w) <= 0; });
  function pickWeek(pool, player) {
    pool = pool.slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    if (player) return pool[Math.floor((player - 1) * pool.length / CLASS_SIZE) % pool.length];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function beginRound(week) {
    state.start = week.start; state.day = 0;
    state.plan = [0, 1, 2, 3, 4, 5, 6].map(function () { return { act: null, mask: null, win: null }; });
    go("intro");
  }

  // ---------- the results of one week ----------
  function computeRound(start, plan) {
    var w = weekByStart(start), list = [], total = 0, best = 0, worst = 0, least = 0, parts = { home: 0, school: 0, street: 0 };
    w.pm.forEach(function (pm, i) {
      var day = M.dayAt(start, i), s = M.scoreDay(day, plan[i], pm), e = M.extremes(day, pm);
      list.push({ day: day, pm: pm, s: s, e: e });
      total += s.score; best += e.best.s.score; worst += e.worst.s.score; least += e.least.s.breathed;
      parts.home += s.parts.home; parts.school += s.parts.school; parts.street += s.parts.street;
    });
    return { week: w, days: list, total: total, best: best, worst: worst, least: least / 7, parts: parts };
  }

  // ---------- screens ----------
  function render() {
    var s = state.screen;
    if (s === "intro") intro();
    else if (s === "plan") planDay();
    else if (s === "play") play();
    else if (s === "end") endScreen();
    else if (s === "questions") questions();
    else if (s === "finish") finish();
    else if (s === "rules") rules();
    else start();
  }

  function start() {
    var q = parseInt(new URLSearchParams(location.search).get("n"), 10);
    var saved = load();
    var resume = saved && saved.screen !== "start" && saved.screen !== "finish";
    show(
      '<p class="kicker">Алматы · настоящие данные 2017-2020</p>' +
      "<h1>Неделя воздуха</h1>" +
      "<p>Ты получаешь одну настоящую неделю из прошлого Алматы и проживаешь её за школьника: школа, кружок, выходные с друзьями.</p>" +
      (resume ? '<div class="card"><p style="margin:0">Есть начатая игра.</p><button class="btn" id="resume">Продолжить</button></div>' : "") +
      '<div class="card"><label for="pn" class="group-title">Твой номер в группе (от 1 до ' + CLASS_SIZE + ")</label>" +
      '<p class="small muted">По номеру у всех в группе будут разные недели. Можно оставить пустым.</p>' +
      '<input id="pn" class="num" type="number" inputmode="numeric" min="1" max="' + CLASS_SIZE + '" value="' + (q >= 1 && q <= CLASS_SIZE ? q : "") + '" placeholder="например, 7">' +
      '<button class="btn" id="go">' + (resume ? "Начать заново" : "Начать") + "</button></div>" +
      '<div class="card"><p><b>Как играть.</b> На каждый день выбираешь три вещи: что делать после школы, надевать ли маску и что делать с окном дома.</p>' +
      "<p>Какой воздух был в тот день, ты не знаешь. Видишь только дату.</p>" +
      '<p style="margin:0">Потом неделя идёт по реальным замерам: видно, чем ты дышишь, и сколько очков набираешь.</p></div>' +
      '<button class="linkbtn" id="rules">Как считаются очки</button>' +
      '<p class="foot">Данные: ' + F.n_sensors + " датчиков airkaz.org, " + F.n_days + " дней, из исследования Ахмета Кабенова (CASJ, 2026).</p>"
    );
    if (resume) document.getElementById("resume").onclick = function () { state = saved; go(state.screen); };
    document.getElementById("go").onclick = function () {
      var v = parseInt(document.getElementById("pn").value, 10);
      state = { player: v >= 1 && v <= CLASS_SIZE ? v : null, round: 0, start: null, plan: [], day: 0, done: [], screen: "start", q: 0 };
      try { history.replaceState(null, "", state.player ? "?n=" + state.player : location.pathname); } catch (e) { /* ignore */ }
      beginRound(pickWeek(WINNABLE, state.player));
    };
    document.getElementById("rules").onclick = function () { state.back = "start"; go("rules"); };
  }

  function intro() {
    var w = weekByStart(state.start);
    var kick = state.round === 0 ? "Неделя 1 из 2" : state.round === 1 ? "Неделя 2 из 2 · зимняя" : "Ещё одна неделя";
    show(
      '<p class="kicker">' + kick + "</p>" +
      "<h2>" + range(w.start) + "</h2>" +
      (state.round === 1
        ? "<p>Теперь зима. Правила те же, неделя та же. Попробуй сыграть её как можно лучше.</p>"
        : "<p>Это настоящая неделя. На каждый день есть средний замер PM2.5 по всем датчикам города.</p>") +
      '<div class="card"><p class="small" style="margin:0"><b>PM2.5</b> это мелкая пыль и дым в воздухе, в микрограммах на кубометр (µg/m³). Норма ВОЗ: не больше <b>' + R.who + "</b> в среднем за сутки.</p></div>" +
      '<button class="btn" id="go">Планировать понедельник</button>'
    );
    document.getElementById("go").onclick = function () { state.day = 0; go("plan"); };
  }

  function optButtons(group, list, cur) {
    return '<div class="opts ' + (list.length === 2 ? "two" : "three") + '" role="group">' + list.map(function (o) {
      return '<button class="opt" data-g="' + group + '" data-v="' + o.id + '" aria-pressed="' + (cur === o.id) + '">' +
        esc(o.label) + (o.sub ? '<span class="sub">' + esc(o.sub) + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function planDay() {
    var i = state.day, w = weekByStart(state.start), day = M.dayAt(w.start, i), c = state.plan[i];
    var d = dateOf(w.start, i);
    var dots = [0, 1, 2, 3, 4, 5, 6].map(function (k) { return "<span" + (k <= i ? ' class="on"' : "") + "></span>"; }).join("");
    var prev = i > 0 ? state.plan[i - 1] : null;
    var canCopy = prev && prev.act && M.dayAt(w.start, i - 1).kind === day.kind;
    var ready = function () { return c.act && c.mask && c.win; };
    show(
      '<div class="dots" aria-label="День ' + (i + 1) + ' из 7">' + dots + "</div>" +
      '<p class="kicker">День ' + (i + 1) + " из 7 · " + d.getUTCFullYear() + " год</p><h2>" + day.name + ", " + fmtDate(d) + "</h2>" +
      '<p class="muted small">' + (day.kind === "school" ? "В 8:00 из дома, до школы пешком 15 минут. " : "") + esc(day.note) + ".</p>" +
      '<div class="group"><div class="group-title">' + (day.kind === "school" ? "После школы" : "План на день") + "</div>" +
      optButtons("act", M.ACTIVITY[day.kind], c.act) + "</div>" +
      '<div class="group"><div class="group-title">Маска на улице</div>' + optButtons("mask", M.MASK, c.mask) + "</div>" +
      '<div class="group"><div class="group-title">Окно дома</div>' + optButtons("win", M.WINDOW, c.win) + "</div>" +
      (canCopy ? '<button class="linkbtn" id="copy">Как вчера</button>' : "") +
      '<div class="btn-row">' + (i > 0 ? '<button class="btn secondary" id="back">Назад</button>' : "") +
      '<button class="btn" id="next" ' + (ready() ? "" : "disabled") + ">" + (i < 6 ? "Дальше" : "Посмотреть, как прошла неделя") + "</button></div>"
    );
    app.querySelectorAll(".opt").forEach(function (b) {
      b.onclick = function () {
        c[b.dataset.g] = b.dataset.v; save();
        app.querySelectorAll('.opt[data-g="' + b.dataset.g + '"]').forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        document.getElementById("next").disabled = !ready();
      };
    });
    if (canCopy) document.getElementById("copy").onclick = function () { c.act = prev.act; c.mask = prev.mask; c.win = prev.win; save(); planDay(); };
    if (i > 0) document.getElementById("back").onclick = function () { state.day--; go("plan"); };
    document.getElementById("next").onclick = function () {
      if (i < 6) { state.day++; go("plan"); }
      else { state.done[state.round] = { start: state.start, plan: state.plan }; go("play"); }
    };
  }

  function play() {
    var r = computeRound(state.start, state.plan), w = r.week;
    var max = Math.max(60, Math.max.apply(null, w.pm) * 1.05);
    show(
      '<p class="kicker">' + SEASON_RU[w.season] + " неделя · " + range(w.start) + "</p>" +
      "<h2>Как прошла твоя неделя</h2>" +
      '<p class="small muted">Цветное число: воздух на улице в этот день, в среднем по городу. Черта на полоске: норма ВОЗ ' + R.who + ".</p>" +
      '<div class="card" id="days"></div><div id="after"></div>'
    );
    var box = document.getElementById("days"), k = 0;
    function next() {
      if (k >= r.days.length) { done(); return; }
      var x = r.days[k];
      box.appendChild(el(
        '<div class="reveal-day fade-in"><div class="wd">' + x.day.short + "</div>" +
        "<div><div>На улице " + chip(x.pm) + ' <span class="small muted">' + vsNorm(x.pm) + "</span></div>" + bar(x.pm, max) +
        '<div class="small muted">Твой воздух за сутки: ' + n1(x.s.breathed) + " µg/m³</div></div>" +
        '<div class="pts ' + (x.s.score >= 0 ? "pos" : "neg") + '">' + signed(x.s.score) + "</div></div>"
      ));
      k++;
      setTimeout(next, 400);
    }
    function done() {
      document.getElementById("after").appendChild(el(
        '<div class="card fade-in"><div class="dayhead"><div>Твой счёт за неделю</div><div class="big ' + (r.total >= 0 ? "pos" : "neg") + '">' + signed(r.total) + "</div></div></div>" +
        '<button class="btn fade-in" id="go">Что произошло</button>'
      ));
      document.getElementById("go").onclick = function () { go("end"); };
    }
    next();
  }

  function endScreen() {
    var r = computeRound(state.start, state.plan), w = r.week, winter = w.season === "winter";
    var lowDays = r.days.filter(function (x) { return x.s.low; }).length;
    var maxLow = r.days.filter(function (x) { return x.e.least.s.low; }).length;
    var outsideOver = w.pm.filter(function (p) { return p > R.who; }).length;
    var sum = r.parts.home + r.parts.school + r.parts.street;
    var pHome = Math.round(100 * r.parts.home / sum), pSchool = Math.round(100 * r.parts.school / sum), pStreet = 100 - pHome - pSchool;
    var cleanest = Math.min.apply(null, w.pm), gap = Math.round(r.best - r.total);

    var verdict;
    if (r.best < 0) {
      verdict = '<div class="card punch"><p><b>Даже самый лучший план этой недели в минусе: ' + signed(r.best) + ".</b></p>" +
        "<p>Здесь нельзя выиграть, можно только проиграть меньше. Самый чистый день недели: " + chip(cleanest) + " в среднем по городу, и это всё равно выше нормы.</p>" +
        '<p style="margin:0">' + (winter ? "Почему так, разберём в трёх вопросах." :
          "Это не зима, а " + SEASON_RU[w.season] + " неделя, но воздух уже почти как зимой.") + "</p></div>";
    } else if (gap <= 0) {
      verdict = '<div class="card"><p style="margin:0"><b>Это и есть лучший план.</b> Больше очков на этой неделе набрать нельзя.</p></div>';
    } else {
      verdict = '<div class="card"><p style="margin:0">До лучшего плана не хватило <b>' + gap + "</b> " + plural(gap, "очка", "очков", "очков") + ". Лучший план по дням смотри ниже.</p></div>";
    }

    var rows = r.days.map(function (x) {
      return "<tr><td><b>" + x.day.short + "</b></td><td>" + chip(x.pm) + '</td><td class="small">' +
        esc(planText(x.day, x.e.best.c)) + '</td><td class="num">' + signed(x.e.best.s.score) + "</td></tr>";
    }).join("");
    var nextLabel = state.round === 0 ? "Теперь зимняя неделя" : state.round === 1 ? "Три вопроса" : "Итог";

    show(
      '<p class="kicker">Что произошло</p>' +
      "<h2>" + (winter ? "Зимняя неделя, " : "Неделя ") + range(w.start) + "</h2>" +
      '<div class="scores"><div class="card"><div class="lbl">Твой счёт</div><div class="val ' + (r.total >= 0 ? "pos" : "neg") + '">' + signed(r.total) + "</div></div>" +
      '<div class="card"><div class="lbl">Лучший план</div><div class="val">' + signed(r.best) + "</div></div>" +
      '<div class="card"><div class="lbl">Худший план</div><div class="val">' + signed(r.worst) + "</div></div></div>" +
      verdict +
      "<h3>Воздух этой недели</h3>" +
      '<div class="card"><p>На улице в среднем по городу ' + chip(w.mean) + ", " + vsNorm(w.mean) + " ВОЗ. Выше нормы " + outsideOver + " из 7 дней.</p>" +
      '<p style="margin:0">По правилам игры твой воздух за сутки был не выше 15: ' + lowDays + " из 7 дней. " +
      (maxLow === 0
        ? "Даже при самом осторожном плане не получилось бы ни одного такого дня: в среднем было бы " + n1(r.least) + " µg/m³."
        : "При самом осторожном плане таких дней было бы " + maxLow + " из 7.") + "</p>" +
      '<p class="small muted" style="margin:8px 0 0">По чистоте воздуха эта неделя на ' + w.rank_clean + " месте из " + F.n_weeks + " (1 = самая чистая).</p></div>" +
      "<h3>Откуда пришло то, чем ты дышишь</h3>" +
      '<div class="card"><div class="split"><div style="width:' + pHome + '%;background:var(--accent)"></div><div style="width:' + pSchool + '%;background:var(--c2)"></div><div style="width:' + pStreet + '%;background:var(--c4)"></div></div>' +
      '<div class="legend"><span><i style="background:var(--accent)"></i>Дома ' + pHome + '%</span><span><i style="background:var(--c2)"></i>Школа, ТРЦ ' + pSchool + '%</span><span><i style="background:var(--c4)"></i>Улица ' + pStreet + "%</span></div>" +
      '<p class="small muted" style="margin:8px 0 0">Дома проходит больше половины суток, поэтому окно влияет сильно. Улица короткая, но там воздух грязнее всего. Это следует из правил игры, а не из замеров.</p></div>' +
      "<h3>Лучший план этой недели</h3>" +
      '<div class="card"><table class="plan"><tr><th></th><th>Улица</th><th>План</th><th class="num">Очки</th></tr>' + rows + "</table></div>" +
      '<button class="btn" id="go">' + nextLabel + "</button>" +
      '<button class="linkbtn" id="rules">Как считаются очки</button>'
    );
    document.getElementById("go").onclick = function () {
      if (state.round === 0) { state.round = 1; beginRound(pickWeek(WINTER, state.player)); }
      else if (state.round === 1) { state.q = 0; go("questions"); }
      else go("finish");
    };
    document.getElementById("rules").onclick = function () { state.back = "end"; go("rules"); };
  }

  var QUESTIONS = [
    {
      q: "Как думаешь, когда в Алматы воздух хуже: зимой или летом?",
      opts: ["Зимой", "Летом", "Одинаково"], right: 0,
      a: function () {
        return "Зимой. В среднем по городу " + n1(F.winter_mean) + " µg/m³ зимой и " + n1(F.summer_mean) + " летом, в " + n1(F.ratio) +
          " раза хуже. Сам Ахмет до исследования ждал обратного: холодный воздух кажется свежим. Данные с ним не согласились.";
      }
    },
    {
      q: "Сколько зимних дней из " + F.winter_days + " было в норме ВОЗ (в среднем по городу не больше 15)?",
      opts: ["Примерно половина", "Около тридцати", "Ни одного"], right: 2,
      a: function () {
        return "Ни одного: выше нормы " + F.winter_over + " из " + F.winter_days + ". А в " + n1(F.winter_over75_pct) +
          "% зимних дней воздух был хуже даже самой мягкой планки ВОЗ, 75 µg/m³. Это замеры любительских датчиков airkaz, зимой они могут завышать, но то, что зима намного хуже лета, от этого не меняется.";
      }
    },
    {
      q: "До того как сравнили датчики, Ахмет предсказал: на перекрёстке Рыскулова и Момышулы воздух грязнее, чем на перекрёстке Толе би и Байзакова. Насколько он был прав?",
      opts: ["Почти каждый день", "Примерно в двух днях из трёх", "Как монетка, 50 на 50"], right: 1,
      a: function () {
        return "В двух днях из трёх: " + F.momysh_days + " из " + F.pair_days + " " + plural(F.pair_days, "дня", "дней", "дней") +
          ", когда работали оба датчика. Но разница маленькая, в среднем " + n1(F.momysh_mean_diff) + " µg/m³, и со временем она исчезала. " +
          "Зимой было наоборот: Момышулы грязнее только в " + n1(F.momysh_winter_pct) + "% зимних дней. Но зимние дни тут почти все из одной зимы 2017-2018, так что это пока гипотеза.";
      }
    }
  ];
  function questions() {
    var i = state.q || 0, Q = QUESTIONS[i];
    show(
      '<p class="kicker">Вопрос ' + (i + 1) + " из " + QUESTIONS.length + "</p>" +
      "<h2>" + esc(Q.q) + "</h2>" +
      '<div class="opts three">' + Q.opts.map(function (o, k) { return '<button class="opt qopt" data-k="' + k + '">' + esc(o) + "</button>"; }).join("") + "</div>" +
      '<div id="ans"></div>'
    );
    app.querySelectorAll(".qopt").forEach(function (b) {
      b.onclick = function () {
        var k = +b.dataset.k;
        app.querySelectorAll(".qopt").forEach(function (x) {
          x.disabled = true;
          if (+x.dataset.k === Q.right) x.classList.add("correct");
          else if (x === b) x.classList.add("wrong");
        });
        document.getElementById("ans").appendChild(el(
          '<div class="card answer fade-in"><p style="margin:0"><b>' + (k === Q.right ? "Верно." : "Не совсем.") + "</b> " + esc(Q.a()) + "</p></div>" +
          '<button class="btn fade-in" id="go">' + (i < QUESTIONS.length - 1 ? "Следующий вопрос" : "Итог") + "</button>"
        ));
        document.getElementById("go").onclick = function () {
          if (i < QUESTIONS.length - 1) { state.q = i + 1; go("questions"); } else go("finish");
        };
      };
    });
  }

  function finish() {
    var res = state.done.filter(Boolean).map(function (d) { return computeRound(d.start, d.plan); });
    var a = res[0], b = res[1];
    var line = a && b && a.best > 0 && b.best < 0
      ? "Первую неделю можно было выиграть. Зимнюю нельзя: в данных нет ни одного зимнего дня, когда воздух в среднем по городу был в норме ВОЗ. Это главный вывод исследования Ахмета."
      : "Зимой лучший план всё равно проигрывает: в данных нет ни одного зимнего дня, когда воздух в среднем по городу был в норме ВОЗ. Это главный вывод исследования Ахмета.";
    show(
      '<p class="kicker">Итог</p><h2>Твои недели в Алматы</h2>' +
      '<div class="card"><table class="plan"><tr><th>Неделя</th><th class="num">Твой счёт</th><th class="num">Лучший план</th></tr>' +
      res.map(function (r) {
        return "<tr><td>" + SEASON_RU[r.week.season] + ", " + range(r.week.start) + '</td><td class="num">' + signed(r.total) + '</td><td class="num">' + signed(r.best) + "</td></tr>";
      }).join("") + "</table></div>" +
      '<div class="card"><p>' + line + "</p>" +
      '<p style="margin:0">И не только зимой: ещё ' + HARD_OTHER.length + " из " + (D.weeks.length - WINTER.length) +
      " весенних, летних и осенних недель в игре тоже нельзя выиграть.</p></div>" +
      '<button class="btn" id="again">Сыграть другую неделю</button>' +
      '<button class="linkbtn" id="rules">Как считаются очки</button>' +
      '<p class="foot">Исследование: Кабенов А., «Seasonal PM2.5 in Almaty, Kazakhstan», CASJ, 2026, № 3(31). Данные PM2.5: airkaz.org (' + F.n_sensors + " датчиков, с " + fmtDate(dateOf(F.date_min), true) + " по " + fmtDate(dateOf(F.date_max), true) + ").</p>"
    );
    document.getElementById("again").onclick = function () { state.round = 2; state.done = []; beginRound(pickWeek(D.weeks, null)); };
    document.getElementById("rules").onclick = function () { state.back = "finish"; go("rules"); };
  }

  function rules() {
    var f = R.fun;
    show(
      '<p class="kicker">Правила</p><h2>Как считаются очки</h2>' +
      '<div class="card"><p><b>Настоящее:</b> воздух на улице. Это среднее за сутки по всем датчикам airkaz.org, которые работали в этот день, из исследования Ахмета. Неделя школьника взята из настоящей недели Ахмета.</p>' +
      '<p style="margin:0"><b>Придумано для игры:</b> всё, что ниже. Это не замеры, а простые правила, чтобы можно было играть.</p></div>' +
      "<h3>Сколько уличного воздуха доходит до тебя</h3>" +
      '<div class="card small"><p>Улица, остановка, автобус: 100%. В маске: ' + Math.round(R.mask * 100) + "%.</p>" +
      "<p>Дома с открытым окном: " + Math.round(R.homeOpen * 100) + "%. Если проветривать утром и вечером: " + Math.round(R.homeAiring * 100) + "%. С закрытым окном: " + Math.round(R.homeClosed * 100) + "%.</p>" +
      "<p>В школе: " + Math.round(R.school * 100) + "%. В Меге или комп-клубе: " + Math.round(R.mall * 100) + "%.</p>" +
      '<p style="margin:0">На пробежке вдыхаешь примерно в ' + R.runBreath + " раза больше воздуха, поэтому час бега считается как " + R.runBreath + " часа на улице.</p></div>" +
      "<h3>Очки за день</h3>" +
      '<div class="card small"><p>Плюс за то, что успеваешь: погулять ' + signed(f.walk) + ", пробежка " + signed(f.run) + ", Мега или комп-клуб " + signed(f.mall) + ", гулять в выходной " + signed(f.outside) + ", открытое окно " + signed(f.open) + ", проветрить " + signed(f.airing) + ", маска " + signed(f.mask) + " (неудобно).</p>" +
      "<p>Минус за воздух за сутки: каждый µg/m³ сверх нормы ВОЗ (" + R.who + ") в среднем за сутки стоит " + R.dayPenalty + " очка.</p>" +
      '<p style="margin:0">Минус за улицу: каждый час на улице стоит 1 очко за каждые ' + R.streetStep + " µg/m³ сверх 15 в том, что ты там вдыхаешь.</p></div>" +
      '<p class="small muted">Летом (июнь, июль, август) и с 1 по 7 января школы нет, эти дни идут как выходные. Даты каникул примерные.</p>' +
      '<button class="btn" id="back">Назад</button>'
    );
    document.getElementById("back").onclick = function () { go(state.back || "start"); };
  }

  try { history.replaceState({ s: "start" }, ""); } catch (e) { /* ignore */ }
  start();
})();
