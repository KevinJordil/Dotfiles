# dotfiles

zsh (Oh My Zsh + Powerlevel10k) + Ghostty + [herdr](https://herdr.dev) : la touche `²`/section affiche ou masque une console Ghostty plein écran (sur l'écran de la souris) qui lance herdr. Onglets principaux (spaces, à gauche) contenant des sous-onglets (tabs) et des splits, restaurés après redémarrage. Un vrai navigateur et VS Code s'ouvrent dans un pane.

Guake reste disponible sur `*` du pavé numérique, le temps de la transition (même session herdr, sans navigateur ni VS Code : Guake n'affiche pas les images kitty).

## Installer (Ubuntu)

```sh
git clone <ce repo> ~/dotfiles && ~/dotfiles/install.sh
```

Ghostty doit être installé à part (https://ghostty.org).

`install.sh` installe zsh + Oh My Zsh + Powerlevel10k + zsh-autosuggestions + herdr + terminal-browser + tode, crée les raccourcis GNOME (`²` → Ghostty, `*` → Guake), et met zsh en shell par défaut (mot de passe demandé). Il peut être relancé sans risque.

## Contenu

| Fichier | Rôle | Installé en |
|---|---|---|
| `herdr/config.toml` | thème herdr.dev, raccourcis, date/heure dans la barre des tabs, sidebar (titre des sessions Claude), cwd suivi | `~/.config/herdr/config.toml` (lien) |
| `bin/console` | affiche/masque la console Ghostty (touche `²`), plein écran sur l'écran de la souris, hors barre des tâches | appelé par le raccourci GNOME |
| `ghostty/config` | police Roboto Mono, Catppuccin Mocha, fond `#11111b`, sans décoration | `~/.config/ghostty/config` (lien) |
| `guake/guake.dconf` | réglages Guake (transition) : un seul onglet, plein écran, mêmes couleurs, touche `*` | chargé avec `dconf load` |
| `zsh/herdr.zsh` | lance herdr dans Guake (Ghostty le lance directement), historique par onglet principal, nom auto des sous-onglets (`dossier·programme`), fonction `nom` | sourcé en tête de `zsh/zshrc` |
| `zsh/zshrc` | zsh générique : Oh My Zsh, Powerlevel10k, plugins git/zsh-autosuggestions/docker ; source `~/.zshrc.local` | `~/.zshrc` (lien) |
| `zsh/p10k.zsh` | config du prompt Powerlevel10k (partie droite sur la ligne de saisie : pas de prompt répété au resize d'un split) | `~/.p10k.zsh` (lien) |
| `fonts/` | Roboto Mono (police de Guake), MesloLGS NF (icônes Powerlevel10k) | `~/.local/share/fonts` (copie) |

## Usage

| Action | Raccourci |
|---|---|
| Onglet principal N | `Ctrl+Alt+N` |
| Sous-onglet N | `Alt+N` |
| Nouveau sous-onglet / onglet principal | `Ctrl+B c` / `Ctrl+B Shift+N` |
| Split vertical / horizontal | `Ctrl+B v` / `Ctrl+B -` |
| Renommer onglet principal / sous-onglet | `Ctrl+B Shift+W` / `Ctrl+B Shift+T` (ou `nom <x>`) |
| Masquer la sidebar | `Ctrl+B b` |
| Navigateur / VS Code dans le pane | `terminal-browser open <url>` / `tode [dossier]` |
| Tous les raccourcis | `Ctrl+B ?` |

- Restauration : herdr sauve seul layouts et dossiers (`~/.config/herdr/session.json`). Les Claude Code ouverts reprennent leur conversation.
- Historique zsh : un fichier par onglet principal dans `~/.zsh_history.d/<nom>`. Il suit le renommage.
- Variables, alias et fonctions propres à un PC (pro, chemins locaux) : dans `~/.zshrc.local`, jamais versionné.
- Réglages Guake modifiés ? `dconf dump /org/guake/ | grep -v '^schema-version=' > ~/dotfiles/guake/guake.dconf`
- Config herdr modifiée ? `herdr config check` puis `herdr server reload-config`.
