#!/usr/bin/env bash
# Installe l'environnement Ghostty/Guake + herdr (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)

echo "== Paquets"
missing=()
for p in zsh guake jq curl git; do command -v $p >/dev/null || missing+=($p); done
(( ${#missing[@]} )) && sudo apt-get install -y "${missing[@]}"

echo "== herdr + navigateur (terminal-browser) + VS Code (tode) dans un pane"
command -v herdr >/dev/null || [[ -x ~/.local/bin/herdr ]] || curl -fsSL https://herdr.dev/install.sh | sh
[[ -x ~/.local/bin/terminal-browser ]] || curl -fsSL https://terminal-browser.sh/install | TERMINAL_BROWSER_SKIP_SETUP=1 bash
[[ -x ~/.local/bin/tode ]] || curl -fsSL https://tode.sh/install | bash
command -v ghostty >/dev/null || echo "Ghostty absent : installe-le (https://ghostty.org), la touche ² l'utilise"

echo "== Oh My Zsh + Powerlevel10k + zsh-autosuggestions"
clone() { [[ -d $2 ]] || git clone -q --depth 1 "$1" "$2"; }
clone https://github.com/ohmyzsh/ohmyzsh ~/.oh-my-zsh
clone https://github.com/romkatv/powerlevel10k ~/.oh-my-zsh/custom/themes/powerlevel10k
clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions
[[ $(getent passwd "$USER" | cut -d: -f7) == */zsh ]] || chsh -s "$(command -v zsh)"  # demande le mot de passe

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
link "$D/zsh/p10k.zsh" ~/.p10k.zsh

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

echo "OK. Touche ² : console Ghostty. Relance Guake si besoin : guake --quit; guake &"
