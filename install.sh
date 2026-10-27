#!/usr/bin/env bash
# Installe l'environnement Ghostty/Guake + herdr (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
# Usage : ./install.sh console|fenetre
#   console : touche ² → console plein écran par-dessus tout (affichée/masquée, hors dock)
#   fenetre : icône « Console » dans le dock → fenêtre normale agrandie (bordure, réduire, fermer)
set -euo pipefail
MODE=${1:-}
[[ $MODE == console || $MODE == fenetre ]] || { echo "Usage : $0 console|fenetre (console : touche ² plein écran ; fenetre : icône du dock, fenêtre normale)"; exit 1; }
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p ~/.local/bin && export PATH=~/.local/bin:$PATH  # herdr, starship, tode… : visibles dès cette exécution

echo "== Paquets"
missing=()
for p in zsh guake jq curl git; do command -v $p >/dev/null || missing+=($p); done
command -v dconf >/dev/null || missing+=(dconf-cli)  # réglages Guake
command -v notify-send >/dev/null || missing+=(libnotify-bin)  # bin/console : erreurs visibles depuis un raccourci
python3 -c 'import gi; from gi.repository import Gio' 2>/dev/null || missing+=(python3-gi)  # bin/console (D-Bus)
# Pas dans les dépôts Ubuntu : PPA communautaire de Mike Kasberg (cité par ghostty.org). Il ne publie
# rien pour les versions trop anciennes (22.04 : GTK 4.6 < 4.14 exigé par Ghostty) et un PPA sans build
# pour la version en cours fait échouer tout `apt update` en 404 → on retire le PPA et on prend le snap.
. /etc/os-release
PPA=https://ppa.launchpadcontent.net/mkasberg/ghostty-ubuntu/ubuntu
if curl -fsI "$PPA/dists/$VERSION_CODENAME/InRelease" >/dev/null 2>&1; then
  if ! command -v ghostty >/dev/null; then
    command -v add-apt-repository >/dev/null || sudo apt-get install -y software-properties-common
    sudo add-apt-repository -y ppa:mkasberg/ghostty-ubuntu
    missing+=(ghostty)
  fi
else
  LIST=/etc/apt/sources.list.d/mkasberg-ubuntu-ghostty-ubuntu-$VERSION_CODENAME.list
  [[ -f $LIST ]] && { echo "   PPA Ghostty sans build pour $VERSION_CODENAME : retiré (il faisait échouer apt update)"; sudo rm -f "$LIST" /etc/apt/trusted.gpg.d/mkasberg-ubuntu-ghostty-ubuntu.gpg{,~}; }
  if ! command -v ghostty >/dev/null; then
    echo "   Ghostty par snap (il embarque son propre GTK4)"
    command -v snap >/dev/null || { sudo apt-get update; sudo apt-get install -y snapd; }
    sudo snap install ghostty --classic
  fi
fi
(( ${#missing[@]} )) && { sudo apt-get update; sudo apt-get install -y "${missing[@]}"; }

echo "== herdr + navigateur (terminal-browser) + VS Code (tode) dans un pane"
command -v herdr >/dev/null || [[ -x ~/.local/bin/herdr ]] || curl -fsSL https://herdr.dev/install.sh | sh
[[ -x ~/.local/bin/terminal-browser ]] || curl -fsSL https://terminal-browser.sh/install | TERMINAL_BROWSER_SKIP_SETUP=1 bash
[[ -x ~/.local/bin/tode ]] || curl -fsSL https://tode.sh/install | bash
if command -v claude >/dev/null; then
  herdr integration install claude  # état des agents Claude dans la sidebar, reprise au redémarrage
  # sidebar : sujet et dernière demande résumés par Haiku (bin/agent-summary), sous-agents en cours (bin/agent-subagents)
  S=~/.claude/settings.json; [[ -f $S ]] || echo '{}' >$S
  grep -q agent-summary $S || { jq --arg c "$D/bin/agent-summary" '.hooks.UserPromptSubmit += [{hooks: [{type: "command", command: $c}]}]' $S >$S.tmp && mv $S.tmp $S; }
  grep -q agent-subagents $S || { jq --arg c "$D/bin/agent-subagents" '.hooks.SubagentStart += [{hooks: [{type: "command", command: "\($c) start"}]}]
    | .hooks.SubagentStop += [{hooks: [{type: "command", command: "\($c) stop"}]}]' $S >$S.tmp && mv $S.tmp $S; }
fi

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

echo "== Extension GNOME (place la console : seul le Shell peut le faire en Wayland)"
U=console@dotfiles.ch
link "$D/gnome-shell/$U" ~/.local/share/gnome-shell/extensions/$U
if ! gnome-extensions enable $U 2>/dev/null; then  # inconnue du Shell avant la reconnexion : par gsettings
  E=$(gsettings get org.gnome.shell enabled-extensions)
  if [[ $E != *"'$U'"* ]]; then
    E=${E#@as }; E=${E%]}  # liste vide : « @as [] »
    [[ $E == "[" ]] && E="['$U']" || E="$E, '$U']"
    gsettings set org.gnome.shell enabled-extensions "$E"
  fi
fi

echo "== Mode $MODE"
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
shortcut custom0 guake 'env GDK_BACKEND=x11 guake -t' F12  # F12 → Guake (transition) : atteignable sans pavé numérique
# Le snap n'installe pas l'icône dans le thème : son propre .desktop pointe un chemin absolu.
ICON=com.mitchellh.ghostty
SNAP_ICON=/snap/ghostty/current/share/icons/hicolor/512x512/apps/com.mitchellh.ghostty.png
[[ -f $SNAP_ICON ]] && ICON=$SNAP_ICON

fav=$(gsettings get org.gnome.shell favorite-apps)
L=~/.local/share/applications/console.desktop
if [[ $MODE == console ]]; then  # l'autre mode est retiré : on peut changer de mode en relançant le script
  shortcut custom1 'console ghostty' "$D/bin/console" section
  rm -f $L
  gsettings set org.gnome.shell favorite-apps "$(sed "s/, 'console.desktop'//; s/'console.desktop', \?//; s/'console.desktop'//" <<<"$fav")"
else
  shortcut custom1 'console ghostty' "$D/bin/console" ''  # ² désactivée
  mkdir -p ~/.local/share/applications
  cat > $L <<EOF
[Desktop Entry]
Type=Application
Name=Console
Comment=herdr dans une fenêtre normale
Exec=$D/bin/console --window
Icon=$ICON
Terminal=false
StartupWMClass=ch.dotfiles.window
Categories=System;TerminalEmulator;
EOF
  [[ $fav == *console.desktop* ]] || gsettings set org.gnome.shell favorite-apps "${fav%]}, 'console.desktop']"
fi

echo "== Réglages Guake"
dconf load /org/guake/ < "$D/guake/guake.dconf"
gsettings set guake.general default-shell "$(command -v zsh)"  # sinon Guake lance $SHELL de la session, encore bash jusqu'à la reconnexion

echo "OK. Déconnecte-toi puis reconnecte-toi, puis $([[ $MODE == console ]] && echo "touche ²" || echo "icône « Console » du dock")."
echo "   Indispensable : GNOME ne charge une extension qu'au démarrage de la session (Wayland), et les"
echo "   programmes déjà lancés (Guake) gardent en cache la liste des polices d'avant l'installation."
