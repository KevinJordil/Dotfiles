# dotfiles

Guake + tmux : un set tmux par onglet Guake, restauré après redémarrage, et des onglets assortis (largeur égale, onglet actif en bleu).

## Installer (Ubuntu)

```sh
git clone <ce repo> ~/dotfiles && ~/dotfiles/install.sh
guake --quit; guake &
```

`install.sh` peut être relancé sans risque. Relance-le après une mise à jour de Guake pour remettre le patch.

## Contenu

| Fichier | Rôle | Installé en |
|---|---|---|
| `tmux/tmux.conf` | style de la barre, hooks, resurrect + continuum (sauvegarde toutes les 5 min) | `~/.tmux.conf` (lien) |
| `tmux/tabs.sh` | calcule les onglets tmux en largeur égale, texte centré | `~/.tmux/tabs.sh` (lien) |
| `gtk/gtk.css` | style des onglets Guake | `~/.config/gtk-3.0/gtk.css` (lien) |
| `guake/guake.dconf` | réglages Guake | chargé avec `dconf load` |
| `zsh/guake-tmux.zsh` | rattache chaque onglet à son set tmux, historique par set, fonction `nom` | sourcé en tête de `~/.zshrc` |

Patch Guake : une ligne `tab-expand` ajoutée dans `guake/notebook.py`, avec sudo et une sauvegarde `.bak`.

## Usage

- `nom <x>` : renomme l'onglet Guake et son set tmux. C'est ce nom qui permet de retrouver le set après un redémarrage.
- Réglages Guake modifiés ? Mets à jour le fichier : `dconf dump /org/guake/ | grep -v '^schema-version=' > ~/dotfiles/guake/guake.dconf`

## Limites

- Police `Roboto Mono` attendue par la config Guake (sinon Guake utilise une police par défaut).
- Les onglets Guake sans nom sont retrouvés par leur position.
