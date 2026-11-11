# dotfiles

zsh (Oh My Zsh + Starship) + Ghostty + [herdr](https://herdr.dev) : la touche `²`/section affiche ou masque une console Ghostty plein écran (sur l'écran de la souris) qui lance herdr. Onglets principaux (spaces, à gauche) contenant des sous-onglets (tabs) et des splits, restaurés après redémarrage. Un vrai navigateur et VS Code s'ouvrent dans un pane.

Guake reste disponible sur `*` du pavé numérique, le temps de la transition (même session herdr, sans navigateur ni VS Code : Guake n'affiche pas les images kitty).

## Installer (Ubuntu)

```sh
git clone <ce repo> ~/dotfiles && ~/dotfiles/install.sh
```

Fonctionne en **Wayland comme en X11** : c'est l'extension GNOME `gnome-shell/console@dotfiles.ch` qui place la console, car en Wayland un client ne peut ni déplacer ni activer la fenêtre d'un autre client. Se déconnecter puis se reconnecter après l'installation : en Wayland, le Shell ne charge une nouvelle extension qu'au démarrage de la session.

`install.sh` installe Ghostty (PPA `mkasberg/ghostty-ubuntu`, ou le snap `ghostty` quand le PPA ne publie rien pour la version d'Ubuntu en cours — 22.04 : GTK 4.6 alors que Ghostty exige 4.14) + zsh + Oh My Zsh + Starship + zsh-autosuggestions + herdr + terminal-browser + tode, installe l'app Herdr, crée les raccourcis GNOME (`²` → app Herdr, `F12` → Guake), et met zsh en shell par défaut (mot de passe demandé). Il peut être relancé sans risque.

## Contenu

| Fichier | Rôle | Installé en |
|---|---|---|
| `herdr/config.toml` | thème Catppuccin, raccourcis, date/heure dans la barre des tabs, sidebar des agents Claude (voir `bin/herdr-agents`), `Ctrl+B Shift+←/→` déplace un tab, cwd suivi | `~/.config/herdr/config.toml` (lien) |
| `bin/console` | touche `²` : amène l'app Herdr devant sur l'écran de la souris (agrandie, pas plein écran) ; déjà au premier plan sur cet écran, la réduit ; la lance si besoin. Passe par l'extension GNOME (`ToggleApp`), sinon Wnck en X11 | appelé par le raccourci GNOME |
| `gnome-shell/console@dotfiles.ch` | extension GNOME Shell (42-44), appelée en D-Bus sur `ch.dotfiles.Console` : `ToggleApp` place l'app Herdr (écran de la souris, agrandie) ou la réduit ; `Toggle` place l'ancienne console Ghostty (plein écran, tous les bureaux, cachée d'Alt+Tab). En Wayland, seul le Shell peut déplacer la fenêtre d'un autre client | `~/.local/share/gnome-shell/extensions/` (lien) |
| `bin/herdr-agents` | sidebar des agents Claude : sujet de la session coloré selon l'état (blanc idle, vert fini, rouge bloqué, jaune en cours, avec spinner), dernière demande, sous-agents et shells encore ouverts | lancé par `zsh/herdr.zsh` |
| `bin/agent-subagents` | hooks Claude Code `SubagentStart` / `SubagentStop` : sous-agents en cours, comptés dans la sidebar | `~/.claude/settings.json` (par `install.sh`) |
| `bin/agent-session` | hooks Claude Code `SessionStart` / `SessionEnd` : dans l'app Herdr, retient la session Claude de chaque terminal (`/exit` l'oublie) | `~/.claude/settings.json` (par `install.sh`) |
| `bin/herdr-app-restore` | après un redémarrage, reprend dans chaque terminal de l'app la session Claude retenue | autostart GNOME (par `install.sh`) |
| `bin/herdr-app-agents` | titre, dernière demande, sous-agents et shells de chaque Claude de l'app, pour le mod `claude-agents` | appelé par le mod |
| `bin/claude-usage` | compte et organisation Claude, limites session (5 h) et semaine, en haut à droite de l'app (mod `kevin-tabs`, à la place de Files) ; un clic ouvre le menu du compte | appelé par le mod, API interrogée toutes les 5 min au plus |
| `bin/claude-org` | organisation Claude choisie au lancement de `claude` quand il y en a plusieurs (`claude-org add` : jeton longue durée de `claude setup-token` dans `~/.config/claude-orgs`), aucune question sinon ; une reprise dans l'app garde l'organisation du terminal | fonction `claude` de `zsh/claude.zsh`, bouton « Ajouter une organisation… » du menu |
| `herdr-app/layouts/kevin.json` | mise en page de l'app Herdr : sans en-tête ni pied, agents et barre d'état personnalisés | `~/.config/herdr-app/layouts` (lien, activée par `install.sh`) |
| `herdr-app/settings.json` | réglages de l'app : zoom 1,2, sons | fusionné dans `~/.config/herdr-app/settings.json` |
| `herdr-app/mods/kevin-spaces` | spaces sur deux lignes : nom, puis tabs, agents (en cours, finis, bloqués) et accès direct aux panneaux (ex. Atelier) | `~/.config/herdr-app/mods` (lien) |
| `herdr-app/mods/claude-agents` | agents en cartes, une seule liste dans l'ordre des spaces : icône d'état (spinner, ✔, !), titre du projet, dernière demande, sous-agents et shells | `~/.config/herdr-app/mods` (lien) |
| `herdr-app/mods/kevin-status` | barre d'état : **Nettoyer** (shells en double ou dans `~`, agents inactifs 2 jours), recherche, barre latérale, machines, réglages | `~/.config/herdr-app/mods` (lien) |
| `herdr-app/mods/firmware` | tab « Atelier » du space Firmware : flasher carte et modules, logs, sysinfo, ports série, pour la carte choisie | `~/.config/herdr-app/mods` (lien) |
| `bin/agent-summary` | hook Claude Code `UserPromptSubmit` : Haiku résume en arrière-plan le sujet de la session (adapté à chaque demande) et la dernière demande | `~/.claude/settings.json` (par `install.sh`) |
| `ghostty/config` | police Roboto Mono, Catppuccin Mocha, fond `#11111b`, sans décoration, shift+clic molette = coller la sélection | `~/.config/ghostty/config` (lien) |
| `guake/guake.dconf` | réglages Guake (transition) : un seul onglet, plein écran, mêmes couleurs, touche `*` | chargé avec `dconf load` |
| `zsh/herdr.zsh` | lance herdr dans Guake (Ghostty le lance directement), historique par onglet principal, nom auto des sous-onglets (`dossier·programme`), fonction `nom` | sourcé en tête de `zsh/zshrc` |
| `zsh/claude.zsh` | fonction `claude` : demande l'organisation (`bin/claude-org pick`) puis lance Claude avec son jeton | sourcé par `zsh/zshrc` |
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
- Mods de l'app modifiés dans `~/dotfiles/herdr-app` ? L'app ne voit pas les changements à travers les liens : `Ctrl+Shift+L` deux fois (changer de mise en page et revenir) les recharge.
