// Discussion : Claude Code as a conversation, like Claude Desktop, in place of its terminal (kevin-tabs adds this
// pane to every tab whose terminal runs <repo>/claude/gui/bridge.mjs, `claude` in the app, and switches between
// the two). Everything comes from the bridge's files in ~/.cache/claude-gui/<terminal>/ (events.jsonl, state.json)
// and goes back as cmd/*.json: your messages, permissions, questions, plan approval, mode, model, interrupt, quit.
// Keys as in the console: Enter sends, Shift+Enter new line, ↑/↓ your messages, Esc stops (or declines), Ctrl+C
// stops or clears (twice: back to the shell), Shift+Tab cycles the permission mode, Tab completes / and @.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, InputState, Input, ScrollHandle, TextView } from "gpui-base";
import { panes, spaces, window, run, exec, hc, props, home, appHome, readTextFile, writeTextFile, watchFolder, nextCommand } from "herdr";

// The person's spec: text #D4D4D4 on #1E1E1E, secondary #A8ADB5, your bubble #2E3442 under a #82AAFF label,
// the reply's label #E8A06E; 18 px text at zoom 1.2.
const C = { bg: "#1E1E1E", text: "#D4D4D4", subtle: "#A8ADB5", dim: "#7f8490", you: "#82AAFF", youBg: "#2E3442",
  assistant: "#E8A06E", working: "#fab387", blocked: "#f38ba8", ok: "#a6e3a1", input: "#262a33", border: "#3a3f4b",
  card: "#252830", hover: "#ffffff0d", code: "#1a1c22" };
const VERB = { Read: "Lu", Edit: "Modifié", Write: "Écrit", MultiEdit: "Modifié", NotebookEdit: "Modifié", Bash: "Shell",
  Grep: "Cherché", Glob: "Cherché", WebSearch: "Web", WebFetch: "Web", Agent: "Agent", Task: "Agent", Skill: "Skill",
  AskUserQuestion: "Question", TodoWrite: "Tâches", ExitPlanMode: "Plan" };
const MODES = ["default", "acceptEdits", "plan", "auto"]; // Shift+Tab's cycle, as in the console
const MODE = { default: "Demander avant d'agir", acceptEdits: "Accepter les modifications", plan: "Mode plan", auto: "Mode auto",
  bypassPermissions: "Sans permissions", dontAsk: "Ne rien demander" };
const EFFORT = { low: "Faible", medium: "Moyen", high: "Élevé", xhigh: "Très élevé", max: "Max" };
const SHOWN = 40; // the last turns drawn; older ones stay in the session file

// The pace line above the input: the limits read against Kevin's rhythm, 5 days a week, two 5-hour sessions a day
// (8–13 h, 13–18 h), so 10 sessions between two weekly resets. Green: room to push; orange: go easy; red: little
// left at this pace. Numbers only; the colors say the rest.
// Work hours, measured on this PC (boots and shutdowns from journalctl, messages to Claude, Oct.–Nov. 2026):
// Monday to Friday, on at 7:00, off at 15:40 (median), never on weekends. Limits only burn while working, so the
// speeds and projections below count these hours, not the clock.
const WORK = { days: [1, 2, 3, 4, 5], from: 7, to: 15 + 40 / 60 };
const PACE = { good: "#a6e3a1", easy: "#fab387", low: "#f38ba8" };
const H = 3600000;
// Work hours between two times.
function workHours(a, b) {
  let n = 0;
  for (const day = new Date(a); day.setHours(0, 0, 0, 0), day.getTime() < b; day.setDate(day.getDate() + 1)) {
    if (!WORK.days.includes(day.getDay())) continue;
    const start = day.getTime() + WORK.from * H, end = day.getTime() + WORK.to * H;
    n += Math.max(0, Math.min(end, b) - Math.max(start, a)) / H;
  }
  return n;
}
const DAY = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const clock = (ms, now) => { const d = new Date(ms); return (new Date(now).toDateString() === d.toDateString() ? "" : `${DAY[d.getDay()]} `) + when(d.toISOString()); };
// One limit at the speed it has been used since its window opened, in work hours: where it ends at its reset, and
// how many times faster than that it could go without reaching 100 % first. Working off hours, the clock counts.
function pace(kind, l, now = Date.now()) {
  const span = kind === "session" ? 5 * H : 7 * 24 * H;
  let reset = Date.parse(l.resets_at ?? ""), u = Math.min(l.utilization ?? 0, 100);
  // No reset time (the window opens with the next message) or a past one: nothing used, a full window ahead.
  if (!(reset > now)) { reset = now + span; u = 0; }
  const off = workHours(now, now + 60000) === 0;
  const hours = (a, b) => off && kind === "session" ? (b - a) / H : workHours(a, b);
  const done = Math.max(kind === "session" ? 0.5 : 2, hours(reset - span, now)), left = hours(now, reset);
  const spend = u / done * left;
  const end = u + spend, room = spend > 0 ? (100 - u) / spend : Infinity;
  return { used: Math.round(u), end: Math.round(end), at: clock(reset, now), room,
    color: end <= 80 ? PACE.good : end <= 100 ? PACE.easy : PACE.low };
}
const W = 1200;   // the conversation's width

