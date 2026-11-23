// Claude Code for the Herdr app's Discussion view (herdr-app/mods/claude-chat): runs in the terminal in place of
// the console, through the official Agent SDK on the installed Claude Code (same version, settings, hooks,
// plugins, output style and sessions as the console), and talks to the view through files in
// ~/.cache/claude-gui/<terminal>/:
//   events.jsonl  the conversation, one item per line (history first, then as it happens):
//                 {k:"user", text, images, at} {k:"text", text, id} {k:"tool", name, label, id, plus?, minus?} {k:"end", ms, at, error?}
//   state.json    what is live: status, mode, model, the reply being written, the pending question or permission,
//                 background work (bg: sub-agents and shells), slash commands and models (rewritten as it changes)
//   cmd/*.json    what the view asks: send, interrupt, answer, mode, model, effort, quit (each file read once, then removed)
// It reports its status to Herdr like the console does (OSC 7501), so the agents list keeps working.
//   node bridge.mjs [--resume [<id> | <search>] | --continue] [--model <m>] [--permission-mode <m>] [prompt]
// Needs its node_modules: `npm install` here (install.sh does it).
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

const t = process.env.HC_TERMINAL_ID;
if (!t) { console.error("claude-gui: only inside the Herdr app (HC_TERMINAL_ID); use `claude --tui` elsewhere."); process.exit(2); }
process.title = "claude-gui";

// Arguments: the few the console takes for a session; anything else is the console's (zsh/claude.zsh checks).
const args = process.argv.slice(2);
const opt = { prompt: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--resume" || a === "-r") opt.resume = args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : "";
  else if (a === "--continue" || a === "-c") opt.continue = true;
  else if (a === "--model") opt.model = args[++i];
  else if (a === "--permission-mode") opt.mode = args[++i];
  else opt.prompt.push(a);
}

const dir = path.join(os.homedir(), ".cache", "claude-gui", t);
const cmdDir = path.join(dir, "cmd");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(cmdDir, { recursive: true });
const eventsFile = path.join(dir, "events.jsonl");
fs.writeFileSync(eventsFile, "");

// The console's own binary, not the SDK's bundled one: same version as `claude --tui`.
const exe = fs.realpathSync(execFileSync("sh", ["-c", "command -v claude"], { encoding: "utf8" }).trim());

// --continue as the console does it: the most recent conversation of this folder, resumed by its id (so its
// history shows before anything is sent).
const projects = path.join(os.homedir(), ".claude", "projects");
const own = path.join(projects, process.cwd().replace(/[^a-zA-Z0-9]/g, "-"));
const sessions = () => fs.existsSync(own) ? fs.readdirSync(own).filter(f => f.endsWith(".jsonl"))
  .map(f => ({ id: f.slice(0, -6), file: path.join(own, f), at: fs.statSync(path.join(own, f)).mtimeMs })).sort((a, b) => b.at - a.at) : [];
if (opt.continue) opt.resume = sessions()[0]?.id;

