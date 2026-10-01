"""Patches de Guake (à lancer avec sudo, relançable : chaque patch déjà présent est ignoré).

Usage : sudo python3 patch.py <dossier du paquet guake>
"""
import shutil
import sys
from pathlib import Path

# (fichier, mot-clé qui prouve que le patch est là, ligne d'ancrage, code ajouté après l'ancrage)
PATCHES = [
    (
        "notebook.py",
        '"tab-expand"',
        "        self.set_tab_reorderable(root_terminal_box, True)\n",
        '        self.child_set_property(root_terminal_box, "tab-expand", True)  # dotfiles : onglets en largeur égale\n',
    ),
    (
        "guake_app.py",
        "guake-clock",
        "        self.notebook_manager.set_workspace(0)\n",
        """
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
""",
    ),
]

pkg = Path(sys.argv[1])
for name, marker, anchor, added in PATCHES:
    f = pkg / name
    src = f.read_text()
    if marker in src:
        print(f"{name} : déjà appliqué")
        continue
    if anchor not in src:
        sys.exit(f"{name} : ligne d'ancrage introuvable (version de Guake différente ?)")
    bak = f.with_suffix(".py.bak")
    if not bak.exists():
        shutil.copy2(f, bak)
    f.write_text(src.replace(anchor, anchor + added, 1))
    print(f"{name} : patché (sauvegarde {bak.name})")