const took = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
const when = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// "claude-opus-5-5[1m]" → "Opus 5.5 · 1M", when the models list has no better name for it.
const pretty = id => {
  const m = String(id ?? "").match(/^(?:claude-)?([a-z]+)-([0-9-]+?)(?:-\d{8})?(\[1m\])?$/);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2].replace(/-/g, ".")}${m[3] ? " · 1M" : ""}` : String(id ?? "");
};
const tilde = s => String(s ?? "").replace(new RegExp(`^${home()}`), "~");
// image() reads only under the app's folder: pasted images (in ~/.cache/claude-gui) through a link in this mod's data.
const pic = f => image(f.replace(`${home()}/.cache/claude-gui/`, "data/claude-chat/gui/"));
const lines = (s, n) => { const l = String(s ?? "").split("\n"); return l.length > n ? [...l.slice(0, n), `… ${l.length - n} lignes de plus`] : l; };

export default class Chat extends View {
  init(_props, cx) {
    this.t = props()?.terminal;
    this.dir = `${home()}/.cache/claude-gui/${this.t}`;
    this.items = []; this.offset = 0; this.bridge = null; this.state = null; this.open = new Set();
    this.scroll = ScrollHandle.new();
    // Following the end: on until the wheel goes up, back once it has come down as far (up = pixels above the
    // end), and on again when a message is sent, a question comes or the agent is shown.
    this.follow = true; this.up = 0;
    // Enter sends, Shift+Enter goes to the next line: the textarea inserts the newline in both cases, then reports
    // the key as a submit carrying Shift; only a submit without Shift sends.
    this.input = TextareaState.new({ placeholder: "Écris ton message…" });
    this.input.set_auto_grow(1, 10);
    this.typed = ""; this.back = -1;
    this.input.on("submit", (e, cx) => { if (!e.shift && !e.secondary) this.send(cx); });
    // Ctrl+V pastes text itself; a paste with no text (an image) lands here and becomes an attachment.
    this.images = [];
    exec("ln", ["-sfn", `${home()}/.cache/claude-gui`, `${appHome()}/data/claude-chat/gui`]);
    this.input.on("paste_other", (_e, cx) => this.pasteImage(cx));
    this.input.on("change", (_e, cx) => {
      const v = this.input.value();
      this.typed = v;
      cx.notify(); // the completion list and the composer's key context follow the text
    });
    // Answers typed in the cards (a refusal's reason, a question's own answer): states live in init, not render.
    this.feedback = InputState.new({ placeholder: "Dire à Claude quoi faire autrement (facultatif)" });
    this.other = [0, 1, 2, 3].map(() => InputState.new({ placeholder: "Autre réponse…" }));
    // The keyboard belongs to the input whenever this Discussion is in front (the window active, its pane the focused
    // one), unless one of its other fields has it: checked often, so a launch, a click beside the input or the window
    // coming back never leaves keys going nowhere. Which field has it comes from their focus and blur events.
    this.field = null;
    [this.input, this.feedback, ...this.other].forEach(f => {
      f.on("focus", () => { this.field = f; });
      f.on("blur", () => { if (this.field === f) this.field = null; });
    });
    cx.timer.every(250, () => this.keepFocus());
    // "focusable" (mod.json): Herdr hands this pane the keyboard with a "focus" command; the input takes it.
    cx.spawn(async (cx) => { for (;;) { if ((await nextCommand()) === "focus" && !this.field) this.input.focus(); cx.notify(); } });
    this.picked = {}; // question → chosen labels
    // The textarea keeps ↑/↓, Tab, Esc and Ctrl+C for itself: these bindings, more specific than its own, take them
    // only in the composer's contexts drawn by render.
    cx.bind_keys([
      { keystroke: "up", action: "chat-older", context: "chat_history > Input" },
      { keystroke: "down", action: "chat-newer", context: "chat_history > Input" },
      { keystroke: "tab", action: "chat-complete", context: "chat_complete > Input" },
      { keystroke: "escape", action: "chat-interrupt", context: "chat_working > Input" },
      { keystroke: "escape", action: "chat-decline", context: "chat_blocked > Input" },
      { keystroke: "ctrl-c", action: "chat-ctrl-c", context: "Composer > Input" },
      { keystroke: "shift-tab", action: "chat-mode", context: "Composer > Input" },
    ]);
    this.refresh(cx);
    cx.timer.every(1000, (cx) => this.refresh(cx)); // a missed folder event costs a second
    this.loadUsage(cx);
    cx.timer.every(60000, (cx) => this.loadUsage(cx));
    cx.spawn(async (cx) => { for (;;) { try { await watchFolder(this.dir); } catch { await exec("sleep", ["1"]); } this.refresh(cx); } });
  }

  // The bridge's state and the conversation's new lines; when the bridge is gone (quit, or never there), this pane
  // closes and the tab shows its shell.
  refresh(cx) {
    if (!this.t || this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const raw = await readTextFile(`${this.dir}/state.json`);
        const st = raw ? JSON.parse(raw) : null;
        if (!st || (await exec("kill", ["-0", String(st.pid)])).code !== 0) {
          const me = this.me(); if (me) run("pane.close", { pane: me.pane });
          this.state = null;
        } else {
          if (st.bridge !== this.bridge) { this.bridge = st.bridge; this.items = []; this.offset = 0; this.bottom(); }
          if (st.pending?.id !== this.state?.pending?.id) this.newPending(st.pending);
          this.state = st;
          // What the conversation gained: its size first, then the bytes from the last read up to it.
          const r = await exec("sh", ["-c", 'f=$1; s=$(stat -c %s "$f"); echo "$s"; tail -c +$(($2 + 1)) "$f" | head -c $((s - $2))',
            "sh", `${this.dir}/events.jsonl`, String(this.offset)]);
          const nl = r.stdout.indexOf("\n"), size = Number(r.stdout.slice(0, nl)), text = r.stdout.slice(nl + 1);
          // A line still being written (no newline at the end yet) waits for the next read.
          if (r.code === 0 && size > this.offset && text.endsWith("\n")) {
            this.items = this.items.concat(text.split("\n").filter(Boolean).map(l => JSON.parse(l)));
            this.offset = size;
          }
          // Asked every second while following, not once: a tall reply is measured a frame or two after it
          // arrives, and asking while the end is already in sight moves nothing.
          this.arrived();
          // Out of the drawing pass, once the input is on screen: focusing it while drawing does nothing.
          if (this.follow) this.stick = true;
          await this.markSeen();
        }
      } catch {}
      this.loading = false;
      cx.notify();
    });
  }

  // Looking at the Discussion is looking at its agent. The app turns an agent's "Fini" back to idle once its latest
  // turn is seen (herdr-core label herdr.seen = turn), which it marks for a terminal shown in the active window;
  // here the terminal is behind this pane, so this pane marks it the same way while it is the one on screen.
  async markSeen() {
    const me = this.me();
    const shown = spaces().find(s => s.active)?.tabs.find(tb => tb.active)?.id;
    if (!window()?.active || !me || me.tab !== shown || !(me.zoomed || me.focused)) return;
    const j = JSON.parse((await hc(["get", this.t, "--json"])).stdout);
    if (j.turn != null && String(j.turn) !== j.labels?.["herdr.seen"]) await hc(["label", this.t, `herdr.seen=${j.turn}`]);
  }

  // Coming to this agent (its tab shown again): its latest message, at the bottom. Checked when drawing (at once)
  // and every second: a hidden pane is not drawn, so only the timer sees it leave the screen.
  arrived() {
    const shown = this.shown();
    if (shown && !this.wasShown) this.bottom();
    this.wasShown = shown;
  }

  keepFocus() {
    if (!this.field && window()?.active && this.me()?.focused && this.shown()) this.input.focus();
  }

  // This pane is on screen: its tab is the active one.
  shown() {
    const me = this.me();
    return Boolean(me) && me.tab === spaces().find(s => s.active)?.tabs.find(tb => tb.active)?.id;
  }

  me() {
    const tab = panes().find(p => p.terminal === this.t)?.tab;
    return panes().find(p => p.mod === "claude-chat" && p.tab === tab);
  }

  // The limits of this terminal's organization (<repo>/bin/claude-usage asks Claude at most every 5 minutes).
  loadUsage(cx) {
    cx.spawn(async (cx) => {
      try {
        this.repo ??= (await exec("readlink", ["-f", `${home()}/.config/herdr-app/mods/claude-chat`])).stdout.trim().replace(/\/herdr-app\/mods\/claude-chat$/, "");
        const r = await exec(`${this.repo}/bin/claude-usage`, [this.t]);
        if (r.code === 0) this.usage = JSON.parse(r.stdout);
      } catch {}
      cx.notify();
    });
  }

  // Can I go? The headline: how many times faster than the speed so far the limits allow (the tighter of the two),
  // green from ×1.5, orange from ×1, red below (a limit is reached before it resets). Then each limit: used now →
  // where it ends at this speed, at its reset. The tooltips say it in words.
  paceLine() {
    const u = this.usage;
    if (!u?.session && !u?.weekly) return null;
    const lims = [["session", "Session", u.session], ["week", "Semaine", u.weekly]].filter(x => x[2]).map(([k, label, l]) => ({ k, label, ...pace(k, l) }));
    const tight = lims.reduce((m, x) => (x.room < m.room ? x : m));
    const f = tight.room, color = f >= 1.5 ? PACE.good : f >= 1 ? PACE.easy : PACE.low;
    const x = f >= 10 ? "10+" : f.toFixed(1).replace(".", ",");
    const hours = `${WORK.from}:00–${Math.floor(WORK.to)}:${String(Math.round(WORK.to % 1 * 60)).padStart(2, "0")}`;
    const tip = f >= 1
      ? `Tu peux aller ${x} fois plus vite que jusqu'ici sans atteindre de limite (la plus serrée : ${tight.label.toLowerCase()}). Heures de travail comptées : lun.–ven. ${hours}.`
      : `À ce rythme, la limite ${tight.label === "Session" ? "de la session" : "de la semaine"} est atteinte avant sa remise à zéro (${tight.at}) : ralentis.`;
    return h_flex().px(4).gap(18).items_center().text_size(11.5)
      .child(h_flex().id("pace").gap(6).items_center().tooltip(tip)
        .child(div().size(8).rounded(4).bg(color))
        .child(div().text_size(13).font_bold().text_color(color).child(`×${x}`)))
      .children(lims.map(p => h_flex().id(`pace-${p.k}`).gap(5).items_center()
        .tooltip(`${p.label} : ${p.used} % utilisés ; au rythme d'ici, ${p.end} % à la remise à zéro (${p.at})`)
        .child(div().text_color(C.subtle).child(p.label))
        .child(div().text_color(C.text).child(`${p.used} %`))
        .child(div().text_color(C.dim).child("→"))
        .child(div().font_medium().text_color(p.color).child(`${Math.min(p.end, 999)} %`))
        .child(div().text_color(C.dim).child(p.at))));
  }

  // Asks the bridge: one file per command, read once then removed.
  command(c) {
    writeTextFile(`${this.dir}/cmd/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`, JSON.stringify(c), null).catch(() => {});
  }

  // The clipboard's image saved next to the conversation (X11, xclip), shown above the input until sent.
  pasteImage(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", 't=$(xclip -selection clipboard -t TARGETS -o | grep -m1 -xE "image/(png|jpeg|gif|webp)") || exit 1; f="$1.${t#image/}"; xclip -selection clipboard -t "$t" -o >"$f" && echo "$f"',
        "sh", `${this.dir}/paste-${Date.now()}`]);
      if (r.code === 0 && r.stdout.trim()) this.images.push(r.stdout.trim());
      cx.notify();
    });
  }

  send(cx) {
    const text = this.input.value().trim(), images = this.images;
    if (!text && !images.length) return;
    this.input.set_value(""); this.typed = ""; this.back = -1; this.images = [];
    this.command({ type: "send", text, images });
    this.bottom();
    cx.notify();
  }

  interrupt(cx) { this.command({ type: "interrupt" }); cx.notify(); }

  // Ctrl+C as in the console: it stops Claude's turn, or clears the input; twice within 2 s it ends the session
  // and gives back the shell that launched it.
  ctrlC(cx) {
    const again = Date.now() - (this.lastCtrlC ?? 0) < 2000;
    this.lastCtrlC = Date.now();
    if (again) { this.command({ type: "quit" }); return; }
    if (this.state?.status === "working") this.interrupt(cx);
    else if (this.input.value()) { this.input.set_value(""); this.typed = ""; this.back = -1; }
    this.hint = "Ctrl+C à nouveau pour quitter Claude";
    cx.notify();
    cx.spawn(async (cx) => { await exec("sleep", ["2"]); if (Date.now() - this.lastCtrlC >= 2000) { this.hint = null; cx.notify(); } });
  }

  cycleMode(cx) {
    const now = this.state?.mode ?? "default";
    const next = MODES[(MODES.indexOf(now) + 1) % MODES.length];
    this.command({ type: "mode", mode: next });
    if (this.state) this.state.mode = next;
    cx.notify();
  }

  // Your messages, newest last: what Up walks back through, while the input is empty or shows one of them.
  mine() { return this.items.filter(it => it.k === "user").map(it => it.text); }
  browsing() { const v = this.input.value(), mine = this.mine(); return !v || v === mine[mine.length - 1 - this.back]; }
  recall(step, cx) {
    const mine = this.mine();
    this.back = Math.max(-1, Math.min(this.back + step, mine.length - 1));
    this.setText(this.back >= 0 ? mine[mine.length - 1 - this.back] : "");
    cx.notify();
  }

  // Completion of a slash command (at the start) or a file (after @), as the console offers them.
  completions() {
    const v = this.input.value();
    const slash = v.match(/^\/([^\s]*)$/);
    if (slash) {
      const w = slash[1].toLowerCase();
      const all = this.state?.commands ?? [];
      const starts = all.filter(c => c.name.toLowerCase().startsWith(w));
      const has = all.filter(c => !c.name.toLowerCase().startsWith(w) && c.name.toLowerCase().includes(w));
      return { kind: "/", items: [...starts, ...has].slice(0, 8).map(c => ({ value: `/${c.name} `, label: `/${c.name}`, note: c.description })) };
    }
    const at = v.match(/(^|\s)@([^\s]*)$/);
    if (at) {
      if (!this.files && !this.filesLoading) this.loadFiles();
      const w = at[2].toLowerCase();
      const items = (this.files ?? []).filter(f => f.toLowerCase().includes(w)).slice(0, 8);
      return { kind: "@", items: items.map(f => ({ value: v.slice(0, v.length - at[2].length - 1) + `@${f} `, label: f })) };
    }
    return null;
  }
  loadFiles() {
    this.filesLoading = true;
    const cwd = this.state?.cwd;
    exec("git", ["-C", cwd, "ls-files", "--cached", "--others", "--exclude-standard"]).then(r => {
      this.files = r.code === 0 ? r.stdout.split("\n").filter(Boolean).slice(0, 50000) : [];
      if (r.code !== 0) return exec("find", [cwd, "-maxdepth", "3", "-type", "f", "-not", "-path", "*/.*"]).then(f => {
        this.files = f.stdout.split("\n").filter(Boolean).map(p => p.slice(cwd.length + 1));
      });
    }).catch(() => { this.files = []; });
  }
  complete(item, cx) { this.setText(item.value); this.input.focus(); cx.notify(); }
  // Replaces the input's text, the cursor at its end as after typing it.
  setText(v) { this.input.set_value(v); this.input.set_selected_range({ start: v.length, end: v.length }); this.typed = v; }

  // A new question or permission: its own answers start empty.
  newPending(p) {
    this.feedback.set_value(""); this.other.forEach(s => s.set_value("")); this.picked = {}; this.choice = null;
    if (p) this.bottom();
  }
  bottom() { this.follow = true; this.up = 0; this.stick = true; }
  answer(c) { this.command({ type: "answer", id: this.state.pending.id, ...c }); }
  decline(stop) { this.answer({ behavior: "deny", message: this.feedback.value().trim() || undefined, stop }); }

  // ——— Drawing ———

  // Items into turns: your message, then Claude's texts and actions until the next one.
  turns() {
    const turns = [];
    for (const it of this.items) {
      if (it.k === "user" || !turns.length) turns.push({ user: null, texts: [], tools: [], end: null });
      const turn = turns.at(-1);
      if (it.k === "user") turn.user = it;
      else if (it.k === "text") turn.texts.push(it);
      else if (it.k === "tool") turn.tools.push(it);
      else if (it.k === "end") turn.end = it;
    }
    return turns.slice(-SHOWN);
  }

  bubble(u, i) {
    return v_flex().id(`u-${i}`).w_full().px(18).py(13).gap(4).rounded(6).bg(C.youBg)
      .child(div().text_size(11.5).font_medium().text_color(C.you).child("Toi"))
      .when(Boolean(u.images?.length), el => el.child(h_flex().gap(6).flex_wrap()
        .children(u.images.map(f => f ? pic(f).max_h(160).max_w(260).rounded(6)
          : div().px(8).py(3).rounded(5).bg(C.input).text_size(11.5).text_color(C.subtle).child("Image")))))
      // As written (no Markdown), and selectable like the replies.
      .when(Boolean(u.text), el => el.child(div().text_color(C.text).child(TextView.html(`you-${u.at ?? i}`,
        u.text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/\n/g, "<br>")).selectable(true))));
  }

  // "▸ 4 actions · 2 min 3 s · 11:47", one line per action once unfolded.
  actions(turn, key) {
    const n = turn.tools.length, isOpen = this.open.has(key);
    const meta = [...(n ? [`${n} action${n > 1 ? "s" : ""}`] : []), ...(turn.end ? [took(turn.end.ms), when(turn.end.at)] : []),
      ...(turn.end?.error ? ["interrompu"] : [])].join(" · ");
    return v_flex().gap(3)
      .child(h_flex().id(`a-${key}`).gap(6).items_center().text_size(11.5).text_color(C.subtle).cursor_pointer()
        .hover(s => s.text_color(C.text))
        .on_click((_e, cx) => { if (!n) return; isOpen ? this.open.delete(key) : this.open.add(key); cx.notify(); })
        .when(n > 0, el => el.child(isOpen ? "▾" : "▸")).child(meta))
      .when(isOpen, el => el.children(turn.tools.map((a, j) => h_flex().id(`t-${key}-${j}`).gap(10).pl(16).text_size(11.5)
        .child(div().w(62).flex_none().text_color(C.subtle).child(VERB[a.name] ?? a.name))
        .child(div().flex_1().min_w(0).truncate().text_color(C.text).child(tilde(a.label)))
        .when(a.plus != null, el => el.child(div().flex_none().text_color(C.ok).child(`+${a.plus}`)))
        .when(a.minus != null, el => el.child(div().flex_none().text_color(C.blocked).child(`−${a.minus}`))))));
  }

  reply(turn, i, last) {
    const st = this.state, working = last && st?.status === "working";
    const key = `${this.bridge}-${i}`;
    // The reply being written shows until its finished text reaches the conversation.
    const live = last && st?.live?.text && !turn.texts.some(x => x.id === st.live.id) ? st.live.text : null;
    const text = live ?? turn.texts.at(-1)?.text;
    const doing = st?.live?.tool ?? turn.tools.at(-1)?.name;
    // The main agent's turn is over but background agents still work (bridge: bg.agents): what it waits for.
    const bg = working && turn.end && !st.live && st.bg?.agents > 0 ? `${st.bg.agents} sous-agent${st.bg.agents > 1 ? "s" : ""} en cours…` : null;
    return v_flex().w_full().gap(10)
      .child(div().text_size(11.5).font_medium().text_color(C.assistant).child("✦ Assistant"))
      .when((turn.tools.length > 0 || turn.end) && !working, el => el.child(this.actions(turn, key)))
      .when(Boolean(text), el => el.child(TextView.markdown(`m-${key}-${live ? "live" : "done"}`, text).selectable(true)))
      .when(working, el => el.child(h_flex().gap(8).items_center().text_size(11.5).text_color(C.working)
        .child(svg("mods/workspace-chrome/spinner.svg").size(12).text_color(C.working).spin(900))
        .child(div().truncate().child(bg ?? (doing ? `${VERB[doing] ?? doing}…` : live ? "Claude écrit…" : "Claude réfléchit…")))));
  }

  button(id, label, color, action, solid) {
    return div().id(id).px(12).py(6).rounded(7).flex_none().text_size(12.5).font_medium().cursor_pointer()
      .bg(solid ? color : color + "22").text_color(solid ? "#1e1e2e" : color).hover(s => s.bg(solid ? color : color + "38"))
      .on_click((_e, cx) => { action(); cx.notify(); }).child(label);
  }
  // Code or a file's text; a diff (Edit's old and new text) in red and green.
  code(textLines, diff) {
    return v_flex().w_full().px(12).py(8).rounded(6).bg(C.code).text_size(11.5).font_family("Geist Mono")
      .children(textLines.map(l => div().text_color(diff && l.startsWith("+ ") ? C.ok : diff && l.startsWith("- ") ? C.blocked : C.text).child(l || " ")));
  }

  // What the tool is about to do, from its input: the command, the file and its change, the address…
  what(p) {
    const i = p.input ?? {};
    const head = p.title ?? ({ Bash: "Exécuter une commande", Edit: `Modifier ${tilde(i.file_path)}`, MultiEdit: `Modifier ${tilde(i.file_path)}`,
      Write: `Écrire ${tilde(i.file_path)}`, Read: `Lire ${tilde(i.file_path)}`, WebFetch: `Ouvrir ${i.url}`, WebSearch: `Chercher « ${i.query} »`,
      NotebookEdit: `Modifier ${tilde(i.notebook_path)}` }[p.tool] ?? `Utiliser ${p.displayName ?? p.tool}`);
    const body = p.tool === "Bash" ? lines(i.command, 20)
      : p.tool === "Edit" ? [...lines(i.old_string, 12).map(l => `- ${l}`), ...lines(i.new_string, 12).map(l => `+ ${l}`)]
      : p.tool === "Write" ? lines(i.content, 15)
      : ["Read", "WebFetch", "WebSearch"].includes(p.tool) ? []
      : lines(JSON.stringify(i, null, 2), 15);
    return { head, body, diff: p.tool === "Edit", sub: p.tool === "Bash" ? i.description : p.description };
  }

  // A permission: allow once, the console's "always" choices (its suggestions), or decline with a reason.
  permission(p) {
    const w = this.what(p);
    const always = (p.suggestions ?? []).map((s, k) => {
      const label = s.type === "setMode" ? `Oui, et ${MODE[s.mode]?.toLowerCase() ?? s.mode} pour la session`
        : s.type === "addRules" ? `Oui, toujours pour ${s.rules.map(r => r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName).join(", ")}${s.destination === "session" ? " (session)" : ""}`
        : s.type === "addDirectories" ? `Oui, et autoriser ${s.directories.map(tilde).join(", ")}` : null;
      return label && this.button(`al-${k}`, label, C.ok, () => this.answer({ behavior: "allow", updatedPermissions: [s] }));
    }).filter(Boolean);
    const yes = this.button("allow", "Oui", C.ok, () => this.answer({ behavior: "allow" }), true);
    const no = this.button("deny", "Non", C.blocked, () => this.decline(false));
    return this.card("⚠ Autorisation", C.blocked, v_flex().gap(10)
      .child(div().font_medium().text_color(C.text).child(w.head))
      .when(Boolean(w.sub), el => el.child(div().text_size(12.5).text_color(C.subtle).child(w.sub)))
      .when(w.body.length > 0, el => el.child(this.code(w.body, w.diff)))
      .when(Boolean(p.reason), el => el.child(div().text_size(11.5).text_color(C.dim).child(p.reason)))
      .child(div().h(32).px(10).rounded(6).flex().items_center().bg(C.input).border_1().border_color(C.border)
        .child(Input.new(this.feedback).w_full().text_size(12.5).text_color(C.text)))
      .child(h_flex().gap(8).flex_wrap().children(p.defaultToNo ? [no, yes, ...always] : [yes, ...always, no])));
  }

  // A question (AskUserQuestion): its options as choices, an answer of one's own, then send.
  question(p) {
    const qs = p.input?.questions ?? [];
    const answerOf = (q, k) => this.other[k].value().trim() || (this.picked[q.question] ?? []).join(", ");
    const ready = qs.every((q, k) => answerOf(q, k));
    return this.card("? Question", C.you, v_flex().gap(16)
      .children(qs.map((q, k) => v_flex().gap(8)
        .child(h_flex().gap(8).items_center()
          .child(div().px(7).py(1).rounded(4).text_size(11).bg(C.you + "26").text_color(C.you).child(q.header))
          .child(div().flex_1().font_medium().text_color(C.text).child(q.question)))
        .children(q.options.map((o, j) => {
          const on = (this.picked[q.question] ?? []).includes(o.label);
          return v_flex().id(`o-${k}-${j}`).px(12).py(8).gap(2).rounded(7).cursor_pointer()
            .bg(on ? C.you + "26" : C.input).border_1().border_color(on ? C.you : C.border).hover(s => s.bg(C.you + "1a"))
            .on_click((_e, cx) => {
              const cur = this.picked[q.question] ?? [];
              this.picked[q.question] = q.multiSelect ? (on ? cur.filter(x => x !== o.label) : [...cur, o.label]) : [o.label];
              this.other[k].set_value(""); cx.notify();
            })
            .child(div().text_color(C.text).child(`${q.multiSelect ? (on ? "☑" : "☐") : on ? "●" : "○"}  ${o.label}`))
            .when(Boolean(o.description), el => el.child(div().pl(20).text_size(11.5).text_color(C.subtle).child(o.description)))
            .when(on && Boolean(o.preview), el => el.child(div().pt(6).child(this.code(lines(o.preview, 30)))));
        }))
        .child(div().h(32).px(10).rounded(6).flex().items_center().bg(C.input).border_1().border_color(C.border)
          .child(Input.new(this.other[k]).w_full().text_size(12.5).text_color(C.text)))))
      .child(h_flex().gap(8)
        .child(this.button("q-send", "Envoyer", ready ? C.you : C.dim, () => {
          if (ready) this.answer({ behavior: "allow", answers: Object.fromEntries(qs.map((q, k) => [q.question, answerOf(q, k)])) });
        }, true))
        .child(this.button("q-skip", "Ne pas répondre", C.subtle, () => this.decline(false)))));
  }

  // The end of plan mode (ExitPlanMode): the plan, then go with edits accepted, go asking each time, or keep planning.
  plan(p) {
    return this.card("◆ Plan", C.assistant, v_flex().gap(10)
      .child(TextView.markdown(`plan-${p.id}`, String(p.input?.plan ?? "")).selectable(true))
      .child(div().h(32).px(10).rounded(6).flex().items_center().bg(C.input).border_1().border_color(C.border)
        .child(Input.new(this.feedback).w_full().text_size(12.5).text_color(C.text)))
      .child(h_flex().gap(8).flex_wrap()
        .child(this.button("p-auto", "Oui, et accepter les modifications", C.ok, () => this.answer({ behavior: "allow", mode: "acceptEdits" }), true))
        .child(this.button("p-ask", "Oui, en demandant avant chaque modification", C.ok, () => this.answer({ behavior: "allow", mode: "default" })))
        .child(this.button("p-no", "Non, continuer à planifier", C.blocked, () => this.decline(false)))));
  }

  card(title, color, body) {
    return v_flex().w_full().p(16).gap(12).rounded(10).bg(C.card).border_1().border_color(color + "66")
      .child(div().text_size(11.5).font_medium().text_color(color).child(title)).child(body);
  }

  composer(st) {
    const working = st?.status === "working", blocked = st?.status === "blocked";
    const comp = this.completions();
    const context = ["Composer", this.browsing() && "chat_history", working && "chat_working", blocked && "chat_blocked",
      comp?.items.length && "chat_complete"].filter(Boolean).join(" ");
    this.firstCompletion = comp?.items[0];
    const mode = st?.mode ?? "default";
    return v_flex().w_full().max_w(W).gap(6)
      .when(Boolean(comp?.items.length), el => el.child(v_flex().w_full().p(6).gap(1).rounded(8).bg(C.card).border_1().border_color(C.border)
        .children(comp.items.map((c, k) => h_flex().id(`c-${k}`).px(10).py(5).gap(12).rounded(6).cursor_pointer()
          .when(k === 0, el => el.bg(C.hover)).hover(s => s.bg(C.hover)).on_click((_e, cx) => this.complete(c, cx))
          .child(div().flex_none().text_color(C.text).font_medium().child(c.label))
          .when(Boolean(c.note), el => el.child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(C.subtle).child(c.note)))))))
      .when(Boolean(this.models && st), el => el.child(this.modelList(st)))
      .when(Boolean(this.hint), el => el.child(div().px(4).text_size(11.5).text_color(C.subtle).child(this.hint)))
      .when(Boolean(this.usage?.session || this.usage?.weekly), el => el.child(this.paceLine()))
      // Pasted images, sent with the next message; × takes one back.
      .when(this.images.length > 0, el => el.child(h_flex().gap(8).flex_wrap().children(this.images.map((f, k) =>
        div().id(`img-${k}`).relative().child(pic(f).h(64).max_w(120).rounded(6).border_1().border_color(C.border))
          .child(div().id(`img-x-${k}`).absolute().top(-6).right(-6).size(18).rounded(9).bg(C.card).border_1().border_color(C.border)
            .flex().items_center().justify_center().text_size(11).text_color(C.subtle).cursor_pointer().hover(s => s.text_color(C.text))
            .tooltip("Retirer l'image").on_click((_e, cx) => { this.images.splice(k, 1); cx.notify(); }).child("×"))))))
      // A click anywhere in the box, not only on the text, puts the cursor in the input.
      .child(h_flex().id("composer").on_click(() => this.input.focus()).w_full().min_h(46).px(14).py(8).gap(10).rounded(10).items_end().bg(C.input).border_1().border_color(C.border)
        .key_context(context)
        .on_action("chat-older", (_e, cx) => this.recall(1, cx))
        .on_action("chat-newer", (_e, cx) => this.recall(-1, cx))
        .on_action("chat-complete", (_e, cx) => { if (this.firstCompletion) this.complete(this.firstCompletion, cx); })
        .on_action("chat-interrupt", (_e, cx) => this.interrupt(cx))
        .on_action("chat-decline", (_e, cx) => { if (this.state?.pending) this.decline(true); cx.notify(); })
        .on_action("chat-ctrl-c", (_e, cx) => this.ctrlC(cx))
        .on_action("chat-mode", (_e, cx) => this.cycleMode(cx))
        .child(div().flex_1().min_w(0).self_center().child(Textarea.new(this.input).w_full().text_size(13.5).text_color(C.text)))
        // While Claude works, the button stops it (as Esc); otherwise it sends.
        .child(working
          ? div().id("stop").size(30).flex_none().rounded(8).flex().items_center().justify_center().bg(C.blocked + "33")
            .cursor_pointer().hover(s => s.bg(C.blocked + "55")).tooltip("Interrompre (Échap, Ctrl+C)")
            .on_click((_e, cx) => this.interrupt(cx)).child(div().size(12).rounded(2).bg(C.blocked))
          : div().id("send").size(30).flex_none().rounded(8).flex().items_center().justify_center().bg(C.assistant)
            .text_color("#1e1e2e").font_bold().cursor_pointer().on_click((_e, cx) => this.send(cx)).child("↑")))
      // Under it, as the console's bottom line: the permission mode (Shift+Tab), then the model and its effort.
      .child(h_flex().px(4).gap(14).items_center().text_size(11.5).text_color(C.subtle)
        .child(h_flex().id("mode").gap(5).cursor_pointer().hover(s => s.text_color(C.text)).on_click((_e, cx) => this.cycleMode(cx))
          .child(div().text_color(mode === "default" ? C.subtle : C.working).child(`⏵⏵ ${MODE[mode] ?? mode}`)).child(div().text_color(C.dim).child("Maj+Tab")))
        .child(div().flex_1())
        .when(Boolean(st), el => el.child(this.engine(st))));
  }

  // The model and its effort, in sight under the input on the right: the model opens its list, the effort is one click.
  current(st) {
    const base = String(st.model ?? "").replace(/\[1m\]$/, "");
    const cur = (st.models ?? []).find(m => m.value !== "default" && (m.resolved === base || m.value === st.model || m.value === base));
    const long = /\[1m\]$/.test(st.model ?? "") ? " · 1M" : "";
    const name = st.model ? (cur?.name && !/default/i.test(cur.name) ? cur.name + long : pretty(st.model)) : "Modèle par défaut";
    return { cur, name, levels: cur?.efforts?.length ? cur.efforts : Object.keys(EFFORT) };
  }
  engine(st) {
    const { name, levels } = this.current(st);
    return h_flex().gap(10).items_center()
      // Redline (review of a merge request) on this tab's repo
      .child(div().id("redline").size(24).rounded(7).flex().items_center().justify_center().cursor_pointer()
        .bg(C.input).border_1().border_color(C.border).font_bold().text_color(C.subtle)
        .hover(s => s.border_color(C.assistant).text_color(C.text)).tooltip("Redline : revue de merge request (Ctrl+Maj+G)")
        .on_click(() => run("mod.open", { name: "redline" })).child("R"))
      .child(h_flex().id("model").h(24).px(10).gap(6).rounded(7).items_center().cursor_pointer().bg(C.input).border_1().border_color(C.border)
        .hover(s => s.border_color(C.assistant)).on_click((_e, cx) => { this.models = !this.models; cx.notify(); })
        .child(div().font_medium().text_color(C.text).child(name))
        .child(div().text_color(C.dim).child(this.models ? "▴" : "▾")))
      .child(h_flex().p(2).gap(2).rounded(7).bg(C.input).border_1().border_color(C.border)
        .tooltip(st.effort ? "Effort de raisonnement" : "Effort de raisonnement : connu après le premier tour")
        .children(levels.map(l => {
          const on = st.effort === l;
          return div().id(`ef-${l}`).px(8).h(20).flex().items_center().rounded(5).cursor_pointer()
            .bg(on ? C.assistant : C.input).text_color(on ? "#1e1e2e" : C.subtle).when(on, el => el.font_medium())
            .hover(s => s.text_color(on ? "#1e1e2e" : C.text))
            .on_click((_e, cx) => { this.command({ type: "effort", effort: l }); st.effort = l; cx.notify(); })
            .child(EFFORT[l] ?? l);
        })));
  }
  modelList(st) {
    const { cur } = this.current(st);
    return v_flex().w_full().p(6).gap(1).rounded(8).bg(C.card).border_1().border_color(C.border)
      .children((st.models ?? []).filter(m => m.value !== "default").map((m, k) => h_flex().id(`mo-${k}`).px(10).py(5).gap(12).rounded(6).cursor_pointer()
        .when(m === cur, el => el.bg(C.hover)).hover(s => s.bg(C.hover))
        .on_click((_e, cx) => { this.command({ type: "model", model: m.value }); this.models = false; cx.notify(); })
        .child(div().flex_none().w(150).text_color(C.text).child(m.name ?? m.value))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(C.subtle).child(m.description ?? ""))));
  }

  render() {
    const st = this.state;
    if (!st) return v_flex().size_full().bg(C.bg);
    const turns = this.turns();
    const p = st.pending;
    this.arrived();
    // New lines: down to the end (a spacer after the last turn, so a tall turn shows its bottom).
    if (this.stick) { this.stick = false; this.scroll.scroll_to_item(turns.length + 1); }
    return v_flex().size_full().bg(C.bg).text_color(C.text).text_size(13.5)
      .child(v_flex().id("chat-scroll").flex_1().min_h(0).overflow_y_scroll().track_scroll(this.scroll).py(20)
        // GPUI's wheel delta: y > 0 scrolls up
        .on_scroll_wheel((e) => { this.up = Math.max(0, this.up + e.delta.y); this.follow = this.up <= 0; })
        .children(turns.map((turn, i) => h_flex().id(`turn-${i}`).w_full().justify_center().px(14)
          .child(v_flex().w_full().max_w(W).gap(26).pb(30)
            .when(Boolean(turn.user), el => el.child(this.bubble(turn.user, i)))
            .when(turn.texts.length > 0 || turn.tools.length > 0 || turn.end || i === turns.length - 1 && (st.status === "working" || st.live?.text),
              el => el.child(this.reply(turn, i, i === turns.length - 1))))))
        .child(h_flex().w_full().justify_center().px(14)
          .child(v_flex().w_full().max_w(W)
            .when(Boolean(p), el => el.child(p.kind === "question" ? this.question(p) : p.kind === "plan" ? this.plan(p) : this.permission(p)))
            .when(Boolean(st.error), el => el.child(div().pt(10).text_size(11.5).text_color(C.blocked).child(st.error)))))
        .child(div().h(1)))
      .child(h_flex().w_full().justify_center().px(14).pb(14).child(this.composer(st)));
  }
}
