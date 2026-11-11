// Atelier firmware (space Firmware) : les actions répétées en un clic, pour la carte choisie.
// Chaque action s'ouvre dans un nouveau tab ; le shell y reste pour lire la sortie.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, exec, theme, home } from "herdr";

const FW = `${home()}/embedded/firmware`;
const BOARDS = ["dev-mb-01", "dev-mb-02", "dev-mb-03"];
const C = { accent: "#cba6f7", flash: "#fab387", watch: "#89b4fa", serial: "#a6e3a1", text: "#e6e9f5", dim: "#7f849c", hover: "#ffffff0a" };

export default class Firmware extends View {
  init(_props, cx) {
    this.mb = localStorage.getItem("mb") ?? BOARDS[0];
    this.ports = [];
    this.scan(cx);
    cx.timer.every(5000, (cx) => this.scan(cx));
  }

  // Serial ports plugged in now.
  scan(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", "ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null"]);
        this.ports = r.stdout.split("\n").filter(Boolean);
      } catch {}
      cx.notify();
    });
  }

  launch(name, cmd) {
    run("terminal.open", { argv: ["zsh", "-ic", `${cmd}; exec zsh -i`], folder: FW, place: "tab", name });
  }

  button(id, label, cmd, color) {
    return v_flex().id(id).px(10).py(7).gap(1).rounded(8).border_1().border_color("#ffffff12").cursor_pointer()
      .hover((s) => s.bg(color + "1a").border_color(color + "66"))
      .on_click(() => this.launch(label, cmd))
      .child(div().text_size(12.5).font_semibold().text_color(C.text).child(label))
      .child(div().text_size(11).text_color(C.dim).truncate().child(cmd));
  }

  section(title, color, items) {
    return v_flex().gap(6).child(div().text_size(11).font_medium().text_color(color).child(title)).children(items);
  }

  render(cx) {
    const t = theme();
    const mb = this.mb;
    const board = (b) => div().id(`mb-${b}`).px(10).h(24).rounded(12).flex().items_center().text_size(12).cursor_pointer()
      .when(b === mb, (el) => el.bg(C.accent + "33").text_color(C.accent).font_semibold())
      .when(b !== mb, (el) => el.text_color(C.dim).hover((s) => s.bg(C.hover).text_color(C.text)))
      .on_click((_e, cx) => { this.mb = b; localStorage.setItem("mb", b); cx.notify(); })
      .child(b);
    const ports = this.ports.length
      ? this.ports.map((p) => this.button(`port-${p}`, `Série ${p.replace("/dev/", "")}`, `picocom -b 115200 ${p}`, C.serial))
      : [div().text_size(11.5).text_color(C.dim).child("Aucun port série branché")];
    return v_flex().id("firmware").size_full().p(14).gap(16).bg(t.background).text_color(C.text).overflow_y_scrollbar()
      .child(v_flex().gap(8)
        .child(div().text_size(15).font_semibold().child("Atelier firmware"))
        .child(h_flex().gap(6).children(BOARDS.map(board))))
      .child(this.section("Flasher", C.flash, [
        this.button("flash-mb", `Carte ${mb}`, `./scripts/flash-mb.sh ${mb}`, C.flash),
        this.button("flash-mb-online", `Carte ${mb} en ligne`, `./scripts/flash-mb.sh ${mb} --online`, C.flash),
        this.button("flash-mods", `Tous les modules de ${mb}`, `./scripts/flash-mod.sh --all-types --online --mb ${mb}`, C.flash),
      ]))
      .child(this.section("Observer", C.watch, [
        this.button("logs", `Logs ${mb}`, `./mb-fw/scripts/mb-logs.sh ${mb} trace`, C.watch),
        this.button("sysinfo", `Infos système ${mb}`, `./mb-fw/scripts/mb-shell.sh ${mb} "sysinfo"`, C.watch),
      ]))
      .child(this.section("Ports série", C.serial, ports));
  }
}
