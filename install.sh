#!/usr/bin/env bash
# Installe l'environnement Ghostty/Guake + herdr (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
# Touche ² : app Herdr (bin/console) ; * du pavé numérique : Guake.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p ~/.local/bin && export PATH=~/.local/bin:$PATH  # herdr, starship, tode… : visibles dès cette exécution

echo "== Paquets"
missing=()
for p in zsh guake jq curl git; do command -v $p >/dev/null || missing+=($p); done
command -v dconf >/dev/null || missing+=(dconf-cli)  # réglages Guake
python3 -c "import gi; gi.require_version('Wnck', '3.0')" 2>/dev/null || missing+=(gir1.2-wnck-3.0)  # bin/console : repli X11 sans l'extension
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
  # app Herdr : session Claude de chaque terminal retenue (bin/agent-session), reprise à l'ouverture de session
  grep -q agent-session $S || { jq --arg c "$D/bin/agent-session" '.hooks.SessionStart += [{hooks: [{type: "command", command: "\($c) start"}]}]
    | .hooks.SessionEnd += [{hooks: [{type: "command", command: "\($c) end"}]}]' $S >$S.tmp && mv $S.tmp $S; }
  # affichage : plein écran, vue focus (tour replié en une ligne + message final, Ctrl+O pour le détail),
  # réponses au style « Clair et résumé » (claude/output-styles, lié plus bas)
  # (le style remplace le plugin i-have-adhd, désactivé, et son interrupteur « toujours actif »)
  jq '.tui = "fullscreen" | .viewMode = "focus" | .outputStyle = "Clair et résumé"
    | .enabledPlugins["i-have-adhd@i-have-adhd"] = false' $S >$S.tmp && mv $S.tmp $S
  rm -f ~/.claude/.i-have-adhd-always
  # mod chat-bubbles (claude/plugins) : bulle « Toi », en-tête ✦ Assistant, fin de tour sur une ligne ; lu depuis le
  # repo même, une modification s'applique avec /reload-plugins
  claude plugin marketplace list 2>/dev/null | grep -q dotfiles || claude plugin marketplace add "$D/claude"
  claude plugin list 2>/dev/null | grep -q chat-bubbles@dotfiles || claude plugin install chat-bubbles@dotfiles --scope user
  mkdir -p ~/.config/autostart
  printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=Herdr : reprise des agents Claude' \
    "Exec=$D/bin/herdr-app-restore" 'X-GNOME-Autostart-enabled=true' 'NoDisplay=true' >~/.config/autostart/herdr-app-restore.desktop
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
link "$D/claude/output-styles/clair-et-resume.md" ~/.claude/output-styles/clair-et-resume.md

echo "== App Herdr (herdr-core) : sidebar des agents, barre d'état (Nettoyer), atelier firmware"
command -v herdr-app >/dev/null || [[ -x ~/.local/bin/herdr-app ]] || curl -fsSL https://releases.herdr.dev/app/install.sh | sh
for m in "$D"/herdr-app/mods/*/; do m=${m%/}; link "$m" ~/.config/herdr-app/mods/${m##*/}; done
link "$D/herdr-app/layouts/kevin.json" ~/.config/herdr-app/layouts/kevin.json
# réglages (zoom, sons…) : ceux du repo s'ajoutent aux existants ; pas de lien, l'app réécrit ce fichier
A=~/.config/herdr-app/settings.json; [[ -f $A ]] || echo '{}' >$A
jq -s '.[0] * .[1]' $A "$D/herdr-app/settings.json" >$A.tmp && mv $A.tmp $A
# mise en page « kevin » affichée : app ouverte → tout de suite, sinon au prochain démarrage
herdr-app do layout.switch --name kevin >/dev/null 2>&1 || {
  A=~/.config/herdr-app/shared.json; [[ -f $A ]] || echo '{}' >$A
  jq '.layout = "kevin"' $A >$A.tmp && mv $A.tmp $A
}

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

echo "== Raccourcis : ² → app Herdr, F12 → Guake"
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
shortcut custom1 'app herdr' "$D/bin/console" section  # ² : app Herdr devant sur l'écran de la souris, ou réduite
# ancien lanceur « Console » (Ghostty) : retiré du dock
rm -f ~/.local/share/applications/console.desktop
fav=$(gsettings get org.gnome.shell favorite-apps)
gsettings set org.gnome.shell favorite-apps "$(sed "s/, 'console.desktop'//; s/'console.desktop', \?//; s/'console.desktop'//" <<<"$fav")"

echo "== Réglages Guake"
dconf load /org/guake/ < "$D/guake/guake.dconf"
gsettings set guake.general default-shell "$(command -v zsh)"  # sinon Guake lance $SHELL de la session, encore bash jusqu'à la reconnexion

echo "OK. Déconnecte-toi puis reconnecte-toi (shell zsh, ~/.local/bin dans le PATH), puis touche ²."
echo "   Indispensable : GNOME ne charge une extension qu'au démarrage de la session (Wayland), et les"
echo "   programmes déjà lancés (Guake) gardent en cache la liste des polices d'avant l'installation."
