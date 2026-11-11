import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, layout, shared, setShared, updates, panes, terminals, home, props, openOverlay, closeOverlay, hc, exec } from "herdr";

const RED = "#f38ba8";

// Kevin : clone of the shipped "workspace-status". The sidebar's header (Herdr) and footer (Settings,
// Add machine) are gone from the layout: their buttons live here, on the right, as icons.
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : 44 });
}

export default class WorkspaceStatus extends View {
  // What no longer needs to be open: idle shells in the home folder or doubling another shell of
  // the same folder in the same space (alone in their tab: splits are deliberate), and agents idle for 2 days.
  // Closing an agent only ends its terminal: its conversation stays resumable (claude --resume).
  candidates() {
    const now = Date.now();
    const terms = new Map(terminals().map((t) => [t.address, t]));
    const where = new Map(spaces().flatMap((s) => s.tabs.map((tb) => [tb.id, `${s.name} · ${tb.name}`])));
    const all = panes().filter((p) => p.terminal);
    const perTab = new Map();
    for (const p of all) perTab.set(p.tab, (perTab.get(p.tab) ?? 0) + 1);
    const seen = new Set();
    const out = [];
    for (const p of all) {
      const t = terms.get(p.terminal);
      if (t?.state !== "live") continue;
      const label = where.get(p.tab) ?? p.terminal;
      const space = spaces().find((s) => s.tabs.some((tb) => tb.id === p.tab))?.id;
      if (["zsh", "bash", "sh", "fish"].includes(t.foreground?.name)) {
        const key = `${space}|${p.cwd}`;
        if (perTab.get(p.tab) === 1 && p.cwd === home()) out.push({ pane: p.pane, label, why: "shell dans le dossier personnel" });
        else if (perTab.get(p.tab) === 1 && seen.has(key)) out.push({ pane: p.pane, label, why: "shell en double dans ce dossier" });
        seen.add(key);
      } else if (p.status === "idle" && t.status_ms && now - t.status_ms > 2 * 86400000) {
        out.push({ pane: p.pane, agent: p.terminal, label, why: `agent inactif depuis ${Math.floor((now - t.status_ms) / 86400000)} jours` });
      }
    }
    return out;
  }

  // An agent stops cleanly (/exit, then its shell's pane closes), like the agents list's Stop button.
  stop(c, cx) {
    cx.spawn(async () => {
      try {
        await hc(["send", c.agent, "/exit"]);
        for (let i = 0; i < 40; i++) {
          const r = await hc(["get", c.agent, "--json"]);
          if (["zsh", "bash", "sh", "fish"].includes(JSON.parse(r.stdout).foreground?.name)) break;
          await exec("sleep", ["0.5"]);
        }
      } catch {}
      run("pane.close", { pane: c.pane });
    });
  }

  cleanList(t) {
    const list = this.candidates();
    const close = (c, cx) => (c.agent ? this.stop(c, cx) : run("pane.close", { pane: c.pane }));
    return v_flex().w_full().p(8).gap(2).bg(t.popover).text_size(13)
      .child(div().px(6).pb(4).text_size(11.5).text_color(t.dim).child(list.length ? "À nettoyer" : "Rien à nettoyer"))
      .children(list.map((c, i) => h_flex().id(`c-${i}`).gap(8).px(6).py(4).rounded(6).items_center().hover((s) => s.bg(t.hover))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_color(t.foreground).child(c.label))
          .child(div().text_size(11.5).text_color(t.dim).child(c.why)))
        .child(div().id(`x-${i}`).px(8).h(22).rounded(5).flex().items_center().text_size(11.5).text_color(RED).bg(RED + "1f")
          .cursor_pointer().hover((s) => s.bg(RED + "38")).on_click((_e, cx) => close(c, cx)).child(c.agent ? "Arrêter" : "Fermer"))))
      .when(list.length > 1, (el) => el.child(div().id("all").mt(6).h(28).rounded(6).flex().items_center().justify_center()
        .text_color(RED).bg(RED + "1f").cursor_pointer().hover((s) => s.bg(RED + "38"))
        .on_click((_e, cx) => list.forEach((c) => close(c, cx)))
        .child(`Tout fermer (${list.length})`)));
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    if (props()?.clean) return this.cleanList(t);
    const todo = this.candidates().length;
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)))
      .child(h_flex().gap(2).items_center()
        .child(h_flex().id("clean").h(22).px(6).gap(5).rounded(5).items_center().cursor_pointer().tooltip("Nettoyer ce qui n'a plus lieu d'être")
          .text_color(todo ? RED : t.dim).hover((s) => s.bg(t.hover))
          .on_click(() => openOverlay({ mod: "kevin-status", kind: "popup", width: 340, height: Math.min(70 + 44 * Math.max(todo, 1), 460), props: { clean: true } }))
          .child(svg("mods/kevin-status/eraser.svg").size(13))
          .when(todo > 0, (el) => el.child(String(todo))))
        .child(this.button(t, "search", "search", "Rechercher", () => run("mod.open", { name: "picker" })))
        .child(this.button(t, "sidebar-toggle", "sidebar", "Barre latérale", toggleSidebar))
        .child(this.button(t, "machine", "server", "Ajouter une machine", () => run("mod.open", { name: "machine-add" })))
        .child(this.button(t, "settings", "settings", "Réglages", () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.relative().child(div().absolute().top(3).right(3).size(5).rounded_full().bg(t.accent)))));
  }

  button(t, id, icon, tip, action) {
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip).on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(13));
  }
}
