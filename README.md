# dotfiles

zsh (Oh My Zsh + Powerlevel10k) + Guake + tmux : un set tmux par onglet Guake, restauré après redémarrage, et des onglets assortis (largeur égale, onglet actif en bleu).

## Installer (Ubuntu ou Arch)

```sh
git clone <ce repo> ~/dotfiles && ~/dotfiles/install.sh
guake --quit; guake &
```

`install.sh` installe zsh + Oh My Zsh + Powerlevel10k + zsh-autosuggestions, et met zsh en shell par défaut (mot de passe demandé). Il peut être relancé sans risque. Relance-le après une mise à jour de Guake pour remettre le patch. Le dépôt peut être cloné ailleurs que dans `~/dotfiles`. Sous Wayland, Guake tourne de lui-même via XWayland, sauf si `GUAKE_ENABLE_WAYLAND` est défini (par exemple dans `/etc/environment`) : en Wayland, GTK 3 plante sur le clic droit et le glisser d'un onglet, et ne connaît pas l'écran principal. `install.sh` le signale.

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

Patchs Guake (`guake/patch.py`, avec sudo, sauvegarde `.bak`) : onglets en largeur égale, numéro `[N]` devant le nom des onglets, renommer un onglet renomme aussi son set tmux, barre du haut avec la date et l'heure centrées, pas de boutons à droite des onglets, barre tmux collée aux onglets Guake, onglets Guake alignés au pixel sur les onglets tmux (à nombre d'onglets égal), sous Wayland : plus de plantage avec « always on primary » (pas d'écran principal : premier écran), ni avec une fenêtre plus large que l'écran (sans `gtk.css`, l'alignement est désactivé), plein écran sur l'écran choisi dans les préférences (et non celui de la souris).

## Correction des onglets masqués

Le patch recalcule les largeurs à l'ajout, à la fermeture, au déplacement et au redimensionnement, même si GTK a déjà masqué des onglets. Les noms longs sont abrégés pour laisser les onglets visibles. Pour appliquer uniquement les patchs Guake après une mise à jour de ce dépôt :

```sh
sudo python3 ~/dotfiles/guake/patch.py "$(python3 -c 'import guake,os;print(os.path.dirname(guake.__file__))')"
```

Relance ensuite Guake pour charger le correctif. Le test de régression utilise une copie temporaire de Guake, sans modifier l'installation : `xvfb-run -a python3 tests/guake-tabs.py` (nécessite GTK 3, VTE, Guake, Xvfb et Roboto Mono installée) ; `--no-css` vérifie que, sans `gtk.css`, les onglets ne débordent jamais de la fenêtre.

## Usage

- Variables, alias et fonctions propres à un PC (pro, chemins locaux) : dans `~/.zshrc.local`, jamais versionné.

- Renommer un onglet (dans Guake ou avec `nom <x>`) renomme aussi son set tmux : c'est ce nom qui permet de retrouver le set après un redémarrage, quel que soit l'ordre des onglets.
- Réglages Guake modifiés ? Mets à jour le fichier : `dconf dump /org/guake/ | grep -v '^schema-version=' > ~/dotfiles/guake/guake.dconf`

## Limites

- Les onglets Guake sans nom sont retrouvés par leur position.