// --resume without a session id (or with words to search for), as the console's picker: this folder's
// conversations, newest first, by their title (or first request); pick one by its number.
if (opt.resume !== undefined && !sessions().some(x => x.id === opt.resume)) {
  const words = opt.resume.toLowerCase();
  const title = x => {
    let t = "";
    try { t = execFileSync("grep", ["-h", "-m", "200", "-E", '"type":"(custom-title|ai-title)"', x.file], { encoding: "utf8" }); } catch {}
    const last = t.trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).at(-1);
    return last?.customTitle ?? last?.aiTitle ?? null;
  };
  const list = sessions().slice(0, 40).map(x => ({ ...x, title: title(x) ?? "(sans titre)" }))
    .filter(x => !words || x.title.toLowerCase().includes(words) || x.id.startsWith(words)).slice(0, 20);
  if (!list.length) { console.log(`Aucune conversation${words ? ` pour « ${opt.resume} »` : ""} dans ce dossier.`); process.exit(1); }
  console.log("Reprendre une conversation :\n");
  list.forEach((x, k) => console.log(`  ${String(k + 1).padStart(2)}  ${new Date(x.at).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })}  ${x.title}`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const n = Number((await rl.question("\nNuméro (Entrée : 1, q : annuler) : ")).trim() || 1);
  rl.close();
  if (!(n >= 1 && n <= list.length)) process.exit(0);
  opt.resume = list[n - 1].id;
}

// The mode shown before the first turn tells it: --permission-mode, else the user settings' defaultMode.
const userMode = () => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")).permissions?.defaultMode ?? null; } catch { return null; } };
const state = {
  bridge: `${process.pid}-${Date.now()}`, pid: process.pid, cwd: process.cwd(), sid: opt.resume ?? null,
  status: "idle", mode: opt.mode ?? userMode(), model: null, live: null, pending: null, commands: [], models: [], error: null,
  // effort: the level a turn really ran at (hooks' effort.level), or the one chosen since; unknown before
  // (settings.json's effortLevel is not what runs: Claude Code picks per model and per turn)
  effort: null,
  // Background work from Claude Code's own list (background_tasks_changed): agents (sub-agents, workflows) keep the
  // session working, shells (a server, a watch) run on without holding it. Watchers that are not work are left out.
  bg: { agents: 0, shells: 0 },
};
// Claude Code's session state (session_state_changed): "idle" only once the turn is over and no background agent
// is still at work, so "done" waits for it rather than for the main agent's result. null: a CLI that sends none.
let session = null;
let writing = null;
function save(now = false) {
  if (writing && !now) return;
  clearTimeout(writing);
  writing = setTimeout(() => {
    writing = null;
    const tmp = path.join(dir, ".state.json");
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, path.join(dir, "state.json"));
  }, now ? 0 : 80);
}
const emit = item => fs.appendFileSync(eventsFile, JSON.stringify(item) + "\n");

// Herdr's agent status, in the console's own words (OSC 7501 PROGRAM_STATUS): working, blocked (kind), done.
function report(status, kind) {
  state.status = status;
  process.stdout.write(`\x1b]7501;state=${status}:app=claude-code${kind ? `:kind=${kind}` : ""}\x07`);
  save();
}

// History of a resumed session, from its transcript: what the console showed, turn ends from the timestamps.
const firstLine = s => typeof s === "string" && !s.startsWith("<") && !s.startsWith("This session is being continued") && !s.startsWith("[Request interrupted");
function label(i) {
  const v = i.file_path ?? i.notebook_path ?? i.description ?? i.command ?? i.pattern ?? i.url ?? i.query ?? i.skill ?? i.prompt ?? "";
  return String(v).replace(/\n/g, " ").slice(0, 160);
}
function tool(b) {
  const item = { k: "tool", name: b.name, label: label(b.input ?? {}), id: b.id };
  if (b.name === "Edit") Object.assign(item, { minus: String(b.input.old_string ?? "").split("\n").length, plus: String(b.input.new_string ?? "").split("\n").length });
  if (b.name === "Write") item.plus = String(b.input.content ?? "").split("\n").length;
  return item;
}
function history(sid) {
  const f = fs.readdirSync(projects).map(p => path.join(projects, p, `${sid}.jsonl`)).find(p => fs.existsSync(p));
  if (!f) return;
  let turnAt = null, lastAt = null, open = false;
  const close = () => { if (open && turnAt && lastAt) emit({ k: "end", ms: Date.parse(lastAt) - Date.parse(turnAt), at: lastAt }); open = false; };
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.isSidechain) continue;
    let user = null, images = [];
    if (e.type === "user" && !e.isMeta) {
      const c = e.message?.content;
      user = typeof c === "string" ? c : Array.isArray(c) ? c.filter(b => b.type === "text").map(b => b.text).join("\n") : "";
      // pasted images: their files are gone, the view shows a placeholder for each
      images = Array.isArray(c) ? c.filter(b => b.type === "image").map(() => null) : [];
      if (!images.length && (!firstLine(user) || !user)) user = null;
    } else if (e.type === "attachment" && e.attachment?.type === "queued_command" && e.attachment.origin?.kind === "human") user = e.attachment.prompt;
    if (user || images.length) { close(); emit({ k: "user", text: user, images, at: e.timestamp }); turnAt = e.timestamp; lastAt = null; open = true; continue; }
    if (e.type === "assistant") {
      for (const b of e.message?.content ?? []) {
        if (b.type === "text" && b.text) emit({ k: "text", text: b.text, id: e.message.id });
        else if (b.type === "tool_use") emit(tool(b));
      }
      lastAt = e.timestamp;
    }
  }
  close();
}

