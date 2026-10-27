// Extension GNOME Shell : place et affiche/masque la fenêtre de la console herdr.
// Un client ne peut ni déplacer ni activer la fenêtre d'un autre client en Wayland : seul le
// Shell en a le droit. bin/console appelle donc Toggle() en D-Bus, et le même code sert en X11.
// Style « legacy » (imports, init()) et Meta.Rectangle : GNOME 42-44. GNOME 45+ exige des
// modules ES, GNOME 46+ remplace Meta.Rectangle par Mtk.Rectangle — d'où shell-version.
const { Gio, GLib, Meta, Shell } = imports.gi;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;

const NAME = 'ch.dotfiles.Console';
const PATH = '/ch/dotfiles/Console';
const IFACE = `
<node>
  <interface name="ch.dotfiles.Console">
    <method name="Toggle">
      <arg type="s" direction="in" name="wm_class"/>
      <arg type="b" direction="in" name="fullscreen"/>
      <arg type="b" direction="out" name="found"/>
    </method>
    <method name="ListWindows">
      <arg type="s" direction="out" name="windows"/>
    </method>
  </interface>
</node>`;
const WAIT = 15;  // s : au-delà, on cesse d'attendre la fenêtre demandée (Ghostty n'a pas démarré)
// Classe masquée partout où GNOME liste les applications en cours. Seul le mode console : le mode
// fenêtre (ch.dotfiles.window) veut au contraire son icône dans le dock.
// skip-taskbar est en lecture seule dans Mutter (et hide_from_window_list() n'arrive qu'en GNOME 50),
// donc on filtre les trois sources JS du Shell. Ubuntu Dock surcharge get_running de la même façon.
const HIDDEN = 'ch.dotfiles.console';

