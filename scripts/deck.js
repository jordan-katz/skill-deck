(function () {
  var input = document.getElementById('filter');
  var total = document.getElementById('total');
  var empty = document.getElementById('empty');
  var toast = document.getElementById('toast');
  var qs = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var tabs = qs('.tab');
  var agentPanels = qs('.agent-panel');
  var levelFilter = null;
  var filtering = false;
  var savedOpen = null;

  // Theme cycles system -> light -> dark. The head script applies the stored
  // value before first paint so there is no flash.
  var themeBtn = document.getElementById('theme');
  var THEMES = ['system', 'light', 'dark'];
  var theme = THEMES.indexOf(store.get('deck.theme')) === -1 ? 'system' : store.get('deck.theme');
  function applyTheme(t) {
    theme = t;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    if (themeBtn) themeBtn.textContent = t;
  }
  applyTheme(theme);
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('deck.theme', next);
    applyTheme(next);
  });

  // Which uses trees are open, so a refresh lands where you left off.
  function readOpen() { var v = store.get('deck.open'); return v ? v.split(',') : []; }
  function markOpen(id, on) {
    if (!id) return;
    var list = readOpen().filter(function (x) { return x && x !== id; });
    if (on) list.push(id);
    store.set('deck.open', list.join(','));
  }

  function currentAgent() {
    var p = agentPanels.filter(function (p) { return !p.hidden; })[0];
    return p ? p.dataset.agent : null;
  }
  function currentPanel() {
    var a = currentAgent();
    if (!a) return null;
    return qs('.sub-panel', document.getElementById('agent-' + a)).filter(function (p) { return !p.hidden; })[0] || null;
  }

  // Keeps the address bar pointing at what you are looking at, so the URL is
  // copyable. replaceState rather than assigning location.hash, which would
  // pile up history entries and fire hashchange.
  function syncHash() {
    var a = currentAgent();
    if (!a || !window.history || !history.replaceState) return;
    var p = currentPanel();
    var h = '#' + a + (p ? '/' + p.dataset.sub : '');
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  // One control row for the whole deck, but it narrows a section, so it has to
  // read after the section pills rather than above them. Move the single node
  // into whichever agent panel is showing instead of emitting one per panel.
  var controls = document.querySelector('.controls');
  function placeControls(id) {
    var host = document.getElementById('agent-' + id);
    if (!host || !controls) return;
    var subs = host.querySelector('.subtabs');
    if (subs && subs.nextSibling !== controls) subs.parentNode.insertBefore(controls, subs.nextSibling);
  }

  function selectAgent(id, remember) {
    if (!document.getElementById('agent-' + id)) id = tabs[0].dataset.agent;
    tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.agent === id)); });
    agentPanels.forEach(function (p) { p.hidden = p.dataset.agent !== id; });
    placeControls(id);
    if (remember) store.set('deck.agent', id);
    var want = store.get('deck.sub.' + id);
    var subs = qs('.subtab', document.getElementById('agent-' + id));
    var names = subs.map(function (s) { return s.dataset.sub; });
    selectSub(id, names.indexOf(want) !== -1 ? want : names[0], false);
    if (remember) syncHash();
  }

  function selectSub(agent, sub, remember) {
    var host = document.getElementById('agent-' + agent);
    if (!host) return;
    qs('.subtab', host).forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.sub === sub)); });
    qs('.sub-panel', host).forEach(function (p) { p.hidden = p.dataset.sub !== sub; });
    if (remember) { store.set('deck.sub.' + agent, sub); syncHash(); }
    applyFilter();
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { selectAgent(t.dataset.agent, true); });
  });
  qs('.subtab').forEach(function (t) {
    t.addEventListener('click', function () { selectSub(t.closest('.agent-panel').dataset.agent, t.dataset.sub, true); });
  });
  // Arrow keys move between tabs in the same row, as the tablist pattern expects.
  function arrowNav(list) {
    list.forEach(function (t) {
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var peers = list.filter(function (x) { return x.offsetParent !== null; });
        var at = peers.indexOf(t);
        var next = peers[(at + d + peers.length) % peers.length];
        next.focus(); next.click();
      });
    });
  }
  arrowNav(tabs);
  qs('.agent-panel').forEach(function (p) { arrowNav(qs('.subtab', p)); });

  function recount() {
    var panel = currentPanel();
    if (!panel) { total.textContent = ''; empty.classList.remove('show'); return; }
    qs('.dir', panel).forEach(function (d) {
      var n = qs('.row:not(.hidden):not(.row-head):not(.cmd-head)', d).length;
      var c = d.querySelector('[data-count]');
      if (c) c.textContent = n === Number(c.dataset.total) ? n : n + ' of ' + c.dataset.total;
      d.classList.toggle('hidden', n === 0);
    });
    var rows = qs('.row:not(.hidden):not(.row-head):not(.cmd-head)', panel).length;
    var cards = qs('.card:not(.hidden)', panel).length;
    var n = rows + cards;
    total.textContent = n + ' shown';
    empty.classList.toggle('show', n === 0);
  }

  function applyFilter() {
    var q = input.value.trim().toLowerCase().replace(/^\//, '');
    var panel = currentPanel();
    qs('.row:not(.row-head):not(.cmd-head)').forEach(function (r) {
      var textMiss = q !== '' && (r.getAttribute('data-search') || '').indexOf(q) === -1;
      var levelMiss = levelFilter !== null && r.hasAttribute('data-effect') && r.getAttribute('data-effect') !== levelFilter;
      r.classList.toggle('hidden', textMiss || levelMiss);
    });
    qs('.card').forEach(function (c) {
      c.classList.toggle('hidden', q !== '' && (c.getAttribute('data-search') || '').indexOf(q) === -1);
    });
    // The filter only shows the section you are on, so the pills carry the
    // match count for the others. Without this, searching "notion" from the
    // commands tab reads as "no results" when the hits are two tabs over.
    var agent = currentAgent();
    if (agent) {
      qs('.subtab', document.getElementById('agent-' + agent)).forEach(function (t) {
        var panel = document.getElementById('panel-' + agent + '-' + t.dataset.sub);
        var n = panel ? panel.querySelectorAll('.row:not(.hidden):not(.row-head):not(.cmd-head), .card:not(.hidden)').length : 0;
        var span = t.querySelector('.n');
        if (span) span.textContent = n;
        t.classList.toggle('has-match', (q !== '' || levelFilter !== null) && n > 0);
        t.classList.toggle('no-match', (q !== '' || levelFilter !== null) && n === 0);
      });
    }

    // Chip counts answer "how much is behind this filter" before you press it,
    // so they count the text query only. Counting the level filter too would
    // zero every chip the moment you pressed one.
    var bar = document.getElementById('effects');
    if (bar && panel) {
      var scoped = qs('.row[data-effect]', panel);
      bar.hidden = scoped.length === 0;
      qs('.effect-chip', bar).forEach(function (c) {
        var n = scoped.filter(function (r) {
          if (r.getAttribute('data-effect') !== c.dataset.level) return false;
          return q === '' || (r.getAttribute('data-search') || '').indexOf(q) !== -1;
        }).length;
        var span = c.querySelector('.n');
        if (span) span.textContent = n;
        c.disabled = n === 0 && levelFilter !== c.dataset.level;
        c.style.opacity = c.disabled ? '0.4' : '';
      });
    }

    var active = q !== '' || levelFilter !== null;
    var dirs = qs('.dir');
    if (active && !filtering) { filtering = true; savedOpen = dirs.map(function (d) { return d.open; }); }
    if (active) { dirs.forEach(function (d) { d.open = true; }); }
    else if (filtering) { filtering = false; dirs.forEach(function (d, i) { d.open = savedOpen ? savedOpen[i] : d.open; }); }
    recount();
  }

  input.addEventListener('input', applyFilter);
  qs('.effect-chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var lvl = c.dataset.level;
      levelFilter = levelFilter === lvl ? null : lvl;
      qs('.effect-chip').forEach(function (o) { o.setAttribute('aria-pressed', String(o.dataset.level === levelFilter)); });
      applyFilter();
    });
  });
  document.addEventListener('keydown', function (e) {
    // The palette owns the keyboard while it is up.
    if (typeof palOpen === 'function' && palOpen()) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPal(); return; }
    // alt+1..9 copies that pinned command from anywhere on the page.
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      var pinBtn = qs('.pin', pinsHost)[Number(e.key) - 1];
      if (pinBtn) { e.preventDefault(); pinBtn.click(); }
      return;
    }
    if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); input.select(); }
    if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; applyFilter(); input.blur(); }
  });

  qs('.dir').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (filtering) return;
      store.set('deck.dir.' + d.dataset.dir, d.open ? '1' : '0');
    });
    if (store.get('deck.dir.' + d.dataset.dir) === '1') d.open = true;
  });

  function flash(el, text) {
    el.classList.add('copied');
    setTimeout(function () { el.classList.remove('copied'); }, 1200);
    toast.textContent = 'copied ' + text;
    toast.classList.add('show');
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { toast.classList.remove('show'); }, 1400);
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  function copy(el, text, label) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(el, label); }, function () { fallback(text); flash(el, label); });
    } else { fallback(text); flash(el, label); }
  }
  qs('.chip-copy').forEach(function (c) {
    var t = c.getAttribute('data-copy');
    c.addEventListener('click', function (e) { e.stopPropagation(); copy(c, t, t); });
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(c, t, t); } });
  });
  qs('.cell-cmd').forEach(function (cell) {
    cell.addEventListener('click', function (e) {
      var c = cell.querySelector('.chip-copy');
      if (c && e.target !== c && !c.contains(e.target)) copy(c, c.getAttribute('data-copy'), c.getAttribute('data-copy'));
    });
  });
  qs('.pre-copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var pre = b.parentNode.querySelector('pre');
      copy(b, pre ? pre.textContent : '', 'snippet');
    });
  });
  qs('.uses-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = b.closest('.skill-row');
      var open = !r.classList.contains('open');
      r.classList.toggle('open', open);
      b.setAttribute('aria-expanded', String(open));
      markOpen(r.id, open);
    });
  });
  function setAll(open) {
    var panel = currentPanel();
    if (!panel) return;
    qs('.uses-toggle', panel).forEach(function (b) {
      var r = b.closest('.skill-row');
      r.classList.toggle('open', open);
      b.setAttribute('aria-expanded', String(open));
      markOpen(r.id, open);
    });
    qs('.dir', panel).forEach(function (d) { d.open = open; });
  }
  qs('[data-expand]').forEach(function (b) { b.addEventListener('click', function () { setAll(true); }); });
  qs('[data-collapse]').forEach(function (b) { b.addEventListener('click', function () { setAll(false); }); });

  (function () {
    var f = document.querySelector('.foot');
    var built = new Date(f.getAttribute('data-built'));
    var days = Math.floor((Date.now() - built.getTime()) / 86400000);
    if (days > 30) document.getElementById('age').textContent =
      'Built ' + days + ' days ago. Configs may have moved since. Run node scripts/sync.mjs && node scripts/build.mjs.';
  })();

  // ---- command center ----------------------------------------------------
  // Every copyable thing in the deck already carries data-copy, so the index is
  // scraped from the DOM rather than emitted by the build. Hidden panels are
  // still in the DOM, which is what makes the search cross-tab.
  var pal = document.getElementById('pal');
  var palInput = document.getElementById('pal-input');
  var palList = document.getElementById('pal-list');
  var pinsHost = document.getElementById('pins');
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var results = [];
  var at = 0;
  var index = qs('[data-copy]').map(function (el) {
    var row = el.closest('.row');
    var panel = el.closest('.agent-panel');
    var sub = el.closest('.sub-panel');
    var tab = panel ? document.getElementById('tab-' + panel.dataset.agent) : null;
    var blurbEl = row ? row.querySelector('.cell-blurb') : null;
    var text = el.getAttribute('data-copy') || '';
    var agent = panel ? panel.dataset.agent : '';
    var blurb = blurbEl ? blurbEl.textContent.trim().replace(/\s+/g, ' ') : '';
    return {
      text: text, agent: agent, key: agent + '|' + text,
      label: tab ? tab.childNodes[0].textContent.trim() : 'deck',
      sub: sub ? sub.dataset.sub : '', blurb: blurb, rowId: row ? row.id : '',
      hay: (text + ' ' + blurb + ' ' + agent).toLowerCase()
    };
  });
  var byKey = {};
  index.forEach(function (it) { if (!byKey[it.key]) byKey[it.key] = it; });

  function readPins() {
    var v = store.get('deck.pins');
    return (v ? v.split('\n') : []).filter(function (k) { return byKey[k]; });
  }
  function writePins(list) { store.set('deck.pins', list.join('\n')); renderPins(); }
  function togglePin(key) {
    var list = readPins();
    var i = list.indexOf(key);
    if (i === -1) { if (list.length < 9) list.push(key); }
    else list.splice(i, 1);
    writePins(list);
  }

  function renderPins() {
    var list = readPins();
    pinsHost.innerHTML = '';
    if (!list.length) {
      var hint = document.createElement('span');
      hint.className = 'cc-hint';
      hint.textContent = 'pin from the palette';
      pinsHost.appendChild(hint);
      return;
    }
    list.forEach(function (key, i) {
      var it = byKey[key];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pin';
      b.title = it.text + '  (' + (mac ? 'opt' : 'alt') + '+' + (i + 1) + ')';
      b.innerHTML = '<span class="pin-n"></span><span class="pin-t"></span>';
      b.querySelector('.pin-n').textContent = String(i + 1);
      b.querySelector('.pin-t').textContent = it.text;
      b.addEventListener('click', function () { copy(b, it.text, it.text); });
      pinsHost.appendChild(b);
    });
  }

  function render() {
    var q = palInput.value.trim().toLowerCase();
    var words = q ? q.split(/\s+/) : [];
    results = index.filter(function (it) {
      return words.every(function (w) { return it.hay.indexOf(w) !== -1; });
    }).sort(function (a, b) {
      var aa = q && a.text.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      var bb = q && b.text.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      return aa - bb || a.text.length - b.text.length;
    }).slice(0, 50);
    at = 0;
    palList.innerHTML = '';
    if (!results.length) {
      var li = document.createElement('li');
      li.className = 'pal-empty';
      li.textContent = 'Nothing matches that.';
      palList.appendChild(li);
      return;
    }
    var pinned = readPins();
    results.forEach(function (it, i) {
      var li = document.createElement('li');
      li.className = 'pal-item' + (pinned.indexOf(it.key) === -1 ? '' : ' pinned');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === 0));
      li.innerHTML = '<span class="pal-cmd"></span><span class="pal-where"></span><span class="pal-blurb"></span>';
      li.querySelector('.pal-cmd').textContent = it.text;
      li.querySelector('.pal-where').textContent = it.sub ? it.label + ' / ' + it.sub : it.label;
      li.querySelector('.pal-blurb').textContent = it.blurb;
      li.addEventListener('click', function (e) { at = i; choose(e.ctrlKey || e.metaKey ? 'go' : 'copy'); });
      palList.appendChild(li);
    });
  }

  function move(d) {
    if (!results.length) return;
    var items = qs('.pal-item', palList);
    items[at].setAttribute('aria-selected', 'false');
    at = (at + d + results.length) % results.length;
    items[at].setAttribute('aria-selected', 'true');
    items[at].scrollIntoView({ block: 'nearest' });
  }

  function choose(how) {
    var it = results[at];
    if (!it) return;
    if (how === 'pin') { togglePin(it.key); render(); return; }
    if (how === 'go') {
      closePal();
      if (it.agent) {
        selectAgent(it.agent, true);
        if (it.sub) selectSub(it.agent, it.sub, true);
      }
      var row = it.rowId ? document.getElementById(it.rowId) : null;
      if (row) {
        var d = row.closest('details');
        if (d) d.open = true;
        row.scrollIntoView({ block: 'center' });
        var chip = row.querySelector('.chip-copy');
        if (chip) chip.focus();
      }
      return;
    }
    copy(palList, it.text, it.text);
    closePal();
  }

  function palOpen() { return !pal.hidden; }
  function openPal() {
    pal.hidden = false;
    palInput.value = '';
    render();
    palInput.focus();
  }
  function closePal() { pal.hidden = true; }

  document.getElementById('cc-open').addEventListener('click', openPal);
  pal.addEventListener('mousedown', function (e) { if (e.target === pal) closePal(); });
  palInput.addEventListener('input', render);
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(e.altKey ? 'pin' : (e.ctrlKey || e.metaKey) ? 'go' : 'copy'); }
    else if (e.key === 'Escape') { e.preventDefault(); closePal(); }
  });
  document.getElementById('cc-kbd').textContent = mac ? 'cmd k' : 'ctrl k';
  renderPins();

  readOpen().forEach(function (id) {
    var r = document.getElementById(id);
    if (!r || !r.classList.contains('skill-row')) return;
    r.classList.add('open');
    var b = r.querySelector('.uses-toggle');
    if (b) b.setAttribute('aria-expanded', 'true');
  });

  // #agent or #agent/sub deep links, then remembered tab, then the first one.
  var hash = (location.hash || '').replace(/^#/, '').split('/');
  var params = new URLSearchParams(location.search);
  var start = hash[0] && document.getElementById('agent-' + hash[0]) ? hash[0] : (store.get('deck.agent') || tabs[0].dataset.agent);
  selectAgent(start, false);
  if (hash[1]) selectSub(currentAgent(), hash[1], false);
  if (params.get('q')) { input.value = params.get('q'); applyFilter(); }
  syncHash();
})();
