# Remplacer tmux par herdr (Guake reste l'hôte déroulant)

## Objectif

Même comportement qu'aujourd'hui : console ouverte avec la touche `section`, onglets principaux nommés contenant des sous-onglets et des splits, tout restauré après redémarrage. Moins de code : herdr fait nativement ce que tmux + resurrect + continuum + les patchs Guake faisaient.

## Correspondance

| Aujourd'hui | herdr |
|---|---|
| Onglet Guake = set tmux | workspace (sidebar à gauche) |
| Fenêtre tmux | tab (barre horizontale) |
| Split tmux | pane |
| resurrect + continuum | `~/.config/herdr/session.json` (natif) |
| Horloge du patch Guake | `tab_bar_right = datetime` |

## 1. Démarrage

- Guake garde : `show-hide='section'`, plein écran, transparence, police Roboto Mono, palette.
- Guake change : `hide-tabs-if-one-tab=true`, raccourcis `switch-tab1..9` retirés, `restore-tabs-startup=false`, `save-tabs-when-changed=false`.
- `zsh/zshrc` : si `$GUAKE_TAB_UUID` est défini et `$HERDR_ENV` ne l'est pas → `exec herdr`.

## 2. `herdr/config.toml` → `~/.config/herdr/config.toml` (lien)

- Thème : par défaut (pas de `[theme]`).
- `onboarding = false`
- `[terminal] new_cwd = "follow"`
- `[keys] switch_tab = "alt+1..9"`, `switch_workspace = "ctrl+alt+1..9"`
- `[ui] prompt_new_tab_name = false`, `tab_bar_right = [datetime]`
- `[experimental] pane_history = true`

## 3. zsh

- Historique par workspace : hook `precmd`, fichier `~/.zsh_history.d/<libellé du workspace>` (libellé lu via `herdr workspace get $HERDR_WORKSPACE_ID`). Les fichiers existants sont repris tels quels.
- `nom <x>` → `herdr workspace rename $HERDR_WORKSPACE_ID <x>`.
- `zsh/guake-tmux.zsh` remplacé par `zsh/herdr.zsh` (sourcé en tête de `zshrc`).

## 4. Suppressions

`tmux/`, `guake/patch.py`, `gtk/gtk.css`, `tests/guake-tabs.py`, `zsh/guake-tmux.zsh`. `install.sh` : installe herdr, ne pose plus tmux/TPM/patch/gtk.css. README réécrit.

## 5. Reprise unique (hors dépôt)

Script jetable dans le scratchpad : lit `~/.local/share/tmux/resurrect/last`, crée 1 workspace par set, 1 tab par fenêtre avec son cwd, et le même nombre de panes (tailles non reproduites).

## Travail sur branche

Branche `herdr`. Retour arrière : `git checkout main && ./install.sh`. Aucun commit par Claude : les commandes git sont données à l'utilisateur.

## À vérifier pendant l'implémentation

- `Alt+N` / `Ctrl+Alt+N` arrivent bien à herdr à travers Guake.
- Clic molette = coller, glisser un tab pour le réordonner.
- Format exact de `tab_bar_right` et de `herdr workspace get` (sortie JSON).

## Test

Manuel : relancer Guake, créer 2 workspaces avec 2 tabs et un split, `herdr server stop`, rouvrir → tout est là, historique séparé par workspace.
