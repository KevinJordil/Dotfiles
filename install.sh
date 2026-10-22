#!/usr/bin/env bash
# Installe l'environnement Ghostty/Guake + herdr (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p ~/.local/bin && export PATH=~/.local/bin:$PATH  # herdr, starship, tode… : visibles dès cette exécution
[[ ${XDG_SESSION_TYPE:-x11} == x11 ]] || echo "!! Session $XDG_SESSION_TYPE : bin/console et le clic molette demandent X11 (« Ubuntu sur Xorg », roue dentée à l'écran de connexion)"

echo "== Paquets"
missing=()
for p in zsh guake jq curl git; do command -v $p >/dev/null || missing+=($p); done
command -v dconf >/dev/null || missing+=(dconf-cli)  # réglages Guake
python3 -c 'import Xlib' 2>/dev/null || missing+=(python3-xlib)  # bin/middle-paste
python3 -c "import gi; gi.require_version('Wnck', '3.0')" 2>/dev/null || missing+=(python3-gi gir1.2-wnck-3.0)  # bin/console
if ! command -v ghostty >/dev/null; then  # pas dans les dépôts Ubuntu : PPA communautaire de Mike Kasberg (cité par ghostty.org)
  sudo add-apt-repository -y ppa:mkasberg/ghostty-ubuntu
  missing+=(ghostty)
fi
(( ${#missing[@]} )) && sudo apt-get install -y "${missing[@]}"

echo "== herdr + navigateur (terminal-browser) + VS Code (tode) dans un pane"
command -v herdr >/dev/null || [[ -x ~/.local/bin/herdr ]] || curl -fsSL https://herdr.dev/install.sh | sh
[[ -x ~/.local/bin/terminal-browser ]] || curl -fsSL https://terminal-browser.sh/install | TERMINAL_BROWSER_SKIP_SETUP=1 bash
[[ -x ~/.local/bin/tode ]] || curl -fsSL https://tode.sh/install | bash
command -v claude >/dev/null && herdr integration install claude  # état des agents Claude dans la sidebar, reprise au redémarrage

echo "== Oh My Zsh + Starship + zsh-autosuggestions"
clone() { [[ -d $2 ]] || git clone -q --depth 1 "$1" "$2"; }
clone https://github.com/ohmyzsh/ohmyzsh ~/.oh-my-zsh
clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions
command -v starship >/dev/null || curl -fsSL https://starship.rs/install.sh | sh -s -- -y -b ~/.local/bin
[[ $(getent passwd "$(id -un)" | cut -d: -f7) == */zsh ]] || chsh -s "$(command -v zsh)"  # demande le mot de passe

echo "== Polices (Roboto Mono pour Guake, MesloLGS NF pour les icônes du prompt)"
mkdir -p ~/.local/share/fonts
for f in "$D"/fonts/*.ttf; do [[ -e ~/.local/share/fonts/${f##*/} ]] || cp "$f" ~/.local/share/fonts/; done
fc-cache -f ~/.local/share/fonts || echo "fc-cache a échoué (les polices seront prises en compte à la reconnexion)"

echo "== Liens vers le repo (fichier existant sauvegardé en .bak)"
link() {
  mkdir -p "$(dirname "$2")"
  [[ -e $2 && ! -L $2 ]] && mv "$2" "$2.bak"
  ln -sfn "$1" "$2"
}
link "$D/herdr/config.toml" ~/.config/herdr/config.toml
link "$D/ghostty/config" ~/.config/ghostty/config
link "$D/zsh/zshrc" ~/.zshrc  # réglages propres au PC : ~/.zshrc.local (hors repo)

echo "== Réglages Guake"
dconf load /org/guake/ < "$D/guake/guake.dconf"
gsettings set guake.general default-shell "$(command -v zsh)"  # sinon Guake lance $SHELL de la session, encore bash jusqu'à la reconnexion

echo "== Raccourcis GNOME : ² → console Ghostty (bin/console), * du pavé numérique → Guake"
K=org.gnome.settings-daemon.plugins.media-keys
P=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings
shortcut() {  # shortcut <customN> <nom> <commande> <touche>
  gsettings set $K.custom-keybinding:$P/$1/ name "$2"
  gsettings set $K.custom-keybinding:$P/$1/ command "$3"
  gsettings set $K.custom-keybinding:$P/$1/ binding "$4"
  local l=$(gsettings get $K custom-keybindings)
  [[ $l == *"$P/$1/"* ]] && return
  l=${l#@as }; l=${l%]}  # liste vide : « @as [] »
  [[ $l == "[" ]] && l="['$P/$1/']" || l="$l, '$P/$1/']"
  gsettings set $K custom-keybindings "$l"
}
shortcut custom0 guake 'env GDK_BACKEND=x11 guake -t' KP_Multiply
shortcut custom1 'console ghostty' "$D/bin/console" section

echo "OK. Déconnecte-toi puis reconnecte-toi (shell zsh, ~/.local/bin dans le PATH du raccourci ²), puis touche ²."
