/* Groundline embeddable chat widget. No dependencies and no build step.

   Embed on any site:
     <script src="https://your-host/widget.js" defer></script>

   Add data-auto="false" to control it from code:
     GroundlineWidget.floating()     launcher button + popup panel
     GroundlineWidget.mount(element) panel rendered inside an element
     GroundlineWidget.open() / close() / toggle() / reset() / destroy()

   It renders inside a Shadow DOM, so host-page CSS can't reach it, and builds
   every node with the DOM API (never innerHTML), so model output can't inject
   markup into the page. */
(function () {
  'use strict';

  var script = document.currentScript;
  var API_ORIGIN = script && script.src ? new URL(script.src).origin : window.location.origin;
  var API = API_ORIGIN + '/api/v1/public';
  var STORAGE_KEY = 'groundline_conversation_v1';
  var active = null;

  var CSS = `
    :host { all: initial; --accent: #0f5c4a; --ink: #14201b; --ink-2: #4e5a54; --ink-3: #6b7671; --line: #e2e6e2;
      --surface: #fff; --tint: #f3f5f2; --danger: #a4302a; font-family: "Instrument Sans Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button, textarea, input { font: inherit; color: inherit; }
    button { cursor: pointer; background: none; border: 0; padding: 0; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; align-items: center; gap: 8px; height: 48px;
      padding: 0 18px 0 14px; border-radius: 24px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600;
      box-shadow: 0 6px 20px rgb(20 32 27 / .22); }
    .launcher:hover { filter: brightness(1.12); }
    .launcher[hidden] { display: none; }
    .launcher svg { width: 20px; height: 20px; }

    .panel { display: flex; flex-direction: column; background: var(--surface); color: var(--ink); font-size: 14px; line-height: 1.5; overflow: hidden; }
    .panel.floating { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; width: 392px; height: min(640px, calc(100dvh - 40px));
      border-radius: 14px; border: 1px solid var(--line); box-shadow: 0 18px 48px rgb(20 32 27 / .2); }
    .panel.floating[hidden] { display: none; }
    .panel.inline { width: 100%; height: 100%; }
    @media (max-width: 480px) {
      .panel.floating { inset: 0; width: 100%; height: 100dvh; border-radius: 0; border: 0; }
    }

    header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--line); flex: none; }
    .who { flex: 1; min-width: 0; }
    .who strong { display: block; font-weight: 600; font-size: 14px; }
    .who span { display: block; color: var(--ink-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .icon-btn { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: var(--ink-2); flex: none; }
    .icon-btn:hover { background: var(--tint); color: var(--ink); }
    .icon-btn svg { width: 17px; height: 17px; }

    .log { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; overscroll-behavior: contain; }
    .msg { max-width: 88%; overflow-wrap: anywhere; }
    .msg.user { align-self: flex-end; background: var(--accent); color: #fff; padding: 8px 12px; border-radius: 12px 12px 3px 12px; white-space: pre-wrap; }
    .msg.bot { align-self: flex-start; background: var(--tint); padding: 9px 12px; border-radius: 12px 12px 12px 3px; }
    .msg.bot p { margin: 0 0 8px; }
    .msg.bot p:last-child { margin-bottom: 0; }
    .msg.bot ul, .msg.bot ol { margin: 0 0 8px; padding-left: 20px; }
    .msg.bot ul:last-child, .msg.bot ol:last-child { margin-bottom: 0; }
    .msg.bot li { margin-bottom: 3px; }
    .msg.bot a { color: var(--accent); text-underline-offset: 2px; }
    .msg.bot code { font-family: ui-monospace, monospace; font-size: 12.5px; }
    .reply { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; align-self: flex-start; max-width: 88%; }
    .reply .msg { max-width: 100%; }
    .rate { display: flex; gap: 2px; }
    .rate button { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; color: var(--ink-3); }
    .rate button:hover { background: var(--tint); color: var(--ink); }
    .rate button[aria-pressed="true"] { color: var(--accent); background: var(--tint); }
    .rate svg { width: 14px; height: 14px; }

    .typing { display: flex; gap: 4px; align-self: flex-start; padding: 12px; background: var(--tint); border-radius: 12px 12px 12px 3px; }
    .typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-3); animation: pulse 1.2s infinite ease-in-out; }
    .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
    @keyframes pulse { 0%, 60%, 100% { opacity: .35; } 30% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .typing i { animation: none; } }

    .notice { align-self: stretch; padding: 10px 12px; border-radius: 8px; border: 1px solid #ecd2cf; background: #fbf3f2; color: var(--danger); font-size: 13px; }
    .notice.ok { border-color: #cfe3da; background: #f0f7f3; color: var(--accent); }
    .notice button { display: block; margin-top: 6px; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }

    .chips { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
    .chip { text-align: left; padding: 6px 11px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; color: var(--ink); background: var(--surface); }
    .chip:hover { border-color: var(--accent); }

    .composer { flex: none; border-top: 1px solid var(--line); padding: 10px 12px 8px; }
    .row { display: flex; align-items: flex-end; gap: 8px; }
    textarea { flex: 1; min-width: 0; resize: none; border: 1px solid var(--line); border-radius: 10px; padding: 8px 11px; max-height: 110px; background: var(--surface); line-height: 1.4; font-size: 16px; }
    @media (min-width: 481px) { textarea { font-size: 14px; } }
    textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    textarea:disabled { background: var(--tint); }
    .send { width: 38px; height: 38px; flex: none; border-radius: 10px; background: var(--accent); color: #fff; display: grid; place-items: center; }
    .send:disabled { opacity: .45; cursor: default; }
    .send svg { width: 17px; height: 17px; }
    .foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 7px; font-size: 11.5px; color: var(--ink-3); }
    .foot button { color: var(--ink-2); font-weight: 500; white-space: nowrap; text-decoration: underline; text-underline-offset: 2px; }

    form.handoff { display: flex; flex-direction: column; gap: 10px; padding: 16px; overflow-y: auto; flex: 1; min-height: 0; }
    form.handoff h3 { margin: 0; font-size: 15px; font-weight: 600; }
    form.handoff p { margin: 0; color: var(--ink-2); font-size: 13px; }
    form.handoff label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; }
    form.handoff input, form.handoff textarea { width: 100%; font-weight: 400; padding: 8px 11px; border: 1px solid var(--line); border-radius: 8px; flex: none; }
    form.handoff input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    form.handoff .err { color: var(--danger); font-weight: 400; font-size: 12px; }
    .actions { display: flex; gap: 8px; margin-top: 4px; }
    .primary { padding: 8px 14px; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 600; }
    .primary:disabled { opacity: .55; }
    .secondary { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); }
  `;

  var ICONS = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5.1A8 8 0 1 1 21 12Z"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    up: '<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2.8a2 2 0 0 0 1.7-1l3.4-5.9A2 2 0 0 1 15 5.9Z"/>',
    down: '<path d="M17 14V3M9 18.1l1-4.1H4.2a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 6.5 3H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2.8a2 2 0 0 0-1.7 1l-3.4 5.9A2 2 0 0 1 9 18.1Z"/>',
  };

  function icon(name) {
    var span = document.createElement('span');
    span.style.display = 'contents';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    // Static, trusted markup from the ICONS table above. No user content.
    svg.innerHTML = ICONS[name];
    span.appendChild(svg);
    return span;
  }

  /** Tiny hyperscript: h('div', { class: 'x', onclick: fn }, child, 'text') */
  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (value === undefined || value === null || value === false) return;
      if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else el.setAttribute(key, value === true ? '' : value);
    });
    for (var i = 2; i < arguments.length; i += 1) {
      var child = arguments[i];
      if (child === undefined || child === null || child === false) continue;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }

  // --- Safe markdown subset → DOM nodes ---------------------------------------

  var INLINE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)|([\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,})|(https?:\/\/[^\s<)]+)/g;

  function appendInline(parent, text) {
    var last = 0;
    var match;
    INLINE.lastIndex = 0;
    while ((match = INLINE.exec(text))) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      var token = match[0];
      if (match[1]) parent.appendChild(h('strong', null, token.slice(2, -2)));
      else if (match[2]) parent.appendChild(h('em', null, token.slice(1, -1)));
      else if (match[3]) parent.appendChild(h('code', null, token.slice(1, -1)));
      else if (match[4]) parent.appendChild(h('a', { href: 'mailto:' + token }, token));
      else {
        var url = token.replace(/[.,;:!?]+$/, '');
        parent.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url));
        if (url.length < token.length) parent.appendChild(document.createTextNode(token.slice(url.length)));
      }
      last = match.index + token.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderMarkdown(target, text) {
    target.textContent = '';
    var list = null;
    var listType = '';
    String(text)
      .split('\n')
      .forEach(function (raw) {
        var line = raw.trim();
        var bullet = /^[-*•]\s+(.*)$/.exec(line);
        var numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        if (bullet || numbered) {
          var type = bullet ? 'ul' : 'ol';
          if (!list || listType !== type) {
            list = h(type);
            listType = type;
            target.appendChild(list);
          }
          var item = h('li');
          appendInline(item, (bullet || numbered)[1]);
          list.appendChild(item);
          return;
        }
        list = null;
        if (line) {
          var p = h('p');
          appendInline(p, line.replace(/^#{1,6}\s+/, ''));
          target.appendChild(p);
        }
      });
  }

  // --- Network ----------------------------------------------------------------

  function storage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }
  function loadSession() {
    try {
      var value = JSON.parse(storage().getItem(STORAGE_KEY));
      return value && value.id && value.visitorToken ? value : null;
    } catch (e) {
      return null;
    }
  }
  function saveSession(session) {
    try {
      if (session) storage().setItem(STORAGE_KEY, JSON.stringify(session));
      else storage().removeItem(STORAGE_KEY);
    } catch (e) {
      /* Private mode: the conversation still works, it just won't survive a reload. */
    }
  }

  function apiError(res, body) {
    var err = new Error((body && body.error && body.error.message) || 'Something went wrong. Please try again.');
    err.status = res.status;
    err.code = body && body.error && body.error.code;
    err.fields = body && body.error && body.error.details && body.error.details.fields;
    return err;
  }

  function request(path, options, session) {
    options = options || {};
    var headers = {};
    if (options.body) headers['Content-Type'] = 'application/json';
    if (session) headers['X-Visitor-Token'] = session.visitorToken;
    return fetch(API + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    }).then(function (res) {
      if (options.raw && res.ok) return res;
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (body) {
          if (!res.ok) throw apiError(res, body);
          return body;
        });
    });
  }

  async function readEvents(response, onEvent) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    for (;;) {
      var chunk = await reader.read();
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      var boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        var block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        var event = /^event: (.*)$/m.exec(block);
        var data = /^data: (.*)$/m.exec(block);
        if (event && data) onEvent(event[1], JSON.parse(data[1]));
      }
    }
  }

  // --- Widget instance --------------------------------------------------------

  function createWidget(mode, container) {
    var state = { config: null, session: loadSession(), busy: false, open: mode === 'inline', pending: null };
    var aborter = null;

    var host = h('div', { 'data-groundline-widget': '' });
    var root = host.attachShadow({ mode: 'open' });
    if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function' && CSSStyleSheet.prototype.replaceSync) {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } else {
      root.appendChild(h('style', null, CSS));
    }

    var title = h('strong', null, 'Support');
    var subtitle = h('span', null, 'Loading…');
    var log = h('div', { class: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
    var input = h('textarea', { rows: '1', placeholder: 'Type your message…', 'aria-label': 'Message', maxlength: '1000' });
    var send = h('button', { class: 'send', 'aria-label': 'Send message', type: 'button' }, icon('send'));
    var note = h('span', null, 'AI assistant');
    var humanLink = h('button', { type: 'button' }, 'Talk to a person');
    var composer = h('div', { class: 'composer' }, h('div', { class: 'row' }, input, send), h('div', { class: 'foot' }, note, humanLink));
    var body = h('div', { style: 'display:contents' }, log, composer);

    var launcher = null;
    var closeBtn = null;
    if (mode === 'floating') {
      closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close chat', type: 'button', onclick: close }, icon('close'));
      launcher = h('button', { class: 'launcher', type: 'button', 'aria-label': 'Open chat', onclick: open }, icon('chat'), 'Ask a question');
      root.appendChild(launcher);
    }
    var header = h(
      'header',
      null,
      h('div', { class: 'who' }, title, subtitle),
      h('button', { class: 'icon-btn', 'aria-label': 'Start a new conversation', title: 'New conversation', type: 'button', onclick: reset }, icon('reset')),
      closeBtn,
    );
    var panel = h('div', { class: 'panel ' + mode, role: mode === 'floating' ? 'dialog' : 'region', 'aria-label': 'Support chat', hidden: mode === 'floating' }, header, body);
    root.appendChild(panel);
    container.appendChild(host);

    send.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    input.addEventListener('input', autoGrow);
    humanLink.addEventListener('click', showHandoff);
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mode === 'floating') close();
    });

    function autoGrow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight + 2, 110) + 'px';
    }
    function scrollDown() {
      log.scrollTop = log.scrollHeight;
    }
    function setBusy(value) {
      state.busy = value;
      send.disabled = value;
      input.disabled = value;
      // Never on page load: an inline widget grabbing focus would pop up a phone's keyboard.
      if (!value && state.open && state.engaged) input.focus({ preventScroll: true });
    }
    function open() {
      state.open = true;
      state.engaged = true;
      panel.hidden = false;
      if (launcher) launcher.hidden = true;
      scrollDown();
      input.focus({ preventScroll: true });
    }
    function close() {
      state.open = false;
      panel.hidden = true;
      if (launcher) {
        launcher.hidden = false;
        launcher.focus();
      }
    }

    function addBot(text, message) {
      var bubble = h('div', { class: 'msg bot' });
      renderMarkdown(bubble, text);
      var wrap = h('div', { class: 'reply' }, bubble);
      log.appendChild(wrap);
      if (message) addRating(wrap, message);
      scrollDown();
      return { wrap: wrap, bubble: bubble };
    }

    function addRating(wrap, message) {
      var value = message.feedback || null;
      function rateButton(name, target, label) {
        var button = h('button', { type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(value === target) }, icon(name));
        button.addEventListener('click', function () {
          var next = value === target ? null : target;
          request('/conversations/' + state.session.id + '/messages/' + message.id + '/feedback', { method: 'POST', body: { value: next } }, state.session)
            .then(function () {
              value = next;
              up.setAttribute('aria-pressed', String(value === 1));
              down.setAttribute('aria-pressed', String(value === -1));
            })
            .catch(function () {
              /* A failed rating isn't worth interrupting the conversation for. */
            });
        });
        return button;
      }
      var up = rateButton('up', 1, 'Helpful');
      var down = rateButton('down', -1, 'Not helpful');
      wrap.appendChild(h('div', { class: 'rate' }, up, down));
    }

    function addNotice(text, retry, ok) {
      var box = h('div', { class: 'notice' + (ok ? ' ok' : ''), role: ok ? 'status' : 'alert' }, text);
      if (retry) {
        box.appendChild(
          h('button', {
            type: 'button',
            onclick: function () {
              box.remove();
              retry();
            },
          }, 'Try again'),
        );
      }
      log.appendChild(box);
      scrollDown();
    }

    function addSuggestions() {
      var list = state.config.suggestions || [];
      if (!list.length || !state.config.available) return;
      var chips = h('div', { class: 'chips' });
      list.forEach(function (text) {
        chips.appendChild(
          h('button', {
            class: 'chip',
            type: 'button',
            onclick: function () {
              input.value = text;
              submit();
            },
          }, text),
        );
      });
      log.appendChild(chips);
      state.chips = chips;
    }

    async function ensureSession() {
      if (state.session) return state.session;
      var created = await request('/conversations', { method: 'POST' });
      state.session = { id: created.id, visitorToken: created.visitorToken };
      saveSession(state.session);
      return state.session;
    }

    function submit() {
      var text = input.value.trim();
      if (!text || state.busy) return;
      state.engaged = true;
      input.value = '';
      autoGrow();
      if (state.chips) {
        state.chips.remove();
        state.chips = null;
      }
      log.appendChild(h('div', { class: 'msg user' }, text));
      scrollDown();
      streamReply(text);
    }

    /** `text` sends a new message. Without it, this retries the unanswered one. */
    async function streamReply(text) {
      setBusy(true);
      var typing = h('div', { class: 'typing', 'aria-label': 'Assistant is typing' }, h('i'), h('i'), h('i'));
      log.appendChild(typing);
      scrollDown();

      var view = null;
      var content = '';
      var started = false;
      var finished = false;
      var scheduled = false;
      aborter = new AbortController();

      function paint() {
        scheduled = false;
        if (view) renderMarkdown(view.bubble, content);
        scrollDown();
      }

      function fail(message, retryable) {
        typing.remove();
        if (view) view.wrap.remove();
        addNotice(
          message,
          retryable
            ? function () {
                // Once the server has stored the message, retry must not store it twice.
                streamReply(started ? undefined : text);
              }
            : null,
        );
      }

      try {
        var session = await ensureSession();
        var path = '/conversations/' + session.id + (text ? '/messages' : '/retry');
        var response = await request(path, { method: 'POST', body: text ? { content: text } : {}, raw: true, signal: aborter.signal }, session);

        await readEvents(response, function (event, data) {
          if (event === 'start') {
            started = true;
          } else if (event === 'delta') {
            if (!view) {
              typing.remove();
              view = addBot('');
            }
            content += data.text;
            if (!scheduled) {
              scheduled = true;
              requestAnimationFrame(paint);
            }
          } else if (event === 'done') {
            finished = true;
            typing.remove();
            if (!view) view = addBot('');
            renderMarkdown(view.bubble, data.message.content);
            addRating(view.wrap, data.message);
            scrollDown();
          } else if (event === 'error') {
            finished = true;
            fail(data.message, data.retryable);
          }
        });
        if (!finished) fail("The connection dropped before the reply finished.", true);
      } catch (err) {
        if (err.name === 'AbortError') {
          typing.remove();
          return;
        }
        // Our stored conversation expired or was deleted: start over cleanly.
        if (err.status === 404 && state.session) {
          state.session = null;
          saveSession(null);
          if (text) return streamReply(text);
        }
        var retryable = !err.status || err.status === 429 || err.status >= 500;
        if (err.code === 'llm_not_configured') retryable = false;
        fail(err.status ? err.message : "Couldn't reach the server. Check your connection and try again.", retryable);
      } finally {
        setBusy(false);
      }
    }

    function showHandoff() {
      var c = state.config;
      if (!c) return;
      var nameErr = h('span', { class: 'err' });
      var emailErr = h('span', { class: 'err' });
      var name = h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: '120' });
      var email = h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, maxlength: '254' });
      var message = h('textarea', { rows: '3', name: 'note', maxlength: '1000', style: 'max-height:none;font-size:inherit' });
      var submitBtn = h('button', { class: 'primary', type: 'submit' }, 'Send request');
      var formError = h('p', { class: 'err', role: 'alert' });

      function restore() {
        form.remove();
        body.style.display = 'contents';
      }

      var form = h(
        'form',
        { class: 'handoff', novalidate: true },
        h('h3', null, 'Talk to a person'),
        h('p', null, 'Share your details and the ' + c.brandName + ' team will follow up by email' + (c.supportHours ? ' (' + c.supportHours + ').' : '.')),
        h('label', null, 'Name', name, nameErr),
        h('label', null, 'Email', email, emailErr),
        h('label', null, 'How can we help? (optional)', message),
        formError,
        h('div', { class: 'actions' }, submitBtn, h('button', { class: 'secondary', type: 'button', onclick: restore }, 'Back to chat')),
      );

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        nameErr.textContent = emailErr.textContent = formError.textContent = '';
        submitBtn.disabled = true;
        try {
          var session = await ensureSession();
          var payload = { name: name.value, email: email.value };
          if (message.value.trim()) payload.note = message.value;
          await request('/conversations/' + session.id + '/handoff', { method: 'POST', body: payload }, session);
          restore();
          addNotice('Thanks, ' + name.value.trim() + '. Your request is with the ' + c.brandName + ' team, and they will reply to ' + email.value.trim() + '.', null, true);
        } catch (err) {
          if (err.fields) {
            nameErr.textContent = err.fields.name || '';
            emailErr.textContent = err.fields.email || '';
          }
          if (!err.fields) formError.textContent = err.status ? err.message : "Couldn't reach the server. Please try again.";
          submitBtn.disabled = false;
        }
      });

      body.style.display = 'none';
      panel.appendChild(form);
      name.focus();
    }

    async function reset() {
      if (aborter) aborter.abort();
      state.session = null;
      saveSession(null);
      log.textContent = '';
      await start();
    }

    async function start() {
      setBusy(true);
      try {
        state.config = await request('/config');
      } catch (err) {
        subtitle.textContent = 'Unavailable';
        log.textContent = '';
        addNotice("Couldn't load the assistant. Check your connection and try again.", start);
        setBusy(false);
        return;
      }

      var c = state.config;
      host.style.setProperty('--accent', c.accentColor);
      title.textContent = c.assistantName + ' · ' + c.brandName;
      subtitle.textContent = 'AI support assistant';
      note.textContent = 'AI assistant. Answers come from ' + c.brandName + ' information.';
      addBot(c.welcomeMessage);

      var resumed = false;
      if (state.session) {
        try {
          var saved = await request('/conversations/' + state.session.id, null, state.session);
          saved.messages.forEach(function (m) {
            if (m.role === 'user') log.appendChild(h('div', { class: 'msg user' }, m.content));
            else addBot(m.content, m);
          });
          resumed = saved.messages.length > 0;
          // The visitor left while a reply was pending: offer to finish it.
          var last = saved.messages[saved.messages.length - 1];
          if (last && last.role === 'user' && c.available) {
            addNotice("This message didn't get a reply.", function () {
              streamReply();
            });
          }
        } catch (err) {
          state.session = null;
          saveSession(null);
        }
      }
      if (!c.available) {
        addNotice('The assistant is offline right now. You can reach the team at ' + c.supportEmail + '.');
        setBusy(false);
        input.disabled = true;
        send.disabled = true;
        return;
      }
      if (!resumed) addSuggestions();
      setBusy(false);
      scrollDown();
    }

    start();

    return {
      open: open,
      close: close,
      toggle: function () {
        if (state.open) close();
        else open();
      },
      reset: reset,
      destroy: function () {
        if (aborter) aborter.abort();
        host.remove();
      },
    };
  }

  function replace(mode, container) {
    if (active) active.destroy();
    active = createWidget(mode, container);
    return active;
  }

  window.GroundlineWidget = {
    floating: function () {
      return replace('floating', document.body);
    },
    mount: function (element) {
      return replace('inline', element);
    },
    open: function () { if (active) active.open(); },
    close: function () { if (active) active.close(); },
    toggle: function () { if (active) active.toggle(); },
    reset: function () { if (active) active.reset(); },
    destroy: function () {
      if (active) active.destroy();
      active = null;
    },
  };

  if (!script || script.getAttribute('data-auto') !== 'false') {
    if (document.body) window.GroundlineWidget.floating();
    else document.addEventListener('DOMContentLoaded', window.GroundlineWidget.floating);
  }
})();
