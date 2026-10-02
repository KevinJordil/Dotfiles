"""Patches de Guake (à lancer avec sudo, relançable : chaque patch déjà présent est ignoré).

Usage : sudo python3 patch.py <dossier du paquet guake>
"""
import shutil
import sys
from pathlib import Path

TAB_EXPAND = "        self.set_tab_reorderable(root_terminal_box, True)\n"
WORKSPACE = "        self.notebook_manager.set_workspace(0)\n"
NB_NAME = '        self.set_name("notebook-teminals")\n'
SET_LABEL = "                self.set_tab_label(page, label)\n"
LABEL = "        self.label = Gtk.Label(label=text, visible=True)\n"
TEXT_FUNCS = """    def set_text(self, text):
        self.label.set_text(text)

    def get_text(self):
        return self.label.get_text()
"""
RENAME = "RenameDialog(self.notebook.guake.window, self.label.get_text())"
USER_SET = """            if user_set:
                setattr(page, "custom_label_set", new_text != "-")
"""

# (fichier, mot-clé qui prouve que le patch est là, texte d'origine, texte qui le remplace)
PATCHES = [
    # onglets en largeur égale
    ("notebook.py", '"tab-expand"', TAB_EXPAND, TAB_EXPAND
     + '        self.child_set_property(root_terminal_box, "tab-expand", True)  # dotfiles : onglets en largeur égale\n'),
    # barre du haut avec la date et l'heure centrées (style : #guake-clock dans gtk.css)
    ("guake_app.py", "guake-clock", WORKSPACE, WORKSPACE + """
        # dotfiles : barre du haut avec la date et l'heure centrées (style : #guake-clock dans gtk.css)
        self.clock_label = Gtk.Label(name="guake-clock", visible=True)
        self.mainframe.pack_start(self.clock_label, False, False, 0)
        self.mainframe.reorder_child(self.clock_label, 0)

        def _clock_tick():
            text = pytime.strftime("%a %d.%m.%Y  %H:%M:%S")
            if self.clock_label.get_text() != text:
                self.clock_label.set_text(text)
            return True

        _clock_tick()
        GLib.timeout_add(250, _clock_tick)  # 4x/s : la seconde change sans retard visible
"""),
    # "[N] nom" sur les onglets : le numéro n'est qu'affiché, get_text() (session, lien tmux) renvoie le nom seul
    ("boxes.py", "dotfiles-num-init", LABEL, LABEL
     + "        self._name, self.num = text, 0  # dotfiles-num-init : numéro affiché, hors du nom\n"),
    ("boxes.py", "def set_num", TEXT_FUNCS, """    def set_text(self, text):
        self._name = text
        self.label.set_text(f"[{self.num}] {text}" if self.num else text)

    def set_num(self, num):
        self.num = num
        self.set_text(self._name)

    def get_text(self):
        return self._name
"""),
    ("boxes.py", "RenameDialog(self.notebook.guake.window, self.get_text())", RENAME,
     "RenameDialog(self.notebook.guake.window, self.get_text())"),
    ("notebook.py", "dotfiles-renumber", NB_NAME, NB_NAME + """
        # dotfiles-renumber : met à jour le "[N]" des onglets à chaque ajout, fermeture ou déplacement
        def _renumber(*_):
            for i in range(self.get_n_pages()):
                tab = self.get_tab_label(self.get_nth_page(i))
                if hasattr(tab, "set_num"):
                    tab.set_num(i + 1)

        self.dotfiles_renumber = _renumber
        for signal in ("page-added", "page-removed", "page-reordered"):
            self.connect(signal, _renumber)
"""),
    ("notebook.py", "self.dotfiles_renumber()", SET_LABEL, SET_LABEL
     + "                self.dotfiles_renumber()\n"),
    # renommer un onglet renomme aussi son set tmux (le client tmux est le processus du terminal de l'onglet)
    ("notebook.py", "dotfiles-tmux-rename", USER_SET, USER_SET + """            if user_set and new_text != "-":  # dotfiles-tmux-rename
                import subprocess

                pids = {str(t.pid) for t in page.iter_terminals() if t.pid}
                try:
                    clients = subprocess.run(
                        ["tmux", "list-clients", "-F", "#{client_pid} #{session_id}"],
                        capture_output=True, text=True, timeout=2,
                    ).stdout
                    for line in clients.splitlines():
                        pid, sid = line.split(" ", 1)
                        if pid in pids:
                            subprocess.run(["tmux", "rename-session", "-t", sid, new_text], timeout=2)
                except (OSError, subprocess.SubprocessError, ValueError):
                    pass
"""),
]

pkg = Path(sys.argv[1])
for name, marker, old, new in PATCHES:
    f = pkg / name
    src = f.read_text()
    if marker in src:
        print(f"{name} : déjà appliqué ({marker})")
        continue
    if old not in src:
        sys.exit(f"{name} : code d'origine introuvable pour {marker} (version de Guake différente ?)")
    bak = f.with_suffix(".py.bak")
    if not bak.exists():
        shutil.copy2(f, bak)
    f.write_text(src.replace(old, new, 1))
    print(f"{name} : patché ({marker})")
