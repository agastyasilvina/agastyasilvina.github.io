/* JLPT kanji course: toggles, speech, jump strip, and a small Anki-style review.
   Progress lives in this browser's localStorage under "jlpt.kanji." (the furigana,
   English and speed settings use the "jlpt." keys shared with the lesson pages). */
(function(){
  "use strict";
  var KJ = window.KJ || null;
  var P = "jlpt.kanji.", SH = "jlpt.";
  var root = document.documentElement;
  function get(k, d){ try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function put(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function getJSON(k, d){ try { var v = JSON.parse(get(k, "")); return v === null || v === undefined || v === "" ? d : v; } catch (e) { return d; } }
  function $(s, r){ return (r || document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- toggles: furigana, English, highlight ---------------- */
  $$("[data-toggle]").forEach(function(btn){
    var name = btn.getAttribute("data-toggle");
    var key = name === "hi" ? P + "hi" : SH + name;
    var on = get(key, "1") === "1";
    function paint(){ root.classList.toggle("no-" + name, !on); btn.setAttribute("aria-pressed", on ? "true" : "false"); }
    btn.addEventListener("click", function(){ on = !on; put(key, on ? "1" : "0"); paint(); });
    paint();
  });
  document.addEventListener("click", function(e){
    var en = e.target.closest && e.target.closest(".en");
    if (en && root.classList.contains("no-en")) en.classList.toggle("peek");
  });

  /* ---------------- speech ---------------- */
  var synth = window.speechSynthesis;
  var canSpeak = !!(synth && typeof window.SpeechSynthesisUtterance !== "undefined");
  var rateSel = document.getElementById("ja-rate");
  if (rateSel) {
    var r0 = get(SH + "rate", ""); if (r0) rateSel.value = r0;
    rateSel.addEventListener("change", function(){ put(SH + "rate", rateSel.value); });
  }
  function rate(){ return parseFloat(get(SH + "rate", "0.85")) || 0.85; }
  function jaVoice(){ return canSpeak ? ((synth.getVoices() || []).filter(function(v){ return /^ja/i.test(v.lang); })[0] || null) : null; }
  if (canSpeak && "onvoiceschanged" in synth) synth.onvoiceschanged = function(){
    var note = document.getElementById("ja-note"); if (note) note.hidden = !!jaVoice() || !(synth.getVoices() || []).length;
  };
  function plain(el){
    var c = el.cloneNode(true);
    $$("rt, rp, .say", c).forEach(function(x){ x.remove(); });
    return c.textContent.replace(/\s+/g, "");
  }
  var playing = null;   /* the story player, if running */
  function speak(text, btn, done){
    if (!canSpeak) { if (done) done(); return; }
    try { synth.cancel(); } catch (e) {}
    var u = new window.SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; var v = jaVoice(); if (v) u.voice = v; u.rate = rate();
    $$(".say.on").forEach(function(b){ b.classList.remove("on"); });
    if (btn) btn.classList.add("on");
    u.onend = u.onerror = function(){ if (btn) btn.classList.remove("on"); if (done) done(); };
    synth.speak(u);
  }
  if (!canSpeak) { $$(".say, .say-all, #ja-ctl").forEach(function(b){ b.hidden = true; }); }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest(".say");
    if (!b) return;
    if (playing) playing.stop();
    var src = b.getAttribute("data-say");
    if (!src) { var holder = b.closest(".ja") || b.parentElement; src = plain(holder); }
    speak(src, b);
  });
  window.addEventListener("pagehide", function(){ try { synth.cancel(); } catch (e) {} });

  /* play the whole story, line by line */
  $$(".say-all").forEach(function(btn){
    var LABEL = btn.textContent;
    var player = { on: false, stop: function(){
      player.on = false; playing = null; try { synth.cancel(); } catch (e) {}
      btn.classList.remove("on"); btn.textContent = LABEL;
      $$(".sl.now").forEach(function(x){ x.classList.remove("now"); });
    } };
    btn.addEventListener("click", function(){
      if (player.on) { player.stop(); return; }
      var lines = $$(".story .sl"), i = 0;
      player.on = true; playing = player; btn.classList.add("on"); btn.textContent = "■ Stop";
      (function next(){
        if (!player.on) return;
        if (i >= lines.length) { player.stop(); return; }
        var line = lines[i++];
        $$(".sl.now").forEach(function(x){ x.classList.remove("now"); });
        line.classList.add("now");
        if (line.scrollIntoView && line.getBoundingClientRect().top > window.innerHeight * .7) line.scrollIntoView({ block: "center", behavior: "smooth" });
        speak(plain(line.querySelector(".ja")), null, function(){ if (player.on) setTimeout(next, 350); });
      })();
    });
  });

  /* ---------------- jump strip + rail: show where you are ---------------- */
  (function(){
    var groups = [$$(".jump-in a[href^='#']"), $$(".rail a[href^='#']")];
    var targets = groups.map(function(links){ return links.map(function(a){ return document.getElementById(a.getAttribute("href").slice(1)); }); });
    if (!groups[0].length && !groups[1].length) return;
    var ticking = false;
    function mark(){
      ticking = false;
      groups.forEach(function(links, gi){
        var best = -1;
        targets[gi].forEach(function(el, i){ if (el && el.getBoundingClientRect().top <= 170) best = i; });
        links.forEach(function(a, i){ a.classList.toggle("active", i === best); });
        if (gi === 0 && best >= 0) {
          var strip = links[best].parentElement, a = links[best];
          if (strip.scrollTo) strip.scrollTo({ left: a.offsetLeft - (strip.clientWidth - a.offsetWidth) / 2 });
        }
      });
    }
    window.addEventListener("scroll", function(){ if (!ticking) { ticking = true; window.requestAnimationFrame(mark); } }, { passive: true });
    mark();
  })();

  if (!KJ) return;

  /* ================= the review scheduler ================= */
  var MIN = 6e4, DAY = 864e5;
  function dayNo(t){ var d = new Date(t || Date.now()); return Math.floor((d.getTime() - d.getTimezoneOffset() * MIN - 4 * 3600e3) / DAY); }  /* days roll over at 4 a.m. */
  var STEPS = [1, 10];   /* learning steps, minutes */

  var Store = {
    srs: function(){ return getJSON(P + "srs", {}) || {}; },
    saveSrs: function(s){ put(P + "srs", JSON.stringify(s)); },
    lessons: function(){ var l = getJSON(P + "lessons", []); return Array.isArray(l) ? l : []; },
    saveLessons: function(l){ put(P + "lessons", JSON.stringify(l)); },
    opts: function(){
      var o = getJSON(P + "opts", {}) || {};
      return { np: o.np === undefined ? 15 : o.np, k: o.k !== 0, s: o.s !== 0, p: o.p !== 0, auto: !!o.auto };
    },
    saveOpts: function(o){ put(P + "opts", JSON.stringify(o)); },
    newToday: function(){ var n = getJSON(P + "new", {}) || {}; return n.d === dayNo() ? (n.n || 0) : 0; },
    bumpNew: function(){ put(P + "new", JSON.stringify({ d: dayNo(), n: Store.newToday() + 1 })); }
  };

  /* st = [kind 0 learning | 1 review, due (ms for learning, day number for review), ivl days, ease, reps, lapses, step] */
  function schedule(st, g, now){
    now = now || Date.now();
    var today = dayNo(now);
    var s = st ? st.slice() : [0, now, 0, 2.5, 0, 0, 0];
    var kind = s[0], ivl = s[2], ease = s[3], lapses = s[5], step = s[6];
    if (kind === 0) {
      if (g === 1) { step = 0; s[1] = now + STEPS[0] * MIN; }
      else if (g === 2) { s[1] = now + (step === 0 ? 6 : STEPS[Math.min(step, STEPS.length - 1)]) * MIN; }
      else if (g === 3 && step + 1 < STEPS.length) { step++; s[1] = now + STEPS[step] * MIN; }
      else { kind = 1; ivl = g === 4 ? (lapses ? Math.max(2, ivl) : 4) : (lapses ? Math.max(1, ivl) : 1); s[1] = today + ivl; step = 0; }
    } else {
      if (g === 1) { lapses++; ease = Math.max(1.3, ease - .2); ivl = 1; kind = 0; step = 0; s[1] = now + STEPS[1] * MIN; }
      else {
        if (g === 2) { ivl = Math.max(ivl + 1, Math.round(ivl * 1.2)); ease = Math.max(1.3, ease - .15); }
        if (g === 3) { ivl = Math.max(ivl + 1, Math.round(ivl * ease)); }
        if (g === 4) { ivl = Math.max(ivl + 1, Math.round(ivl * ease * 1.3)); ease += .15; }
        s[1] = today + ivl;
      }
    }
    s[0] = kind; s[2] = ivl; s[3] = Math.round(ease * 100) / 100; s[4] = s[4] + 1; s[5] = lapses; s[6] = step;
    return s;
  }
  function label(st, g){
    var n = schedule(st, g), now = Date.now();
    if (n[0] === 0) { var m = Math.round((n[1] - now) / MIN); return m < 60 ? "<" + Math.max(1, m) + "m" : Math.round(m / 60) + "h"; }
    var d = n[1] - dayNo(now);
    return d < 30 ? d + "d" : d < 365 ? (Math.round(d / 3) / 10) + "mo" : (Math.round(d / 36.5) / 10) + "y";
  }

  /* ---------------- the cards ---------------- */
  var LES = {}; KJ.L.forEach(function(l){ LES[l.n] = l; });
  function cardsOf(n, o){
    var l = LES[n], out = [];
    Array.prototype.forEach.call(l.k, function(k){ if (o.k) out.push("k" + k); });
    Array.prototype.forEach.call(l.k, function(k){ if (o.s) out.push("s" + k); });
    if (o.p) (KJ.S[n] || []).forEach(function(_, i){ out.push("p" + n + "." + i); });
    return out;
  }
  function unlocked(id, srs){
    var t = id.charAt(0);
    if (t === "s") { var k = srs["k" + id.slice(1)]; return !!(k && k[0] === 1); }   /* sentence after its kanji graduates */
    if (t === "p") {                                                                  /* story lines after the lesson's kanji were all seen */
      var n = +id.slice(1).split(".")[0];
      return Array.prototype.every.call(LES[n].k, function(k){ return !!srs["k" + k]; });
    }
    return true;
  }
  function pool(){
    var o = Store.opts(), out = [];
    Store.lessons().slice().sort(function(a, b){ return a - b; }).forEach(function(n){ if (LES[n]) out = out.concat(cardsOf(n, o)); });
    return out;
  }
  function tally(){
    var srs = Store.srs(), now = Date.now(), today = dayNo(), o = Store.opts();
    var r = { due: 0, learn: 0, fresh: 0, newLeft: Math.max(0, o.np - Store.newToday()) };
    pool().forEach(function(id){
      var st = srs[id];
      if (!st) { if (unlocked(id, srs)) r.fresh++; }
      else if (st[0] === 0) { if (st[1] <= now + 20 * MIN) r.learn++; }
      else if (st[1] <= today) r.due++;
    });
    r.newShow = Math.min(r.fresh, r.newLeft);
    return r;
  }
  function lessonStats(n){
    var srs = Store.srs(), l = LES[n], learned = 0, seen = 0;
    Array.prototype.forEach.call(l.k, function(k){ var st = srs["k" + k]; if (st) { seen++; if (st[0] === 1) learned++; } });
    return { learned: learned, seen: seen, total: l.k.length };
  }

  /* ---------------- card faces ---------------- */
  /* markup: {漢|かん} = ruby, **…** = bold; mark = this lesson's kanji, highlighted */
  function rb(mk, mark){
    var out = "", b = false;
    mk.replace(/\*\*|\{([^|{}]+)\|([^{}]+)\}|[^{*]+|[{*]/g, function(t, base, rt){
      if (t === "**") { out += b ? "</b>" : "<b>"; b = !b; }
      else if (base !== undefined) {
        var h = "<ruby>" + esc(base) + "<rt>" + esc(rt) + "</rt></ruby>";
        if (mark && Array.prototype.some.call(base, function(c){ return mark.indexOf(c) >= 0; })) h = '<span class="nk">' + h + "</span>";
        out += h;
      } else out += esc(t);
      return "";
    });
    return out;
  }
  function bare(mk){ return mk.replace(/\{([^|{}]+)\|[^{}]+\}/g, "$1"); }
  function front_(mk){ return rb(bare(mk)); }
  function said(mk){ return bare(mk).replace(/\*\*/g, ""); }
  function wordsHTML(ws){
    return ws.map(function(w){
      return '<li><span class="wj" lang="ja">' + rb(w[0]) + '</span><span class="wg">' + esc(w[1]) + "</span>" +
        (w[2] ? ' <span class="chip n' + w[2] + '">N' + w[2] + "</span>" : "") + "</li>";
    }).join("");
  }
  function chip(lv){ return '<span class="chip n' + lv + '">N' + lv + "</span>"; }
  /* K[k] = [lesson, level, on, kun, meaning, words, sentence, english]; S[n][i] = [line, english] */
  function lineOf(id){ var n = +id.slice(1).split(".")[0], i = +id.split(".")[1]; return { n: n, i: i, d: KJ.S[n][i] }; }
  function front(id){
    var t = id.charAt(0);
    if (t === "k") {
      var d = KJ.K[id.slice(1)];
      return '<p class="tag">Kanji · ' + chip(d[1]) + " · lesson " + d[0] + '</p><p class="big" lang="ja">' + esc(id.slice(1)) + '</p><p class="prompt">Meaning and readings?</p>';
    }
    if (t === "s") {
      var e = KJ.K[id.slice(1)];
      return '<p class="tag">Sentence · <span lang="ja">' + esc(id.slice(1)) + "</span> · lesson " + e[0] + '</p><p class="sent" lang="ja">' + front_(e[6]) + '</p><p class="prompt">Read it aloud. What does it mean?</p>';
    }
    var l = lineOf(id);
    return '<p class="tag">Story · lesson ' + l.n + " · line " + (l.i + 1) + '</p><p class="sent" lang="ja">' + front_(l.d[0]) + '</p><p class="prompt">Read it aloud. What does it mean?</p>';
  }
  function back(id){
    var t = id.charAt(0), h;
    if (t === "k" || t === "s") {
      var k = id.slice(1), d = KJ.K[k];
      var ex = '<div class="ex keep-furi keep-en"><p class="ja" lang="ja"><button class="say" type="button" aria-label="Play">▶</button>' + rb(d[6]) + '</p><p class="en">' + esc(d[7]) + "</p></div>";
      var head = '<div class="row"><span class="mean">' + (t === "s" ? '<span lang="ja">' + esc(k) + "</span> · " : "") + esc(d[4]) + '</span></div><div class="row rd">' +
        (d[2] !== "—" ? '<span><span class="lb">On</span> <span lang="ja">' + esc(d[2]) + "</span></span>" : "") +
        (d[3] !== "—" ? '<span><span class="lb">Kun</span> <span lang="ja">' + esc(d[3]) + "</span></span>" : "") + "</div>";
      h = t === "k" ? head + '<ul class="kc-words keep-furi">' + wordsHTML(d[5]) + "</ul>" + ex : ex + head;
    } else {
      var l = lineOf(id);
      h = '<div class="ex keep-furi keep-en"><p class="ja" lang="ja"><button class="say" type="button" aria-label="Play">▶</button>' + rb(l.d[0], LES[l.n].k) + '</p><p class="en">' + esc(l.d[1]) + "</p></div>";
    }
    return '<div class="back">' + h + "</div>";
  }
  function sayOf(id){
    var t = id.charAt(0);
    if (t === "k" || t === "s") return said(KJ.K[id.slice(1)][6]);
    return said(lineOf(id).d[0]);
  }

  /* ---------------- review session (review page) ---------------- */
  var rv = document.getElementById("review");
  if (rv) (function(){
    var box = $(".card", rv), showBtn = $(".showbtn", rv), grades = $(".grades", rv), counts = $(".counts", rv);
    var doneBox = $(".done", rv), emptyBox = $(".empty", rv);
    var srs, cur = null, seenNew = 0, queueNew = [], queueRev = [], o = Store.opts();
    function build(){
      srs = Store.srs(); o = Store.opts();
      var today = dayNo(), all = pool();
      queueRev = all.filter(function(id){ var st = srs[id]; return st && st[0] === 1 && st[1] <= today; });
      queueRev.sort(function(){ return Math.random() - .5; });
      queueNew = all.filter(function(id){ return !srs[id] && unlocked(id, srs); });
    }
    function learningDue(ahead){
      var now = Date.now(), best = null;
      Object.keys(srs).forEach(function(id){
        var st = srs[id];
        if (st[0] === 0 && st[1] <= now + ahead && pool().indexOf(id) >= 0 && (!best || st[1] < srs[best][1])) best = id;
      });
      return best;
    }
    function pick(){
      var l = learningDue(0); if (l && l !== cur) return l;
      while (queueRev.length) { var r = queueRev.shift(); if (srs[r] && srs[r][0] === 1) return r; }
      var newLeft = Math.max(0, o.np - Store.newToday());
      while (newLeft > 0 && queueNew.length) { var n = queueNew.shift(); if (!srs[n] && unlocked(n, srs)) return n; }
      queueNew = queueNew.concat(pool().filter(function(id){ return !srs[id] && unlocked(id, srs) && queueNew.indexOf(id) < 0; }));
      if (newLeft > 0 && queueNew.length) return queueNew.shift();
      l = learningDue(20 * MIN); return l || null;
    }
    function paintCounts(){
      var t = tally();
      counts.innerHTML = '<span class="cn">New <b>' + t.newShow + '</b></span><span class="cl">Learning <b>' + t.learn + '</b></span><span class="cr">Due <b>' + t.due + "</b></span>";
    }
    function next(){
      cur = pick(); paintCounts();
      if (!Store.lessons().length) { box.hidden = true; showBtn.hidden = true; grades.hidden = true; doneBox.hidden = true; emptyBox.hidden = false; return; }
      emptyBox.hidden = true;
      if (!cur) { box.hidden = true; showBtn.hidden = true; grades.hidden = true; doneBox.hidden = false; whenNext(); return; }
      doneBox.hidden = true; box.hidden = false; box.innerHTML = front(cur); showBtn.hidden = false; grades.hidden = true;
      showBtn.focus({ preventScroll: true });
    }
    function whenNext(){
      var now = Date.now(), soon = null, today = dayNo(), nextDay = null;
      pool().forEach(function(id){ var st = srs[id]; if (!st) return; if (st[0] === 0) { if (!soon || st[1] < soon) soon = st[1]; } else if (st[1] > today && (!nextDay || st[1] < nextDay)) nextDay = st[1]; });
      var p = $(".when", doneBox);
      if (soon) p.textContent = "A card you're still learning comes back in about " + Math.max(1, Math.round((soon - now) / MIN)) + " minutes.";
      else if (nextDay) p.textContent = "Next reviews: " + (nextDay - today === 1 ? "tomorrow" : "in " + (nextDay - today) + " days") + ".";
      else p.textContent = "";
    }
    function show(){
      if (!cur) return;
      box.innerHTML = front(cur) + back(cur);
      showBtn.hidden = true; grades.hidden = false;
      $$(".grade", grades).forEach(function(b){ $("small", b).textContent = label(srs[cur], +b.getAttribute("data-g")); });
      if (o.auto) speak(sayOf(cur), $(".back .say", box));
    }
    function answer(g){
      if (!cur || grades.hidden) return;
      var was = srs[cur];
      srs[cur] = schedule(was, g);
      if (!was) Store.bumpNew();
      Store.saveSrs(srs);
      next();
    }
    showBtn.addEventListener("click", show);
    $$(".grade", grades).forEach(function(b){ b.addEventListener("click", function(){ answer(+b.getAttribute("data-g")); }); });
    document.addEventListener("keydown", function(e){
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if ((e.key === " " || e.key === "Enter") && !showBtn.hidden) { e.preventDefault(); show(); }
      else if (!grades.hidden && /^[1-4]$/.test(e.key)) answer(+e.key);
      else if (!grades.hidden && (e.key === " " || e.key === "Enter")) { e.preventDefault(); answer(3); }
    });
    build(); next();
  })();

  /* ---------------- practice deck (lesson pages): no scheduling ---------------- */
  var pr = document.getElementById("practice-deck");
  if (pr) (function(){
    var n = +pr.getAttribute("data-lesson"), sel = $("select", pr), box = $(".card", pr), showBtn = $(".showbtn", pr), grades = $(".grades", pr), left = $(".left", pr), doneBox = $(".done", pr);
    var deck = [], cur = null;
    function start(){
      var o = { k: sel.value === "k", s: sel.value === "s", p: sel.value === "p" };
      deck = cardsOf(n, o).sort(function(){ return Math.random() - .5; });
      next();
    }
    function next(){
      cur = deck.shift() || null;
      left.textContent = cur ? (deck.length + 1) + " left" : "";
      if (!cur) { box.hidden = true; showBtn.hidden = true; grades.hidden = true; doneBox.hidden = false; return; }
      doneBox.hidden = true; box.hidden = false; box.innerHTML = front(cur); showBtn.hidden = false; grades.hidden = true;
    }
    showBtn.addEventListener("click", function(){ box.innerHTML = front(cur) + back(cur); showBtn.hidden = true; grades.hidden = false; });
    $$(".grade", grades).forEach(function(b){ b.addEventListener("click", function(){
      if (b.getAttribute("data-g") === "1") deck.splice(Math.min(deck.length, 3), 0, cur);
      next();
    }); });
    sel.addEventListener("change", start);
    $$(".restart", pr).forEach(function(b){ b.addEventListener("click", start); });
    start();
  })();

  /* ---------------- "add to my reviews" buttons ---------------- */
  function paintAdd(){
    $$("[data-add]").forEach(function(btn){
      var n = +btn.getAttribute("data-add"), on = Store.lessons().indexOf(n) >= 0;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var short = btn.classList.contains("sm");
      btn.textContent = on ? (short ? "✓ Added" : "✓ In my reviews") : (short ? "＋ Add" : "＋ Add to my reviews");
      var st = btn.parentElement.querySelector(".note");
      if (st) { var s = lessonStats(n); st.textContent = on ? s.learned + " of " + s.total + " kanji learned" : s.total + " kanji, not in your reviews yet"; }
    });
  }
  $$("[data-add]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var n = +btn.getAttribute("data-add"), l = Store.lessons(), i = l.indexOf(n);
      if (i >= 0) l.splice(i, 1); else l.push(n);
      Store.saveLessons(l); paintAdd(); paintHome();
    });
  });
  paintAdd();

  /* ---------------- course home ---------------- */
  function paintHome(){
    var td = document.getElementById("today");
    if (td) {
      var t = tally(), any = Store.lessons().length > 0;
      $(".n-new", td).textContent = t.newShow; $(".n-learn", td).textContent = t.learn; $(".n-due", td).textContent = t.due;
      $(".hint", td).textContent = !any ? "Add a lesson below (or on its page) to start reviewing." :
        (t.newShow + t.learn + t.due ? "Cards are waiting." : "Nothing due right now. Come back later, or add another lesson.");
      $$(".jump a.review").forEach(function(a){ a.classList.toggle("due", t.due + t.learn > 0); });
    }
    $$(".lessons li[data-lesson]").forEach(function(li){
      var n = +li.getAttribute("data-lesson"), s = lessonStats(n), pct = Math.round(100 * s.learned / s.total);
      var bar = $(".bar i", li); if (bar) bar.style.width = pct + "%";
      var lab = $(".plab", li); if (lab) lab.textContent = s.learned + "/" + s.total + " learned";
    });
  }
  paintHome();
  var opts = document.getElementById("opts");
  if (opts) (function(){
    var o = Store.opts(), np = $("#o-np", opts), msg = $(".msg", opts);
    np.value = String(o.np);
    ["k", "s", "p", "auto"].forEach(function(key){ var cb = $("#o-" + key, opts); cb.checked = !!o[key]; });
    function save(){
      var n = { np: +np.value };
      ["k", "s", "p", "auto"].forEach(function(key){ n[key] = $("#o-" + key, opts).checked ? 1 : 0; });
      if (!n.k && !n.s && !n.p) { n.k = 1; $("#o-k", opts).checked = true; }
      Store.saveOpts(n); paintHome(); msg.textContent = "Saved.";
    }
    $$("select, input", opts).forEach(function(x){ x.addEventListener("change", save); });
    var io = $("textarea", opts);
    $(".export", opts).addEventListener("click", function(){
      var dump = {}; ["srs", "lessons", "opts", "new"].forEach(function(k){ var v = get(P + k, null); if (v !== null) dump[k] = v; });
      io.value = JSON.stringify(dump); io.select(); msg.textContent = "Copy this text and keep it; paste it here on another device to carry your progress over.";
    });
    $(".import", opts).addEventListener("click", function(){
      try {
        var d = JSON.parse(io.value);
        ["srs", "lessons", "opts", "new"].forEach(function(k){ if (typeof d[k] === "string") { JSON.parse(d[k]); put(P + k, d[k]); } });
        msg.textContent = "Progress loaded."; paintHome(); paintAdd();
      } catch (e) { msg.textContent = "That isn't a progress backup from this page."; }
    });
    $(".reset", opts).addEventListener("click", function(){
      if (!window.confirm("Forget all review progress in this browser?")) return;
      ["srs", "lessons", "new"].forEach(function(k){ try { localStorage.removeItem(P + k); } catch (e) {} });
      msg.textContent = "Progress cleared."; paintHome(); paintAdd();
    });
  })();
})();
