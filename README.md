# dotfiles

zsh (Oh My Zsh + Powerlevel10k) + Guake + tmux : un set tmux par onglet Guake, restauré après redémarrage, et des onglets assortis (largeur égale, onglet actif en bleu).

## Installer (Ubuntu)

```sh
git clone <ce repo> ~/dotfiles && ~/dotfiles/install.sh
guake --quit; guake &
```

`install.sh` installe zsh + Oh My Zsh + Powerlevel10k + zsh-autosuggestions, et met zsh en shell par défaut (mot de passe demandé). Il peut être relancé sans risque. Relance-le après une mise à jour de Guake pour remettre le patch.

## Contenu

| Fichier | Rôle | Installé en |
|---|---|---|
| `tmux/tmux.conf` | style de la barre, hooks, resurrect + continuum (sauvegarde toutes les 5 min) | `~/.tmux.conf` (lien) |
| `tmux/tabs.sh` | calcule les onglets tmux en largeur égale, texte centré | `~/.tmux/tabs.sh` (lien) |
| `gtk/gtk.css` | style des onglets Guake | `~/.config/gtk-3.0/gtk.css` (lien) |
| `fonts/` | Roboto Mono (police de Guake), MesloLGS NF (icônes Powerlevel10k) | `~/.local/share/fonts` (copie) |
| `guake/guake.dconf` | réglages Guake | chargé avec `dconf load` |
| `zsh/zshrc` | zsh générique : Oh My Zsh, Powerlevel10k, plugins git/zsh-autosuggestions/docker ; source `~/.zshrc.local` | `~/.zshrc` (lien) |
| `zsh/p10k.zsh` | config du prompt Powerlevel10k | `~/.p10k.zsh` (lien) |
| `zsh/guake-tmux.zsh` | rattache chaque onglet à son set tmux, historique par set, fonction `nom` | sourcé en tête de `zsh/zshrc` |

Patchs Guake (`guake/patch.py`, avec sudo, sauvegarde `.bak`) : onglets en largeur égale, et barre du haut avec la date et l'heure centrées.

## Usage

- Variables, alias et fonctions propres à un PC (pro, chemins locaux) : dans `~/.zshrc.local`, jamais versionné.

- `nom <x>` : renomme l'onglet Guake et son set tmux. C'est ce nom qui permet de retrouver le set après un redémarrage.
- Réglages Guake modifiés ? Mets à jour le fichier : `dconf dump /org/guake/ | grep -v '^schema-version=' > ~/dotfiles/guake/guake.dconf`

## Limites

- Les onglets Guake sans nom sont retrouvés par leur position.