// Input: a queue the SDK reads; a message sent while Claude works waits its turn, as in the console.
const queue = [];
let wake = null;
async function* input() {
  for (;;) {
    while (!queue.length) await new Promise(r => (wake = r));
    yield queue.shift();
  }
}
let turnAt = null;
// images: files pasted in the view (png, jpeg, gif, webp), sent before the text as the console does.
function send(text, images = []) {
  emit({ k: "user", text, images, at: new Date().toISOString() });
  const content = images.length ? [
    ...images.map(f => ({ type: "image", source: { type: "base64", media_type: `image/${path.extname(f).slice(1)}`, data: fs.readFileSync(f, "base64") } })),
    ...(text ? [{ type: "text", text }] : []),
  ] : text;
  queue.push({ type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: state.sid ?? "" });
  wake?.(); wake = null;
  if (state.status !== "working" && state.status !== "blocked") { turnAt = Date.now(); report("working"); }
}

// Permissions and questions wait for the view's answer.
const waiting = new Map();
async function canUseTool(name, inp, o) {
  const id = o.toolUseID;
  const kind = name === "AskUserQuestion" ? "question" : name === "ExitPlanMode" ? "plan" : "permission";
  state.pending = { id, kind, tool: name, input: inp, title: o.title ?? null, displayName: o.displayName ?? null,
    description: o.description ?? null, reason: o.decisionReason ?? null, blockedPath: o.blockedPath ?? null,
    suggestions: o.suppressAlwaysAllowRule ? [] : o.suggestions ?? [], defaultToNo: !!o.defaultToNo };
  report("blocked", kind === "permission" ? "permission" : "question");
  const answer = await new Promise(resolve => {
    waiting.set(id, resolve);
    o.signal.addEventListener("abort", () => resolve({ behavior: "deny", message: "Interrompu." }), { once: true });
  });
  waiting.delete(id);
  state.pending = null;
  report("working");
  if (answer.behavior === "allow") {
    for (const u of answer.updatedPermissions ?? []) if (u.type === "setMode") state.mode = u.mode;
    if (answer.mode) { await q.setPermissionMode(answer.mode); state.mode = answer.mode; }
    return { behavior: "allow", updatedInput: answer.answers ? { ...inp, answers: answer.answers } : inp, updatedPermissions: answer.updatedPermissions };
  }
  return { behavior: "deny", message: answer.message || "L'utilisateur a refusé.", interrupt: !!answer.stop };
}

const q = query({ prompt: input(), options: {
  cwd: process.cwd(), pathToClaudeCodeExecutable: exe, includePartialMessages: true, canUseTool,
  systemPrompt: { type: "preset", preset: "claude_code" },
  resume: opt.resume, model: opt.model, permissionMode: opt.mode,
  env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1" },
  stderr: data => process.stderr.write(data),
  // The effort each turn really runs at (after any downgrade for the model), as the console's status line shows it.
  hooks: Object.fromEntries(["PreToolUse", "Stop"].map(ev => [ev, [{ hooks: [async i => {
    if (i.effort?.level && i.effort.level !== state.effort) { state.effort = i.effort.level; save(); }
    return {};
  }] }]])),
} });

if (opt.resume) history(opt.resume);
console.log(`Claude Code, vue Discussion (terminal ${t}). Ctrl+C deux fois dans la Discussion pour revenir au shell.`);
report("idle");