class Console {
    enable() {
        this._pending = new Map();  // wm_class → { fullscreen, timeoutId }
        this._watched = new Map();  // Meta.Window → [handlerIds] : classe pas encore connue
        this._createdId = global.display.connect('window-created', (_d, win) => this._onCreated(win));
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, PATH);
        this._ownerId = Gio.bus_own_name(Gio.BusType.SESSION, NAME,
            Gio.BusNameOwnerFlags.REPLACE, null, null, null);
        this._hideFromAppLists();
    }

    // Alt+Tab (applications), Alt+Échap (fenêtres) et la vue d'ensemble, dans cet ordre.
    _hideFromAppLists() {
        const self = this;
        const mine = w => self._matches(w, HIDDEN);

        this._origRunning = Shell.AppSystem.prototype.get_running;
        Shell.AppSystem.prototype.get_running = function () {
            return self._origRunning.call(this).filter(app => !app.get_windows().some(mine));
        };

        this._origTabList = Meta.Display.prototype.get_tab_list;
        Meta.Display.prototype.get_tab_list = function (type, workspace) {
            return self._origTabList.call(this, type, workspace).filter(w => !mine(w));
        };

        this._origOverview = Workspace.Workspace.prototype._isOverviewWindow;
        Workspace.Workspace.prototype._isOverviewWindow = function (win) {
            return self._origOverview.call(this, win) && !mine(win);
        };
    }

    _restoreAppLists() {
        if (this._origRunning)
            Shell.AppSystem.prototype.get_running = this._origRunning;
        if (this._origTabList)
            Meta.Display.prototype.get_tab_list = this._origTabList;
        if (this._origOverview)
            Workspace.Workspace.prototype._isOverviewWindow = this._origOverview;
        this._origRunning = this._origTabList = this._origOverview = null;
    }

    disable() {
        this._restoreAppLists();
        for (const { timeoutId } of this._pending.values())
            GLib.source_remove(timeoutId);
        this._pending.clear();
        for (const win of [...this._watched.keys()])
            this._unwatch(win);
        global.display.disconnect(this._createdId);
        Gio.bus_unown_name(this._ownerId);
        this._dbus.unexport();
        this._dbus = null;
    }

    // D-Bus : rend `true` si la fenêtre existait (bin/console lance Ghostty quand c'est `false`,
    // avec l'environnement de la session plutôt que celui de gnome-shell).
    Toggle(wmClass, fullscreen) {
        const win = this._find(wmClass);
        if (!win) {
            this._arm(wmClass, fullscreen);
            return false;
        }
        // En plein écran (touche ²), un second appui masque ; le mode fenêtre se contente d'afficher.
        if (fullscreen && win.has_focus() && !win.minimized)
            win.minimize();
        else
            this._show(win, fullscreen);
        return true;
    }

    // Diagnostic : `gdbus call --session --dest ch.dotfiles.Console --object-path \
    //   /ch/dotfiles/Console --method ch.dotfiles.Console.ListWindows`
    // donne la classe réelle de chaque fenêtre, à comparer avec celle que bin/console demande.
    ListWindows() {
        return global.get_window_actors().map(a => a.meta_window).map(w =>
            `${w.get_wm_class()} | instance=${w.get_wm_class_instance()} | ` +
            `gtk-app-id=${w.get_gtk_application_id()} | « ${w.get_title()} »`).join('\n');
    }

    _matches(win, wmClass) {
        const want = wmClass.toLowerCase();
        // Wayland renseigne wm_class depuis l'app id GTK, en le normalisant parfois.
        return [win.get_wm_class(), win.get_wm_class_instance(), win.get_gtk_application_id()]
            .some(v => v && v.toLowerCase() === want);
    }

    _find(wmClass) {
        const win = global.get_window_actors()
            .map(a => a.meta_window)
            .find(w => this._matches(w, wmClass));
        return win || null;
    }

    _show(win, fullscreen) {
        if (fullscreen) {
            const [px, py] = global.get_pointer();  // comme Guake : s'ouvre sur l'écran de la souris
            const monitor = global.display.get_monitor_index_for_rect(
                new Meta.Rectangle({ x: px, y: py, width: 1, height: 1 }));
            if (win.get_monitor() !== monitor) {
                if (win.is_fullscreen())
                    win.unmake_fullscreen();  // le plein écran reste collé à son écran : on le quitte pour déplacer
                win.move_to_monitor(monitor);
            }
            win.stick();  // présente sur tous les bureaux
            win.make_above();
            if (!win.is_fullscreen())
                win.make_fullscreen();
        }
        win.unminimize();
        Main.activateWindow(win);  // gère le changement de bureau et le focus
    }

    // Fenêtre attendue : on la placera dès qu'elle apparaît, sans interroger en boucle.
    _arm(wmClass, fullscreen) {
        const old = this._pending.get(wmClass);
        if (old)
            GLib.source_remove(old.timeoutId);
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, WAIT, () => {
            this._pending.delete(wmClass);
            return GLib.SOURCE_REMOVE;
        });
        this._pending.set(wmClass, { fullscreen, timeoutId });
    }

    _onCreated(win) {
        if (this._claim(win) || !this._pending.size)
            return;
        // Les clients Wayland annoncent leur app id après la création : on attend qu'il arrive.
        this._watched.set(win, [
            win.connect('notify::wm-class', () => this._claim(win)),
            win.connect('notify::gtk-application-id', () => this._claim(win)),
            win.connect('unmanaged', () => this._unwatch(win)),
        ]);
    }

    _unwatch(win) {
        const ids = this._watched.get(win);
        if (!ids)
            return;
        this._watched.delete(win);
        for (const id of ids)
            win.disconnect(id);
    }

    _claim(win) {
        for (const [wmClass, pending] of this._pending) {
            if (!this._matches(win, wmClass))
                continue;
            this._pending.delete(wmClass);
            GLib.source_remove(pending.timeoutId);
            this._unwatch(win);
            // Placer avant la première image est ignoré : on attend qu'elle soit peinte.
            const actor = win.get_compositor_private();
            if (actor) {
                const id = actor.connect('first-frame', () => {
                    actor.disconnect(id);
                    this._show(win, pending.fullscreen);
                });
            } else {
                this._show(win, pending.fullscreen);
            }
            return true;
        }
        return false;
    }
}

function init() {
    return new Console();
}
