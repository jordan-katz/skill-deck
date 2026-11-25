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
    qs('.sub-panel', host).forEach(function (p) {
      var show = p.dataset.sub === sub;
      p.hidden = !show;
      // Each switch fades the new section up into place. Two class names that
      // alternate restart the animation without a reflow hack.
      if (show) { var k = p.classList.contains('swap-0') ? 'swap-1' : 'swap-0'; p.classList.remove('swap-0', 'swap-1'); p.classList.add(k); }
    });
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

  // ---- copying -----------------------------------------------------------
  // navigator.clipboard first. It is refused on file:// in some browsers and
  // inside embedded webviews (Obsidian, some app shells), so a hidden textarea
  // and execCommand come next, with focus handed back to where it was.
  function flash(el, text) {
    if (el && el.classList) {
      el.classList.remove('copied');
      void el.offsetWidth;
      el.classList.add('copied');
      setTimeout(function () { el.classList.remove('copied'); }, 1200);
    }
    say('copied ' + text);
  }
  function say(text, bad) {
    toast.textContent = text;
    toast.classList.toggle('bad', Boolean(bad));
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }
  function fallback(text) {
    var prev = document.activeElement;
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (prev && prev.focus) prev.focus({ preventScroll: true });
    return ok;
  }
  // Reaches the clipboard by any route, then calls ok or fail. Never throws.
  function toClipboard(text, ok, fail) {
    var miss = function () { if (fallback(text)) ok(); else fail(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, miss);
    else miss();
  }
  function copy(el, text, label) {
    if (!text) return;
    toClipboard(text, function () { flash(el, label || text); }, function () { say('The clipboard was not reachable here. Select and copy it by hand.', true); });
  }

  // ---- chain -------------------------------------------------------------
  // A chain is an ordered run of skills and commands for one agent, plus a
  // target and notes, rendered into one prompt and kept on the clipboard as it
  // grows. Alt+click (or chain mode) adds a step; a macro adds all of its steps.
  var CHAIN_MAX = 12;
  var chainEl = document.getElementById('chain');
  var chainSteps = document.getElementById('chain-steps');
  var chainTarget = document.getElementById('chain-target');
  var chainNotes = document.getElementById('chain-notes');
  var chainPreview = document.getElementById('chain-preview');
  var chainWho = document.getElementById('chain-agent');
  var modeBtns = qs('#click-mode button');
  var chain = (function () {
    try { var c = JSON.parse(store.get('deck.chain') || 'null'); if (c && Array.isArray(c.steps)) return c; } catch (e) {}
    return { agent: null, steps: [], target: '', notes: '' };
  })();
  var chainMode = store.get('deck.click') === 'chain';
  var trayOpen = store.get('deck.tray') === '1';
  var clearBtn = document.getElementById('chain-clear');
  var undo = null;

  // One line of plain text, so nothing pasted can break out of a terminal prompt.
  function oneLine(v, max) { return String(v || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 500); }
  function prefixOf(agent) {
    var p = document.getElementById('agent-' + agent);
    return p ? p.getAttribute('data-prefix') || '' : '';
  }
  function agentName(agent) {
    var t = document.getElementById('tab-' + agent);
    return t ? t.childNodes[0].textContent.trim() : agent;
  }
  function stepText(s) { return s.cmd ? s.skill + ' ' + s.cmd : s.skill; }
  function segments(steps) {
    var segs = [];
    steps.forEach(function (st) {
      var last = segs[segs.length - 1];
      if (last && last.skill === st.skill && st.cmd && last.cmds.length) last.cmds.push(st.cmd);
      else segs.push({ skill: st.skill, cmds: st.cmd ? [st.cmd] : [] });
    });
    return segs;
  }
  // With a command prefix the chain reads as commands the agent already knows
  // ("/polish-kit polish, then harden on src/app. Then /site-check ship.").
  // Without one it is a numbered instruction any agent can follow.
  function renderChain(prefix, steps, target, notes) {
    target = oneLine(target);
    notes = oneLine(notes, 2000);
    if (!steps.length) return '';
    var noted = notes ? ' Notes: ' + notes : '';
    if (prefix) {
      var segs = segments(steps);
      var first = segs[0];
      var head = first.cmds.length ? ' ' + first.cmds.join(', then ') : '';
      if (segs.length === 1 && first.cmds.length <= 1) return prefix + first.skill + head + (target ? ' ' + target : '') + (notes ? ' ' + notes : '');
      var on = target ? (first.cmds.length ? ' on ' + target : ' ' + target) : '';
      var more = segs.slice(1).map(function (g) { return ' Then ' + prefix + g.skill + (g.cmds.length ? ' ' + g.cmds.join(', then ') : '') + '.'; }).join('');
      return prefix + first.skill + head + on + '.' + more + (target ? ' Same target throughout,' : '') +
        (target ? ' one' : ' One') + ' bounded pass per step in this order, one consolidated report at the end.' + noted;
    }
    var at = target ? ' on ' + target : '';
    if (steps.length === 1) {
      var s = steps[0];
      return 'Use the ' + s.skill + ' skill' + (s.cmd ? ' and run its ' + s.cmd + ' command' : '') + at + '.' + noted;
    }
    var list = steps.map(function (st, i) { return (i + 1) + ') ' + stepText(st); }).join('; ');
    return 'Run this chain in order' + at + ': ' + list + ". Use each named skill's own instructions for its step, one bounded pass per step, and give one consolidated report at the end." + noted;
  }
  function chainText() { return renderChain(prefixOf(chain.agent), chain.steps, chain.target, chain.notes); }
  function saveChain() { store.set('deck.chain', JSON.stringify(chain)); }

  function setTray(open) {
    trayOpen = open;
    store.set('deck.tray', open ? '1' : '0');
    renderChainUi();
  }
  function setMode(on) {
    chainMode = on;
    store.set('deck.click', on ? 'chain' : 'copy');
    modeBtns.forEach(function (b) {
      var mine = (b.dataset.mode === 'chain') === on;
      b.setAttribute('aria-pressed', String(mine));
    });
    document.documentElement.classList.toggle('chain-mode', on);
    if (on) setTray(true);
  }
  modeBtns.forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode === 'chain'); }); });

  // Numbered badges on chips that are in the chain, so the page shows the order.
  function markChips() {
    qs('.chip-copy[data-step]').forEach(function (c) {
      var panel = c.closest('.agent-panel');
      var mine = panel && panel.dataset.agent === chain.agent;
      var pos = [];
      if (mine) chain.steps.forEach(function (st, i) {
        if (st.skill === c.dataset.step && (st.cmd || '') === (c.dataset.cmd || '')) pos.push(i + 1);
      });
      var badge = c.querySelector('.in-chain');
      if (!pos.length) { if (badge) badge.remove(); c.classList.remove('chained'); return; }
      c.classList.add('chained');
      if (!badge) { badge = document.createElement('i'); badge.className = 'in-chain'; c.insertBefore(badge, c.firstChild); }
      badge.textContent = pos.join('·');
    });
  }

  function renderChainUi() {
    var n = chain.steps.length;
    chainEl.hidden = !(trayOpen || n);
    document.documentElement.classList.toggle('has-chain', !chainEl.hidden);
    chainWho.textContent = n ? agentName(chain.agent) : '';
    chainSteps.innerHTML = '';
    chain.steps.forEach(function (st, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="cs-n"></span><code class="cs-t"></code><button type="button" class="cs-up" aria-label="Move up">↑</button><button type="button" class="cs-x" aria-label="Remove">×</button>';
      li.querySelector('.cs-n').textContent = String(i + 1);
      li.querySelector('.cs-t').textContent = stepText(st);
      var up = li.querySelector('.cs-up');
      up.disabled = i === 0;
      up.setAttribute('aria-label', 'Move ' + stepText(st) + ' up');
      up.addEventListener('click', function () {
        var t = chain.steps[i - 1]; chain.steps[i - 1] = chain.steps[i]; chain.steps[i] = t;
        chainChanged();
      });
      var x = li.querySelector('.cs-x');
      x.setAttribute('aria-label', 'Remove ' + stepText(st));
      x.addEventListener('click', function () {
        chain.steps.splice(i, 1);
        if (!chain.steps.length) chain.agent = null;
        chainChanged();
      });
      chainSteps.appendChild(li);
    });
    if (!n) {
      var hint = document.createElement('li');
      hint.className = 'cs-empty';
      hint.textContent = 'Click skills in the order you want them run, with ' + (mac ? 'Option' : 'Alt') + '+click or clicks set to chain. Each click copies the whole chain, so ' + (mac ? 'Cmd' : 'Ctrl') + '+V pastes it into any session.';
      chainSteps.appendChild(hint);
    }
    clearBtn.textContent = !n && undo ? 'bring back ' + undo.steps.length : 'clear';
    clearBtn.title = !n && undo ? 'Bring back the chain you cleared' : 'Clear the chain';
    chainTarget.value = chain.target;
    chainNotes.value = chain.notes;
    chainPreview.textContent = chainText() || 'The prompt shows up here.';
    chainPreview.classList.toggle('empty', !n);
    markChips();
  }
  function chainChanged() {
    saveChain();
    renderChainUi();
  }
  // Each step added puts the whole chain so far on the clipboard, so Ctrl+V
  // pastes it into any session without a trip back to the copy button.
  function copyChain() {
    var n = chain.steps.length;
    toClipboard(chainText(),
      function () { say('Chain of ' + n + ' on your clipboard. ' + (mac ? 'Cmd' : 'Ctrl') + '+V pastes it into any session.'); },
      function () { say('Added to the chain. The clipboard was not reachable; use Copy chain in the tray.', true); });
  }
  function addSteps(agent, steps) {
    if (chain.steps.length && chain.agent !== agent) {
      say('A chain stays with one agent. Clear the ' + agentName(chain.agent) + ' chain to start one here.', true);
      return;
    }
    if (chain.steps.length + steps.length > CHAIN_MAX) { say('A chain holds ' + CHAIN_MAX + ' steps at most.', true); return; }
    chain.agent = agent;
    undo = null;
    steps.forEach(function (s) { chain.steps.push(s.cmd ? { skill: s.skill, cmd: s.cmd } : { skill: s.skill }); });
    chainChanged();
    copyChain();
  }
  // The step a chip stands for: one step, or a macro's whole sequence.
  function stepsOf(el) {
    if (el.dataset.steps) { try { return JSON.parse(el.dataset.steps); } catch (e) {} }
    return [{ skill: el.dataset.step, cmd: el.dataset.cmd || '' }];
  }
  chainTarget.addEventListener('input', function () { chain.target = chainTarget.value; saveChain(); chainPreview.textContent = chainText() || 'The prompt shows up here.'; });
  chainNotes.addEventListener('input', function () { chain.notes = chainNotes.value; saveChain(); chainPreview.textContent = chainText() || 'The prompt shows up here.'; });
  document.getElementById('chain-copy').addEventListener('click', function (e) {
    if (!chain.steps.length) { say('Add a step first.', true); return; }
    copy(e.currentTarget, chainText(), 'chain');
  });
  // Clear keeps what it threw away until the next step is added, so one
  // misclick does not cost a chain you built up a click at a time.
  clearBtn.addEventListener('click', function () {
    if (!chain.steps.length && undo) {
      chain.agent = undo.agent; chain.steps = undo.steps; chain.notes = undo.notes;
      undo = null;
      chainChanged();
      return;
    }
    if (!chain.steps.length) return;
    undo = { agent: chain.agent, steps: chain.steps.slice(), notes: chain.notes };
    chain = { agent: null, steps: [], target: chain.target, notes: '' };
    chainChanged();
  });
  document.getElementById('chain-close').addEventListener('click', function () {
    setTray(false);
    if (chainMode) setMode(false);
  });

  // A command copied while a target is set goes out with the target on it.
  function withTarget(el, text) {
    var t = oneLine(chain.target);
    return t && el && el.dataset && el.dataset.step ? text + ' ' + t : text;
  }

  function activate(c, e) {
    var panel = c.closest('.agent-panel');
    if (c.dataset.step && panel && (chainMode || e.altKey)) { addSteps(panel.dataset.agent, stepsOf(c)); return; }
    // Built-in CLI commands act on the session itself, and a CLI only reads the
    // command at the start of a prompt, so they copy on their own.
    if (chainMode || e.altKey) {
      var line = c.getAttribute('data-copy');
      toClipboard(line, function () { flash(c, line); say("Built-in commands can't join a chain. Copied " + line + ' on its own.'); },
        function () { say('The clipboard was not reachable here. Select and copy it by hand.', true); });
      return;
    }
    var t = withTarget(c, c.getAttribute('data-copy'));
    copy(c, t, t);
  }
  qs('.chip-copy').forEach(function (c) {
    c.addEventListener('click', function (e) { e.stopPropagation(); activate(c, e); });
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(c, e); } });
  });
  qs('.cell-cmd').forEach(function (cell) {
    cell.addEventListener('click', function (e) {
      var c = cell.querySelector('.chip-copy');
      if (c && e.target !== c && !c.contains(e.target)) activate(c, e);
    });
  });
  qs('.pre-copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var pre = b.parentNode.querySelector('pre');
      copy(b, pre ? pre.textContent : '', 'snippet');
    });
  });
  qs('.blurb-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      b.title = open ? 'Show less' : 'Show all';
      b.querySelector('.blurb').classList.toggle('clamp', !open);
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
  var palBox = pal.querySelector('.pal-box');
  var palInput = document.getElementById('pal-input');
  var palList = document.getElementById('pal-list');
  var palScopes = document.getElementById('pal-scopes');
  var pinsHost = document.getElementById('pins');
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var KIND = { skill: 'skill', cmd: 'cmd', macro: 'macro', command: 'cli', page: 'page' };
  var results = [];
  var sel = { epoch: null, key: null };
  var scope = 'all';
  var returnTo = null;
  var pointer = null;

  var index = qs('main [data-copy], .foot [data-copy]').map(function (el) {
    var row = el.closest('.row');
    var panel = el.closest('.agent-panel');
    var sub = el.closest('.sub-panel');
    var tab = panel ? document.getElementById('tab-' + panel.dataset.agent) : null;
    var blurbEl = row ? row.querySelector('.cell-blurb') : null;
    var text = el.getAttribute('data-copy') || '';
    var agent = panel ? panel.dataset.agent : '';
    var own = el.getAttribute('data-blurb');
    var blurb = own != null ? own : blurbEl ? (blurbEl.querySelector('.blurb') || blurbEl).textContent.trim().replace(/\s+/g, ' ') : '';
    var kind = el.dataset.cmd ? (el.dataset.steps ? 'macro' : 'cmd') : el.dataset.step ? 'skill' : 'command';
    return {
      kind: kind, text: text, agent: agent, key: agent + '|' + text, el: el,
      label: tab ? tab.childNodes[0].textContent.trim() : 'deck',
      sub: sub ? sub.dataset.sub : '', blurb: blurb, rowId: row ? row.id : '',
      bare: text.replace(/^[^a-z0-9]+/i, '')
    };
  });
  var byKey = {};
  index = index.filter(function (it) { if (byKey[it.key]) return false; byKey[it.key] = it; return true; });
  // Pages: every tab and section, offered when the query asks for one.
  var pages = [];
  agentPanels.forEach(function (p) {
    qs('.subtab', p).forEach(function (s) {
      var name = agentName(p.dataset.agent);
      pages.push({ kind: 'page', key: 'go:' + p.dataset.agent + '/' + s.dataset.sub, agent: p.dataset.agent, sub: s.dataset.sub,
        text: name + ' / ' + s.dataset.sub, bare: name + ' ' + s.dataset.sub, label: 'go to', blurb: '' });
    });
  });

  // Subsequence match that rewards prefixes and word starts. Null on a miss.
  function fuzzy(q, text) {
    var t = String(text || '').toLowerCase();
    var s = q.toLowerCase().trim();
    if (!s) return 1;
    if (t.indexOf(s) === 0) return 1000 - t.length;
    var found = t.indexOf(s);
    if (found >= 0) return 800 - found - t.length / 10;
    var score = 0, ti = 0, prev = -2;
    for (var k = 0; k < s.length; k++) {
      var ch = s[k];
      if (ch === ' ') continue;
      var i = t.indexOf(ch, ti);
      if (i < 0) return null;
      score += i === prev + 1 ? 6 : /[\s\/:_-]/.test(t[i - 1] || ' ') ? 4 : 1;
      prev = i;
      ti = i + 1;
    }
    return score - t.length / 20;
  }

  function readList(k) { var v = store.get(k); return (v ? v.split('\n') : []).filter(function (x) { return byKey[x]; }); }
  function readPins() { return readList('deck.pins'); }
  function remember(key) {
    if (!byKey[key]) return;
    store.set('deck.recent', [key].concat(readList('deck.recent').filter(function (k) { return k !== key; })).slice(0, 6).join('\n'));
  }
  function writePins(list) { store.set('deck.pins', list.join('\n')); renderPins(); }
  function togglePin(key) {
    var list = readPins();
    var i = list.indexOf(key);
    if (i === -1) { if (list.length < 9) list.push(key); else say('Nine pins at most. Unpin one first.', true); }
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
      b.addEventListener('click', function (e) {
        if (it.el.dataset.step && (chainMode || e.altKey)) { addSteps(it.agent, stepsOf(it.el)); return; }
        var t = withTarget(it.el, it.text);
        copy(b, t, t);
      });
      pinsHost.appendChild(b);
    });
  }

  function renderScopes() {
    palScopes.innerHTML = '';
    ['all'].concat(agentPanels.map(function (p) { return p.dataset.agent; })).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = a === 'all' ? 'all' : agentName(a);
      b.setAttribute('aria-pressed', String(a === scope));
      b.addEventListener('click', function () { scope = a; renderScopes(); render(); palInput.focus(); });
      palScopes.appendChild(b);
    });
  }

  function compute() {
    var q = palInput.value.trim();
    var pool = scope === 'all' ? index : index.filter(function (it) { return it.agent === scope; });
    var pinned = readPins();
    // "go" lists the pages; a query that starts a tab's name puts its pages first.
    var goQ = /^go(\s|$)/i.test(q) ? q.replace(/^go\s*/i, '') : null;
    var pageHits = pages.filter(function (p) {
      if (scope !== 'all' && p.agent !== scope) return false;
      if (goQ !== null) return fuzzy(goQ, p.bare) != null;
      return q.length >= 3 && agentName(p.agent).toLowerCase().indexOf(q.toLowerCase()) === 0;
    });
    if (goQ !== null) return pageHits;
    if (!q) {
      var recent = readList('deck.recent').map(function (k) { return byKey[k]; })
        .filter(function (it) { return it && (scope === 'all' || it.agent === scope); })
        .map(function (it) { return { it: it, recent: true }; });
      var seen = {};
      recent.forEach(function (r) { seen[r.it.key] = 1; });
      var first = pool.filter(function (it) { return !seen[it.key] && pinned.indexOf(it.key) !== -1; });
      var rest = pool.filter(function (it) { return !seen[it.key] && pinned.indexOf(it.key) === -1; });
      return recent.concat(first.concat(rest).map(function (it) { return { it: it }; })).slice(0, 60);
    }
    var low = q.toLowerCase();
    var scored = pool.map(function (it) {
      var a = fuzzy(q, it.text), b = fuzzy(q, it.bare);
      var best = a == null ? b : b == null ? a : Math.max(a, b);
      var inBlurb = it.blurb && it.blurb.toLowerCase().indexOf(low) !== -1 ? 50 : null;
      var score = best == null ? inBlurb : best + (pinned.indexOf(it.key) !== -1 ? 20 : 0);
      return { it: it, score: score };
    }).filter(function (r) { return r.score != null; })
      .sort(function (x, y) { return y.score - x.score; }).slice(0, 60);
    return pageHits.map(function (p) { return { it: p }; }).concat(scored);
  }

  function render() {
    var epoch = scope + '\n' + palInput.value;
    results = compute().map(function (r) { return r.it ? r : { it: r }; });
    var keys = results.map(function (r) { return r.it.key; });
    // The highlight belongs to an item, not a row number: it stays on the same
    // item while the list changes around it, and a new query starts at the top.
    if (sel.epoch !== epoch || keys.indexOf(sel.key) === -1) sel = { epoch: epoch, key: keys[0] || null };
    palList.innerHTML = '';
    if (!results.length) {
      var li = document.createElement('li');
      li.className = 'pal-empty';
      li.setAttribute('role', 'status');
      li.textContent = 'Nothing matches. Type "go" for the tabs.';
      palList.appendChild(li);
      palInput.removeAttribute('aria-activedescendant');
      return;
    }
    var pinned = readPins();
    results.forEach(function (r, i) {
      var it = r.it;
      var li = document.createElement('li');
      li.id = 'pal-opt-' + i;
      li.className = 'pal-item' + (pinned.indexOf(it.key) === -1 ? '' : ' pinned');
      li.setAttribute('role', 'option');
      li.setAttribute('data-row', String(i));
      li.innerHTML = '<span class="pal-k"></span><span class="pal-cmd"></span><span class="pal-where"></span><span class="pal-blurb"></span>';
      var k = li.querySelector('.pal-k');
      k.textContent = r.recent ? 'recent' : KIND[it.kind];
      k.className = 'pal-k k-' + (r.recent ? 'recent' : it.kind);
      li.querySelector('.pal-cmd').textContent = it.text;
      li.querySelector('.pal-where').textContent = it.kind === 'page' ? 'go to' : it.sub ? it.label + ' / ' + it.sub : it.label;
      li.querySelector('.pal-blurb').textContent = it.blurb;
      if (!it.blurb) li.querySelector('.pal-blurb').remove();
      li.addEventListener('click', function (e) { pick(i); choose(e.shiftKey ? 'chain' : e.altKey ? 'pin' : (e.ctrlKey || e.metaKey) ? 'go' : 'copy'); });
      palList.appendChild(li);
    });
    paintSel();
  }
  function selIndex() { for (var i = 0; i < results.length; i++) if (results[i].it.key === sel.key) return i; return 0; }
  function paintSel() {
    var at = selIndex();
    qs('.pal-item', palList).forEach(function (li, i) { li.setAttribute('aria-selected', String(i === at)); });
    var on = document.getElementById('pal-opt-' + at);
    if (on) { palInput.setAttribute('aria-activedescendant', on.id); on.scrollIntoView({ block: 'nearest' }); }
  }
  function pick(i) {
    if (!results.length) return;
    var at = Math.max(0, Math.min(results.length - 1, i));
    sel.key = results[at].it.key;
    paintSel();
  }

  function goTo(agent, sub, rowId) {
    if (agent) {
      selectAgent(agent, true);
      if (sub) selectSub(agent, sub, true);
    }
    var row = rowId ? document.getElementById(rowId) : null;
    if (row) {
      var d = row.closest('details');
      if (d) d.open = true;
      row.scrollIntoView({ block: 'center' });
      row.classList.remove('landed'); void row.offsetWidth; row.classList.add('landed');
      var chip = row.querySelector('.chip-copy');
      if (chip) chip.focus({ preventScroll: true });
      return;
    }
    // A page with no row to land on: focus its section pill, so the keyboard picks up from there.
    var host = agent && document.getElementById('agent-' + agent);
    var pill = host && qs('.subtab', host).filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (pill) pill.focus({ preventScroll: true });
  }

  function choose(how) {
    var r = results[selIndex()];
    if (!r) return;
    var it = r.it;
    if (it.kind === 'page') { closePal(false); goTo(it.agent, it.sub, ''); return; }
    if (how === 'pin') { togglePin(it.key); render(); return; }
    if (how === 'go') { remember(it.key); closePal(false); goTo(it.agent, it.sub, it.rowId); return; }
    if (how === 'chain') {
      if (!it.el.dataset.step) { say("Built-in commands can't join a chain. Pick a skill or one of its commands.", true); return; }
      remember(it.key);
      addSteps(it.agent, stepsOf(it.el));
      palInput.value = '';
      render();
      return;
    }
    remember(it.key);
    var t = withTarget(it.el, it.text);
    copy(null, t, t);
    closePal(true);
  }

  function palOpen() { return !pal.hidden; }
  // While the palette is up the page behind it is inert, and closing hands
  // focus back to wherever it was.
  var behind = qs('body > .wrap, body > .chain');
  function openPal() {
    if (palOpen()) return;
    returnTo = document.activeElement;
    pal.hidden = false;
    behind.forEach(function (el) { el.setAttribute('inert', ''); });
    palInput.value = '';
    pointer = null;
    sel = { epoch: null, key: null };
    renderScopes();
    render();
    palInput.focus();
  }
  function closePal(restore) {
    pal.hidden = true;
    behind.forEach(function (el) { el.removeAttribute('inert'); });
    if (restore !== false && returnTo && returnTo.focus && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    returnTo = null;
  }

  document.getElementById('cc-open').addEventListener('click', openPal);
  pal.addEventListener('mousedown', function (e) { if (e.target === pal) closePal(); });
  // Rows are picked with the mouse without taking focus from the search box.
  palList.addEventListener('mousedown', function (e) { e.preventDefault(); });
  // A row only takes the highlight when the pointer really moves. A row that
  // slides under a resting pointer (the list filtering or scrolling) must not
  // steal what Enter is about to run.
  palList.addEventListener('mousemove', function (e) {
    var was = pointer;
    pointer = { x: e.clientX, y: e.clientY };
    if (!was || (was.x === e.clientX && was.y === e.clientY)) return;
    var row = e.target.closest && e.target.closest('[data-row]');
    if (row) pick(Number(row.getAttribute('data-row')));
  });
  palInput.addEventListener('input', render);
  palBox.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePal(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      var ids = ['all'].concat(agentPanels.map(function (p) { return p.dataset.agent; }));
      scope = ids[(ids.indexOf(scope) + (e.shiftKey ? ids.length - 1 : 1)) % ids.length];
      renderScopes(); render(); palInput.focus();
    }
  });
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); pick(selIndex() + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick(selIndex() - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(e.shiftKey ? 'chain' : e.altKey ? 'pin' : (e.ctrlKey || e.metaKey) ? 'go' : 'copy'); }
  });
  document.getElementById('cc-kbd').textContent = mac ? 'cmd k' : 'ctrl k';
  qs('[data-alt]').forEach(function (k) { k.textContent = mac ? 'opt' : 'alt'; });
  qs('[data-mod]').forEach(function (k) { k.textContent = mac ? 'cmd' : 'ctrl'; });
  renderPins();

  readOpen().forEach(function (id) {
    var r = document.getElementById(id);
    if (!r || !r.classList.contains('skill-row')) return;
    r.classList.add('open');
    var b = r.querySelector('.uses-toggle');
    if (b) b.setAttribute('aria-expanded', 'true');
  });

  setMode(chainMode);
  renderChainUi();

  // ---- motion ------------------------------------------------------------
  // Decoration only. Everything below respects prefers-reduced-motion, the fx
  // switch turns it off, and nothing here can leave the page half-drawn: an
  // entrance that never got frames is finished by the guard at the bottom.
  var html = document.documentElement;
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var fxBtn = document.getElementById('fx');
  var fxOn = store.get('deck.fx') !== 'off';
  var band = null;
  function applyFx(on) {
    fxOn = on;
    html.classList.toggle('fx-off', !on);
    if (fxBtn) { fxBtn.setAttribute('aria-pressed', String(on)); fxBtn.textContent = on ? 'fx on' : 'fx off'; }
    if (band) band.set(on);
  }
  if (fxBtn) fxBtn.addEventListener('click', function () { store.set('deck.fx', fxOn ? 'off' : 'on'); applyFx(!fxOn); });

  // The first visit in a session gets an entrance: the brand decodes, counts
  // run up and the sections settle in. Later visits just appear.
  var firstVisit = (function () { try { return !sessionStorage.getItem('deck.entered'); } catch (e) { return false; } })();
  if (firstVisit && fxOn && !reduce.matches) {
    html.classList.add('entering');
    setTimeout(function () { html.classList.remove('entering'); }, 1600);
    try { sessionStorage.setItem('deck.entered', '1'); } catch (e) {}
    scramble(document.querySelector('.top h1 span'), 650);
    qs('.tab .n').forEach(function (n) { countUp(n, 700); });
  }

  // Matrix-style reveal: glyphs rain through and lock in left to right. The
  // name rides on aria-label while it moves, and a timer settles it if frames stop.
  function scramble(el, ms) {
    if (!el) return;
    var text = el.textContent, GLYPHS = '01ABCDEFGHKMNXZ#$%&*+=<>/|[]{}', t0 = null;
    el.setAttribute('aria-label', text);
    function step(now) {
      if (t0 == null) t0 = now;
      var t = Math.min(1, (now - t0) / ms), locked = Math.floor(t * text.length), s = '';
      for (var i = 0; i < text.length; i++) s += i < locked || text[i] === ' ' ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = s;
      if (t < 1) requestAnimationFrame(step); else done();
    }
    function done() { el.textContent = text; el.removeAttribute('aria-label'); }
    requestAnimationFrame(step);
    setTimeout(done, ms + 150);
  }
  function countUp(el, ms) {
    var to = Number(el.textContent);
    if (!isFinite(to) || to < 2) return;
    var t0 = null;
    function step(now) {
      if (t0 == null) t0 = now;
      var t = Math.min(1, (now - t0) / ms);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    }
    el.textContent = '0';
    requestAnimationFrame(step);
    setTimeout(function () { el.textContent = String(to); }, ms + 150);
  }

  // A ribbon of particles behind the header, like a sheet of silk turning:
  // brightest along its folded edges, with loose dust around it. Its color is
  // the theme accent. 30fps at most, nothing while the tab is hidden, one still
  // frame under reduced motion, and gone entirely with fx off.
  band = (function () {
    var host = document.querySelector('.top');
    var cv = document.getElementById('band');
    if (!host || !cv || !cv.getContext) return null;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var FRAME = 1000 / 30;
    var W = 0, H = 0, cols = 0, body = [], rims = [], dust = [];
    var raf = 0, last = 0, on = fxOn, still = reduce.matches;
    var rgb = [63, 191, 178], dark = true;
    function rand(a, b) { return a + Math.random() * (b - a); }
    function readColor() {
      var probe = document.createElement('i');
      probe.style.color = 'var(--accent)';
      host.appendChild(probe);
      var m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
      probe.remove();
      if (m) rgb = [Number(m[0]), Number(m[1]), Number(m[2])];
      var g = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
      dark = g ? (Number(g[0]) + Number(g[1]) + Number(g[2])) / 3 < 128 : true;
    }
    function build() {
      var n = Math.min(260, Math.max(80, Math.round(W / 7)));
      if (n === cols) return;
      cols = n; body = []; rims = [];
      for (var i = 0; i < cols; i++) for (var j = 0; j < 12; j++) {
        var u = (j / 11) * 2 - 1 + rand(-0.04, 0.04), rim = Math.pow(Math.abs(u), 3);
        (rim > 0.5 ? rims : body).push({ s: (i + Math.random()) / cols, u: u, rim: rim, jx: rand(-2, 2), jy: rand(-1.5, 1.5), r: rand(0.7, 1.5), tw: rand(0, 6.28) });
      }
      dust = [];
      for (var d = 0; d < 60; d++) dust.push({ x: Math.random(), y: Math.random(), r: rand(0.4, 1.2), v: rand(0.002, 0.007), tw: rand(0, 6.28) });
    }
    function size() {
      W = host.clientWidth; H = host.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!on) ctx.clearRect(0, 0, W, H);
      else if (still) draw(8, 0);
    }
    function draw(t, dt) {
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var lift = dark ? 0.55 : -0.25;
      var mix = function (c) { return Math.round(lift > 0 ? c + (255 - c) * lift : c * (1 + lift)); };
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      var mid = H * 0.55, amp = H * 0.16;
      function silk(list) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i], s = p.s;
          var x = s * (W + 80) - 40 + p.jx;
          var cy = mid + amp * Math.sin(s * 5.6 + t * 0.22) + amp * 0.45 * Math.sin(s * 13.1 - t * 0.37);
          var half = H * 0.26 * (0.55 + 0.45 * Math.sin(s * 9.4 + t * 0.3));
          var twist = Math.cos(s * 12.6 - t * 0.45);
          var face = 0.35 + 0.65 * Math.abs(twist);
          var spark = 0.75 + 0.25 * Math.sin(t * 2.2 + p.tw);
          var fade = Math.min(1, s * 6, (1 - s) * 6);
          ctx.globalAlpha = Math.min(1, (0.2 + 0.8 * p.rim) * face * spark * fade);
          ctx.fillRect(x, cy + p.u * half * twist + p.jy, p.r, p.r);
        }
      }
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      silk(body);
      ctx.fillStyle = 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
      silk(rims);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      for (var k = 0; k < dust.length; k++) {
        var d = dust[k];
        if (!still) { d.x = (d.x + d.v * dt) % 1; d.y = Math.min(1, Math.max(0, d.y + Math.sin(t * 0.6 + d.tw) * 0.02 * dt)); }
        ctx.globalAlpha = 0.12 + 0.22 * Math.pow(Math.sin(t * 1.7 + d.tw), 2);
        ctx.fillRect(d.x * W, d.y * H, d.r, d.r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (last && now - last < FRAME) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      draw(now / 1000, dt);
    }
    function start() { if (!on || still || raf || document.hidden) return; last = 0; raf = requestAnimationFrame(loop); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    if (window.ResizeObserver) new ResizeObserver(size).observe(host);
    else window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    if (reduce.addEventListener) reduce.addEventListener('change', function () { still = reduce.matches; stop(); size(); start(); });
    readColor(); size(); start();
    return {
      set: function (v) { on = v; cv.hidden = !v; stop(); size(); start(); },
      recolor: function () { readColor(); if (still && on) draw(8, 0); }
    };
  })();
  applyFx(fxOn);
  // The band follows the theme accent, including the system switching light or dark.
  if (themeBtn) themeBtn.addEventListener('click', function () { if (band) band.recolor(); });
  if (window.matchMedia) {
    var scheme = window.matchMedia('(prefers-color-scheme: dark)');
    if (scheme.addEventListener) scheme.addEventListener('change', function () { if (band) band.recolor(); });
  }

  // Animation clocks stop in a covered or throttled window, and an entrance
  // that starts from opacity 0 would stay invisible. Once a second this checks
  // that frames still arrive; when one is overdue, every finite animation in
  // flight is taken to its end so the page shows its settled state.
  (function guard() {
    if (!document.getAnimations) return;
    var waiting = false;
    setInterval(function () {
      if (document.hidden) return;
      if (waiting) {
        document.getAnimations().forEach(function (a) {
          try {
            var end = a.effect && a.effect.getComputedTiming().endTime;
            if (a.playState === 'running' && isFinite(Number(end))) a.finish();
          } catch (e) {}
        });
      }
      waiting = true;
      requestAnimationFrame(function () { waiting = false; });
    }, 1000);
  })();

  // #agent or #agent/sub deep links, then remembered tab, then the first one.
  var hash = (location.hash || '').replace(/^#/, '').split('/');
  var params = new URLSearchParams(location.search);
  var start = hash[0] && document.getElementById('agent-' + hash[0]) ? hash[0] : (store.get('deck.agent') || tabs[0].dataset.agent);
  selectAgent(start, false);
  if (hash[1]) selectSub(currentAgent(), hash[1], false);
  if (params.get('q')) { input.value = params.get('q'); applyFilter(); }
  syncHash();
})();
