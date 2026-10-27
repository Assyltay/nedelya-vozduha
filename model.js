// «Неделя воздуха»: the rules of the game.
// The OUTDOOR PM2.5 of each day is real (data.js, from Akhmet's paper: the daily mean over all airkaz sensors).
// Everything in RULES below is a GAME ASSUMPTION, not a measurement and not from the paper.
// It is written here in one place so Akhmet can explain it and change it.
(function (root) {
  var RULES = {
    who: 15,               // WHO 2021 24-hour PM2.5 guideline, µg/m³ (this one IS from the paper)
    // share of the outdoor PM2.5 that reaches you in each place (assumption)
    street: 1.0,           // on the street, at a bus stop, in the bus
    mask: 0.7,             // a mask stops about a third of it (assumption; depends on the mask and the fit)
    homeOpen: 1.0,         // home, window open all day: the same air as outside
    homeAiring: 0.7,       // home, window opened only to air the room in the morning and evening
    homeClosed: 0.5,       // home, window closed: about half still comes in
    school: 0.7,           // school: you do not choose its windows
    mall: 0.5,             // Мега / комп-клуб: a big closed building
    runBreath: 3,          // on a run you take in about 3 times more air, so 1 hour counts as 3
    // points
    dayPenalty: 2,         // every µg/m³ of your 24-hour average above 15 costs 2 points
    streetStep: 4,         // every hour outside costs 1 point per 4 µg/m³ above 15 in the air you take in there
    fun: {                 // what the day gives you (points of "жизнь")
      home: 0, walk: 10, run: 15,               // school days, after school
      wkHome: 0, mall: 15, outside: 20,         // weekends and holidays
      open: 8, airing: 4, closed: 0,            // window: fresh air and comfort
      mask: -3                                  // the mask is uncomfortable
    }
  };

  // Akhmet's real week, from his message of 15 Aug 2026:
  // out at 8:00, 15 min walk each way; school to 17:30; Tue/Thu club until 18:10;
  // Fri on duty until 17:50; Sat with friends at a computer club or Мега by bus; Sun outside.
  var WEEK = [
    { name: "Понедельник", short: "Пн", kind: "school", school: 9.25, note: "Уроки до 17:30, домой пешком 15 минут" },
    { name: "Вторник", short: "Вт", kind: "school", school: 9.92, note: "Уроки и кружок до 18:10, домой пешком 15 минут" },
    { name: "Среда", short: "Ср", kind: "school", school: 9.25, note: "Уроки до 17:30, домой пешком 15 минут" },
    { name: "Четверг", short: "Чт", kind: "school", school: 9.92, note: "Уроки и кружок до 18:10, домой пешком 15 минут" },
    { name: "Пятница", short: "Пт", kind: "school", school: 9.58, note: "Дежурство до 17:50, домой пешком 15 минут" },
    { name: "Суббота", short: "Сб", kind: "free", note: "Выходной, друзья зовут гулять" },
    { name: "Воскресенье", short: "Вс", kind: "free", note: "Выходной" }
  ];

  // School holidays, approximate: summer (June to August) and the New Year days (1 to 7 January).
  function isHoliday(d) {
    var m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return m >= 6 && m <= 8 || m === 1 && day <= 7;
  }
  // The day plan for day i (0 = Monday) of the week that starts on startIso.
  function dayAt(startIso, i) {
    var d = new Date(startIso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    var base = WEEK[i];
    if (base.kind === "school" && isHoliday(d)) {
      return { name: base.name, short: base.short, kind: "free", note: "Каникулы, школы нет" };
    }
    return base;
  }

  var ACTIVITY = {
    school: [
      { id: "home", label: "Сразу домой", sub: "после уроков" },
      { id: "walk", label: "Погулять (1 час)", sub: "на улице после уроков" },
      { id: "run", label: "Пробежка (1 час)", sub: "на улице, вдыхаешь в 3 раза больше воздуха" }
    ],
    free: [
      { id: "wkHome", label: "Весь день дома", sub: "" },
      { id: "mall", label: "Мега или комп-клуб", sub: "4 часа внутри, туда и обратно на автобусе" },
      { id: "outside", label: "Гулять на улице", sub: "4 часа с друзьями" }
    ]
  };
  var MASK = [{ id: "no", label: "Без маски" }, { id: "yes", label: "В маске" }];
  var WINDOW = [
    { id: "open", label: "Открыто весь день", sub: "как обычно" },
    { id: "airing", label: "Проветрить", sub: "утром и вечером" },
    { id: "closed", label: "Закрыто", sub: "" }
  ];

  // Hours spent in each place, for one day and one set of choices. Always sums to 24.
  function hours(day, ch) {
    var h = { street: 0, run: 0, school: 0, mall: 0, home: 0 };
    if (day.kind === "school") {
      h.street = 0.5;                    // 15 min to school + 15 min back
      h.school = day.school;
      if (ch.act === "walk") h.street += 1;
      if (ch.act === "run") h.run = 1;
    } else {
      if (ch.act === "mall") { h.street = 1; h.mall = 4; }   // bus and stops, there and back
      if (ch.act === "outside") h.street = 4;
    }
    h.home = 24 - h.street - h.run - h.school - h.mall;
    return h;
  }

  // What you took in over the day, and the day's points.
  function scoreDay(day, ch, pm) {
    var R = RULES, h = hours(day, ch);
    var m = ch.mask === "yes" ? R.mask : 1;
    var home = ch.win === "open" ? R.homeOpen : ch.win === "airing" ? R.homeAiring : R.homeClosed;
    var streetH = h.street + h.run * R.runBreath;                  // hours of street air, run counted x3
    var parts = { home: h.home * home, school: h.school * R.school + h.mall * R.mall, street: streetH * R.street * m };
    var breathed = (parts.home + parts.school + parts.street) * pm / 24;   // 24-hour average, µg/m³
    var fun = R.fun[ch.act] + R.fun[ch.win] + (ch.mask === "yes" ? R.fun.mask : 0);
    var dayPen = R.dayPenalty * Math.max(0, breathed - R.who);
    var streetPen = streetH * Math.max(0, pm * R.street * m - R.who) / R.streetStep;
    return {
      breathed: breathed, fun: fun, dayPen: dayPen, streetPen: streetPen,
      score: fun - dayPen - streetPen, low: breathed <= R.who,
      parts: { home: parts.home * pm, school: parts.school * pm, street: parts.street * pm }
    };
  }

  function allChoices(day) {
    var out = [];
    ACTIVITY[day.kind].forEach(function (a) {
      MASK.forEach(function (k) {
        WINDOW.forEach(function (w) { out.push({ act: a.id, mask: k.id, win: w.id }); });
      });
    });
    return out;
  }

  // Best and worst possible plan for a day, and the lowest possible intake.
  // Days are independent, so the best week = the best plan of each day.
  function extremes(day, pm) {
    var best = null, worst = null, least = null;
    allChoices(day).forEach(function (c) {
      var s = scoreDay(day, c, pm);
      if (!best || s.score > best.s.score) best = { c: c, s: s };
      if (!worst || s.score < worst.s.score) worst = { c: c, s: s };
      if (!least || s.breathed < least.s.breathed) least = { c: c, s: s };
    });
    return { best: best, worst: worst, least: least };
  }

  function weekBest(w) {
    var t = 0;
    for (var i = 0; i < 7; i++) t += extremes(dayAt(w.start, i), w.pm[i]).best.s.score;
    return t;
  }

  root.AirModel = { RULES: RULES, WEEK: WEEK, ACTIVITY: ACTIVITY, MASK: MASK, WINDOW: WINDOW, dayAt: dayAt,
                    hours: hours, scoreDay: scoreDay, extremes: extremes, allChoices: allChoices, weekBest: weekBest };
  if (typeof module !== "undefined") module.exports = root.AirModel;
})(typeof window !== "undefined" ? window : globalThis);
