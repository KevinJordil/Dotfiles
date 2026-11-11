import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings, exec, appHome, props, closeOverlay } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Kevin : clone of the shipped "tabs". The close button shows on hover, over the tab's end,
// so a selected tab is never wider than the others; compact tabs (text 11.5, like the sidebar's secondary text), all the same width.
// Every tab has the same width: a status, a rename or a zoom never changes it.
// On the right, in place of the Files panel button: the Claude account in use and its limits (<repo>/bin/claude-usage).
const TAB_W = 160;
const CLAUDE = "#d97757";
// Catppuccin Mocha, like the agents: green, yellow, orange, red as a limit fills.
const color = p => p >= 90 ? "#f38ba8" : p >= 70 ? "#fab387" : p >= 50 ? "#f9e2af" : "#a6e3a1";
// A cached answer can predate the reset: the limit has started over since.
const pct = l => Date.parse(l.resets_at) < Date.now() ? 0 : Math.round(Math.min(l.utilization, 100));
const limits = u => [["5h", "Session (5 h)", u.session], ["7j", "Semaine", u.weekly]].filter(([, , l]) => l);
const left = iso => {
  const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return m >= 1440 ? `${Math.floor(m / 1440)} j ${Math.floor(m % 1440 / 60)} h` : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export default class Tabs extends View {
  init(_props, cx) {
    this.usage = null;
    this.refreshUsage(cx);
    cx.timer.every(60000, (cx) => this.refreshUsage(cx));
    this.pressed = null;
    this.hoverTab = null;
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  refreshUsage(cx) {
    cx.spawn(async (cx) => {
      try {
        // The repo may be cloned as dotfiles, Dotfiles…: follow this mod's link once.
        this.repo ??= (await exec("readlink", ["-f", `${appHome()}/mods/kevin-tabs`])).stdout.trim().replace(/\/herdr-app\/mods\/kevin-tabs$/, "");
        const r = await exec(`${this.repo}/bin/claude-usage`, []);
        if (r.code === 0) this.usage = JSON.parse(r.stdout);
      } catch {}
      cx.notify();
    });
  }

  // A Claude-orange sparkle, the organization, then each limit (5 h session, week) as a percentage colored by
  // how full it is; a click opens the account menu.
  usageView(t) {
    const u = this.usage;
    const meter = ([short, , l]) => h_flex().gap(3).items_center()
      .child(div().text_color(t.dim).child(short))
      .child(div().text_color(color(pct(l))).child(`${pct(l)}%`));
    return h_flex().id("claude-usage").h(26).px(6).gap(7).flex_none().items_center().rounded(6).text_size(11.5).text_color(t.muted)
      .hover(s => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => openOverlay({ mod: "kevin-tabs", kind: "popup", width: 300, height: this.menuHeight(u), props: { account: true } }))
      .child(h_flex().gap(5).items_center().child(svg("mods/kevin-tabs/sparkle.svg").size(12).text_color(CLAUDE))
        .child(div().child(u.org ?? u.email)))
      .children(limits(u).map(meter));
  }

  // A popup's size is fixed when it opens: the menu's measured height (its content reports it), else an estimate.
  menuHeight(u) {
    const measured = Number(localStorage.getItem(`menuHeight-${limits(u).length}-${u.others?.length ?? 0}`));
    return measured ? measured + 2 : 204 + 46 * limits(u).length + 30 * (u.others?.length ?? 0);
  }

  // The account menu: who, the organizations (the default one, whose limits follow, then those claude asks
  // for at launch: <repo>/bin/claude-org), each limit with its bar and reset, and adding an organization.
  accountMenu(t) {
    const u = this.usage;
    if (!u) return v_flex().size_full().bg(t.popover);
    const add = () => {
      closeOverlay(props().overlay);
      run("terminal.open", { argv: ["zsh", "-ic", `${this.repo}/bin/claude-org add; exec zsh -i`], place: "tab", name: "Organisation Claude" });
    };
    const section = label => div().px(4).pt(2).text_size(11).text_color(t.dim).child(label);
    const key = `menuHeight-${limits(u).length}-${u.others?.length ?? 0}`;
    return v_flex().size_full().bg(t.popover).child(v_flex().w_full().p(10).pb(14).gap(6).text_size(13)
      .on_size_change(size => { if (Math.round(size.height) !== Number(localStorage.getItem(key))) localStorage.setItem(key, String(Math.round(size.height))); })
      .child(h_flex().gap(10).px(4).items_center()
        .child(svg("mods/kevin-tabs/sparkle.svg").size(18).text_color(CLAUDE))
        .child(v_flex().min_w(0)
          .child(div().truncate().text_color(t.foreground).child(u.name ?? u.email))
          .child(div().truncate().text_size(11.5).text_color(t.dim).child(u.email))))
      .child(section("Organisation"))
      .child(h_flex().gap(8).px(8).py(5).rounded(6).items_center().bg(t.selected)
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(u.org ?? "Compte personnel"))
        .when(Boolean(u.plan), el => el.child(div().px(6).rounded(4).text_size(11).text_color(CLAUDE).bg(CLAUDE + "26").child(u.plan[0].toUpperCase() + u.plan.slice(1))))
        .child(div().text_size(11).text_color(t.dim).child("défaut")))
      .children((u.others ?? []).map(name => div().px(8).py(3).truncate().text_color(t.muted).child(name)))
      .child(section(`Limites · ${u.org ?? "compte personnel"}`))
      .children(limits(u).map(([, long, l]) => v_flex().gap(3).px(4)
        .child(h_flex().items_center().text_size(12)
          .child(div().flex_1().text_color(t.muted).child(long))
          .child(div().text_color(color(pct(l))).child(`${pct(l)} %`)))
        .child(div().w_full().h(4).rounded(2).bg(t.border).child(div().h_full().w(276 * pct(l) / 100).rounded(2).bg(color(pct(l)))))
        .child(div().text_size(11).text_color(t.dim).child(`réinitialisée dans ${left(l.resets_at)}`))))
      .child(div().id("switch-org").mt(4).h(28).rounded(6).flex().items_center().justify_center().text_size(12.5)
        .text_color(t.foreground).bg(t.hover).cursor_pointer().hover(s => s.bg(t.selected)).on_click(add)
        .child("Ajouter une organisation…")));
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    if (props()?.account) return this.accountMenu(t);
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const bg = c.active ? t.raised : t.chrome;
      return h_flex().id(`tab-${c.id}`).relative().w(TAB_W).h(25).px(8).gap(5).rounded(6).items_center().flex_none().text_size(11.5)
        .on_hover((on, cx) => { if (on) this.hoverTab = c.id; else if (this.hoverTab === c.id) this.hoverTab = null; cx.notify(); })
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(12).text_color(t.muted) : image(program.icon).size(12)))
        .child(div().flex_1().min_w(0).truncate().child(c.zoomed ? `${name} Z` : name))
        // The status always has its slot, empty or not: a tab never grows when its agent starts or finishes.
        .child(h_flex().size(11).flex_none().items_center().justify_center()
          .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).text_color(t.working).spin(900)))
          .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status]))))
        .when(this.hoverTab === c.id, el => el.child(div().id(`close-${c.id}`).absolute().right(3).top(3).size(19).rounded(5).flex().items_center().justify_center()
          .bg(t.hover).text_color(t.muted).hover(s => s.text_color(t.foreground))
          .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = (shared("workspace.panels") ?? ["files", "changes"]).filter(id => id !== "files");
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(Boolean(this.usage), el => el.child(this.usageView(t)))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/kevin-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/kevin-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/kevin-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
