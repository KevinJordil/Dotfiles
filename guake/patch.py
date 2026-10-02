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
ACTION_BOX = "        self.action_box = Gtk.Box(visible=True)\n"
TERM_INIT = "        super().__init__()\n        self.guake = guake\n        self.configure_terminal()\n"
NUM_INIT = "        self._name, self.num = text, 0  # dotfiles-num-init : numéro affiché, hors du nom\n"
RENUM_CONNECT = """        for signal in ("page-added", "page-removed", "page-reordered"):
            self.connect(signal, _renumber)
"""
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
    # pas de boutons à droite des onglets (nouvel onglet : Ctrl+Shift+T)
    ("notebook.py", "dotfiles-no-action-box", ACTION_BOX,
     "        self.action_box = Gtk.Box(visible=False, no_show_all=True)  # dotfiles-no-action-box\n"),
    # pixels en trop (hauteur non multiple d'une ligne) en haut : la barre tmux colle aux onglets Guake
    ("terminal.py", "dotfiles-yalign", TERM_INIT, TERM_INIT
     + "        if hasattr(self, \"set_yalign\"):  # dotfiles-yalign (VTE >= 0.76)\n"
     + "            self.set_yalign(Vte.Align.END)\n"),
    # nom d'onglet trop long : coupé par "…" au lieu d'élargir l'onglet (nécessaire à l'alignement ci-dessous)
    ("boxes.py", "dotfiles-ellipsize", NUM_INIT, NUM_INIT
     + "        self.label.set_ellipsize(3)  # dotfiles-ellipsize (Pango.EllipsizeMode.END)\n"
     + "        self.label.set_max_width_chars(1)\n"),
    # onglets Guake alignés sur les onglets tmux : même calcul que ~/.tmux/tabs.sh (colonnes ÷ nombre d'onglets,
    # 1 colonne par séparateur │), et chaque bord d'onglet Guake tombe sur le pixel du trait │ de tmux.
    # ponytail: recalcul au redimensionnement et aux changements d'onglets, pas au zoom de la police
    ("notebook.py", "dotfiles-align", RENUM_CONNECT, RENUM_CONNECT + """
        # dotfiles-align
        def _align():
            self._dotfiles_align_pending = False
            n = self.get_n_pages()
            term = next(self.iter_terminals(), None)
            if not n or term is None:
                return False
            cw, cols, total = term.get_char_width(), term.get_column_count(), self.get_allocated_width()
            avail = cols - (n - 1)
            if cw <= 0 or total <= 1 or avail < n:
                return False
            w, col, edges = avail // n, 0, [0]
            for _ in range(n - 1):
                col += w
                edges.append(col * cw + (cw + 1) // 2)  # pixel où VTE dessine le trait │ de tmux (mesuré)
                col += 1
            tabs = [self.get_tab_label(self.get_nth_page(k)) for k in range(n)]
            if not all(hasattr(t, "set_num") and t.get_mapped() for t in tabs):
                return False
            # marges du thème mesurées plutôt que supposées : début du 1er onglet, épaisseur du trait entre onglets
            xs = [t.translate_coordinates(self, 0, 0)[0] for t in tabs]
            lead = xs[0]
            gap = xs[1] - xs[0] - tabs[0].get_allocated_width() if n > 1 else 1
            starts = [lead] + [edges[k] + gap for k in range(1, n)]
            for k, tab in enumerate(tabs):
                last = k == n - 1
                # chaque onglet s'arrête où commence le trait suivant ; le dernier demande 2 px de moins
                # et s'étire (tab-expand) pour finir au bord exact, sans jamais déborder
                width = max((total - 2 if last else edges[k + 1]) - starts[k], 1)
                if tab.get_size_request()[0] != width:
                    tab.set_size_request(width, -1)
                page = self.get_nth_page(k)
                if self.child_get_property(page, "tab-expand") != last:
                    self.child_set_property(page, "tab-expand", last)
            return False

        def _align_soon(*_):
            if not getattr(self, "_dotfiles_align_pending", False):
                from gi.repository import GLib

                self._dotfiles_align_pending = True
                GLib.idle_add(_align)

        for signal in ("page-added", "page-removed", "page-reordered", "size-allocate"):
            self.connect(signal, _align_soon)
        _renumber_only = self.dotfiles_renumber

        def _renumber_and_align(*args):
            _renumber_only(*args)
            _align_soon()

        self.dotfiles_renumber = _renumber_and_align
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
