# dotfiles

zsh (Oh My Zsh + Starship) + Ghostty + [herdr](https://herdr.dev) : la touche `²`/section affiche ou masque une console Ghostty plein écran (sur l'écran de la souris) qui lance herdr. Onglets principaux (spaces, à gauche) contenant des sous-onglets (tabs) et des splits, restaurés après redémarrage. Un vrai navigateur et VS Code s'ouvrent dans un pane.

Guake reste disponible sur `*` du pavé numérique, le temps de la transition (même session herdr, sans navigateur ni VS Code : Guake n'affiche pas les images kitty).

## Installer (Ubuntu)

```sh
git clone <ce repo> ~/dotfiles && ~/dotfiles/install.sh console   # ou : fenetre
```

Fonctionne en **Wayland comme en X11** : c'est l'extension GNOME `gnome-shell/console@dotfiles.ch` qui place la console, car en Wayland un client ne peut ni déplacer ni activer la fenêtre d'un autre client. Se déconnecter puis se reconnecter après l'installation : en Wayland, le Shell ne charge une nouvelle extension qu'au démarrage de la session.

`install.sh` installe Ghostty (PPA `mkasberg/ghostty-ubuntu`, ou le snap `ghostty` quand le PPA ne publie rien pour la version d'Ubuntu en cours — 22.04 : GTK 4.6 alors que Ghostty exige 4.14) + zsh + Oh My Zsh + Starship + zsh-autosuggestions + herdr + terminal-browser + tode, installe le mode choisi (obligatoire) — `console` : touche `²` → console plein écran par-dessus tout ; `fenetre` : icône « Console » dans le dock → fenêtre normale agrandie (bordure, réduire, fermer) — plus `*` → Guake, et met zsh en shell par défaut (mot de passe demandé). Il peut être relancé sans risque, aussi pour changer de mode (l'autre est retiré).

## Contenu

| Fichier | Rôle | Installé en |
|---|---|---|
| `herdr/config.toml` | thème Catppuccin, raccourcis, date/heure dans la barre des tabs, sidebar des agents Claude (voir `bin/herdr-agents`), `Ctrl+B Shift+←/→` déplace un tab, cwd suivi | `~/.config/herdr/config.toml` (lien) |
| `bin/console` | demande à l'extension GNOME d'afficher/masquer la console Ghostty (touche `²`), plein écran sur l'écran de la souris, sur tous les bureaux ; lance Ghostty si la fenêtre n'existe pas ; `--window` : même session dans une fenêtre normale agrandie (lanceur « Console » du dock) | appelé par le raccourci GNOME |
| `gnome-shell/console@dotfiles.ch` | extension GNOME Shell (42-44) : place la fenêtre de la console (écran de la souris, plein écran, tous les bureaux, au-dessus), l'affiche ou la masque, et attend son apparition au premier lancement. La masque aussi d'Alt+Tab, d'Alt+Échap et de la vue d'ensemble, comme Guake (`skip-taskbar` est en lecture seule dans Mutter : on filtre `get_running`, `get_tab_list` et `_isOverviewWindow`). Appelée en D-Bus sur `ch.dotfiles.Console` | `~/.local/share/gnome-shell/extensions/` (lien) |
| `bin/herdr-agents` | sidebar des agents Claude : sujet de la session coloré selon l'état (blanc idle, vert fini, rouge bloqué, jaune en cours, avec spinner), dernière demande, sous-agents et shells encore ouverts | lancé par `zsh/herdr.zsh` |
| `bin/agent-subagents` | hooks Claude Code `SubagentStart` / `SubagentStop` : sous-agents en cours, comptés dans la sidebar | `~/.claude/settings.json` (par `install.sh`) |
| `bin/agent-summary` | hook Claude Code `UserPromptSubmit` : Haiku résume en arrière-plan le sujet de la session (adapté à chaque demande) et la dernière demande | `~/.claude/settings.json` (par `install.sh`) |
| `ghostty/config` | police Roboto Mono, Catppuccin Mocha, fond `#11111b`, sans décoration, shift+clic molette = coller la sélection | `~/.config/ghostty/config` (lien) |
| `guake/guake.dconf` | réglages Guake (transition) : un seul onglet, plein écran, mêmes couleurs, touche `*` | chargé avec `dconf load` |
| `zsh/herdr.zsh` | lance herdr dans Guake (Ghostty le lance directement), historique par onglet principal, nom auto des sous-onglets (`dossier·programme`), fonction `nom` | sourcé en tête de `zsh/zshrc` |
| `zsh/zshrc` | zsh générique : Oh My Zsh, Starship, plugins git/zsh-autosuggestions/docker ; source `~/.zshrc.local` | `~/.zshrc` (lien) |
| `zsh/starship.toml` | prompt Starship (mise en page p10k lean, Catppuccin, git détaillé, Docker ; partie droite sur la ligne de saisie : pas de prompt répété au resize d'un split) | via `STARSHIP_CONFIG` |
| `fonts/` | Roboto Mono (police de Guake), MesloLGS NF (icônes du prompt) | `~/.local/share/fonts` (copie) |

## Usage

| Action | Raccourci |
|---|---|
| Onglet principal N | `Ctrl+Alt+N` |
| Sous-onglet N | `Alt+N` |
| Nouveau sous-onglet / onglet principal | `Ctrl+B c` / `Ctrl+B Shift+N` |
| Split vertical / horizontal | `Ctrl+B v` / `Ctrl+B -` |
| Renommer onglet principal / sous-onglet | `Ctrl+B Shift+W` / `Ctrl+B Shift+T` (ou `nom <x>`) |
| Masquer la sidebar | `Ctrl+B b` |
| Coller (herdr capture la souris) | `Shift+clic molette` (sélection) ou `Ctrl+Shift+V` |
| Navigateur / VS Code dans le pane | `terminal-browser open <url>` / `tode [dossier]` |
| Tous les raccourcis | `Ctrl+B ?` |

- Restauration : herdr sauve seul layouts et dossiers (`~/.config/herdr/session.json`). Les Claude Code ouverts reprennent leur conversation.
- Historique zsh : un fichier par onglet principal dans `~/.zsh_history.d/<nom>`. Il suit le renommage.
- Variables, alias et fonctions propres à un PC (pro, chemins locaux) : dans `~/.zshrc.local`, jamais versionné.
- Réglages Guake modifiés ? `dconf dump /org/guake/ | grep -v '^schema-version=' > $DOTFILES/guake/guake.dconf`
- Config herdr modifiée ? `herdr config check` puis `herdr server reload-config`.