// Commands from the view.
async function run(c) {
  if (c.type === "send" && (c.text?.trim() || c.images?.length)) send(c.text ?? "", c.images ?? []);
  else if (c.type === "interrupt") await q.interrupt();
  else if (c.type === "answer") waiting.get(c.id)?.(c);
  else if (c.type === "mode") { await q.setPermissionMode(c.mode); state.mode = c.mode; save(); }
  else if (c.type === "model") { await q.setModel(c.model); state.model = c.model; save(); }
  else if (c.type === "effort") { await q.applyFlagSettings({ effortLevel: c.effort }); state.effort = c.effort; save(); }
  else if (c.type === "quit") quit(true);
}
async function drain() {
  for (const f of fs.readdirSync(cmdDir).filter(f => f.endsWith(".json")).sort()) {
    const p = path.join(cmdDir, f);
    let c; try { c = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; } // still being written
    fs.rmSync(p, { force: true });
    try { await run(c); } catch (e) { state.error = String(e?.message ?? e); save(); }
  }
}
fs.watch(cmdDir, () => drain());
setInterval(drain, 1000); // a missed watch event costs a second, not a command

// byUser (the quit command, Ctrl+C twice): forgotten for the restore after a reboot, as the console's /exit does
// (bin/agent-session); a stop by the system (SIGTERM at shutdown) keeps it to be resumed.
function quit(byUser) {
  fs.rmSync(path.join(dir, "state.json"), { force: true });
  if (byUser) fs.rmSync(path.join(os.homedir(), ".cache", "herdr-agents", `hc-${t}.sid`), { force: true });
  process.stdout.write("\x1b]7501;state=clear\x07");
  try { q.close(); } catch {}
  process.exit(0);
}
// Ctrl+C in this terminal: as in the console, the first stops the turn, a second within 2 s quits.
let lastSigint = 0;
process.on("SIGINT", () => { if (Date.now() - lastSigint < 2000) quit(true); lastSigint = Date.now(); q.interrupt().catch(() => {}); });
process.on("SIGTERM", quit);

if (opt.prompt.length) send(opt.prompt.join(" "));

// The conversation as it happens.
try {
  for await (const m of q) {
    if (m.type === "system" && m.subtype === "init") {
      Object.assign(state, { sid: m.session_id, model: m.model, mode: state.mode ?? m.permissionMode, cwd: m.cwd });
      if (!state.commands.length) {
        q.supportedCommands().then(c => { state.commands = c.map(x => ({ name: x.name, description: x.description, hint: x.argumentHint })); save(); }).catch(() => {});
        q.supportedModels().then(ms => { state.models = ms.map(x => ({ value: x.value, name: x.displayName, description: x.description,
          resolved: x.resolvedModel, efforts: x.supportsEffort ? x.supportedEffortLevels ?? [] : [] })); save(); }).catch(() => {});
      }
      save();
    } else if (m.type === "system" && m.subtype === "session_state_changed") {
      session = m.state;
      if (m.state === "idle" && state.status === "working" && !queue.length) report("done");
    } else if (m.type === "system" && m.subtype === "background_tasks_changed") {
      const work = m.tasks.filter(x => !x.ambient);
      state.bg = { agents: work.filter(x => x.task_type !== "local_bash").length, shells: work.filter(x => x.task_type === "local_bash").length };
      save();
    } else if (m.type === "stream_event" && !m.parent_tool_use_id) {
      const ev = m.event;
      // Claude went on with a message sent while it worked: working again after its "done".
      if (state.status !== "working" && state.status !== "blocked") report("working");
      if (ev.type === "message_start") state.live = { id: ev.message.id, text: "", tool: null };
      else if (ev.type === "content_block_start" && ev.content_block.type === "tool_use" && state.live) state.live.tool = ev.content_block.name;
      else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && state.live) state.live.text += ev.delta.text;
      save();
    } else if (m.type === "assistant" && !m.parent_tool_use_id) {
      for (const b of m.message.content) {
        if (b.type === "text" && b.text) emit({ k: "text", text: b.text, id: m.message.id });
        else if (b.type === "tool_use") emit(tool(b));
      }
    } else if (m.type === "result") {
      emit({ k: "end", ms: m.duration_ms ?? (turnAt ? Date.now() - turnAt : 0), at: new Date().toISOString(), error: m.subtype !== "success" || undefined });
      state.live = null;
      // Done when the session says so (background agents may still be at work); at once with a CLI that doesn't.
      if (!queue.length && session === null) report("done"); else save();
    }
  }
} catch (e) {
  state.error = String(e?.message ?? e); save(true);
  console.error(`claude-gui: ${state.error}`);
}
quit();
