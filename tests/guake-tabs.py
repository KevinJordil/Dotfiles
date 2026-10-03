"""Régression GTK réelle : xvfb-run -a python3 tests/guake-tabs.py.

Utilise une copie du paquet Guake installé ; ne modifie pas le système.
"""
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Vte', '2.91')
from gi.repository import Gtk, Gdk, Vte, Pango
repo = Path(__file__).resolve().parents[1]
pkg = Path(importlib.util.find_spec("guake").origin).parent
fixture = tempfile.TemporaryDirectory(prefix="guake-tabs-")
for name in ("notebook.py", "boxes.py", "terminal.py", "guake_app.py"):
    shutil.copy2(pkg / name, Path(fixture.name) / name)
subprocess.run([sys.executable, str(repo / "guake/patch.py"), fixture.name], check=True)
src = (Path(fixture.name) / "notebook.py").read_text()
# Une deuxième application doit laisser exactement le même code.
subprocess.run([sys.executable, str(repo / "guake/patch.py"), fixture.name], check=True,
               stdout=subprocess.DEVNULL)
assert src == (Path(fixture.name) / "notebook.py").read_text()
block = src[src.index('        # dotfiles-renumber'):src.index('        self.set_tab_pos')]
class Page(Gtk.Box):
    def __init__(self):
        super().__init__()
        self.term = Vte.Terminal()
        self.term.set_font(Pango.FontDescription('Roboto Mono 11'))
        self.pack_start(self.term, True, True, 0)
    def iter_terminals(self):
        yield self.term
class Tab(Gtk.EventBox):
    def __init__(self, text):
        super().__init__()
        self.text = text
        self.label = Gtk.Label(label=text)
        self.label.set_ellipsize(Pango.EllipsizeMode.END)
        self.label.set_max_width_chars(1)
        self.add(self.label)
    def set_num(self, num):
        self.label.set_text(f'[{num}] {self.text}')
class Notebook(Gtk.Notebook):
    def __init__(self):
        super().__init__()
        self.set_name('notebook-teminals')
        exec(compile('def setup(self):\n' + block, '<patch>', 'exec'), globals(), ns := {})
        ns['setup'](self)
        self.set_scrollable(True)
        self.set_show_border(False)
    def iter_terminals(self):
        for k in range(self.get_n_pages()):
            yield from self.get_nth_page(k).iter_terminals()
provider = Gtk.CssProvider()
provider.load_from_path(str(repo / 'gtk/gtk.css'))
Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
window = Gtk.Window()
window.set_default_size(1000, 400)
nb = Notebook()
window.add(nb)
def settle():
    end = time.monotonic() + .25
    while time.monotonic() < end:
        for _ in range(100):
            if not Gtk.events_pending(): break
            Gtk.main_iteration_do(False)
        time.sleep(.002)
def check(label):
    tabs = [nb.get_tab_label(nb.get_nth_page(k)) for k in range(nb.get_n_pages())]
    mapped = sum(t.get_mapped() for t in tabs)
    widths = [t.get_allocated_width() for t in tabs]
    print(label, 'visible', mapped, '/', len(tabs), 'widths', widths)
    assert mapped == len(tabs), label
    assert all(t.translate_coordinates(nb, 0, 0)[0] + t.get_allocated_width() <= nb.get_allocated_width() for t in tabs), label
for n in range(1, 9):
    p, tab = Page(), Tab('Un nom de terminal très long ' * 4)
    nb.append_page(p, tab)
    nb.child_set_property(p, 'tab-expand', True)
    nb.dotfiles_renumber()
    window.show_all()
    nb.set_current_page(n - 1)
    settle()
    check(f'add {n}')
window.resize(520, 400)
settle()
check('shrink')
window.resize(1200, 400)
settle()
check('grow')
nb.reorder_child(nb.get_nth_page(0), 5)
settle()
check('reorder')
for n in range(7, 0, -1):
    nb.remove_page(0)
    settle()
    check(f'remove to {n}')
window.destroy()
fixture.cleanup()
