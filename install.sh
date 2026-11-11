#!/usr/bin/env bash
# Installe l'environnement Ghostty/Guake + herdr (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
# Touche ² : app Herdr (bin/console) ; * du pavé numérique : Guake.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p ~/.local/bin && export PATH=~/.local/bin:$PATH  # herdr, starship, tode… : visibles dès cette exécution
[[ ${XDG_SESSION_TYPE:-x11} == x11 ]] || echo "!! Session $XDG_SESSION_TYPE : la touche ² (bin/console) demande X11 (« Ubuntu sur Xorg », roue dentée à l'écran de connexion)"

echo "== Paquets"
missing=()
for p in zsh guake jq curl git; do command -v $p >/dev/null || missing+=($p); done
command -v dconf >/dev/null || missing+=(dconf-cli)  # réglages Guake
python3 -c "import gi; gi.require_version('Wnck', '3.0')" 2>/dev/null || missing+=(python3-gi gir1.2-wnck-3.0)  # bin/console
fc-list : family | grep -q "Ubuntu Sans Mono" || missing+=(fonts-ubuntu)  # police des terminaux de l'app Herdr
if ! command -v ghostty >/dev/null; then  # pas dans les dépôts Ubuntu : PPA communautaire de Mike Kasberg (cité par ghostty.org)
  sudo add-apt-repository -y ppa:mkasberg/ghostty-ubuntu
  missing+=(ghostty)
fi
(( ${#missing[@]} )) && sudo apt-get install -y "${missing[@]}"

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

echo "== Raccourcis : ² → app Herdr, * → Guake"
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
shortcut custom0 guake 'env GDK_BACKEND=x11 guake -t' KP_Multiply  # * du pavé numérique → Guake (transition)
shortcut custom1 'app herdr' "$D/bin/console" section  # ² : app Herdr devant sur l'écran de la souris, ou réduite
# ancien lanceur « Console » (Ghostty) : retiré du dock
rm -f ~/.local/share/applications/console.desktop
fav=$(gsettings get org.gnome.shell favorite-apps)
gsettings set org.gnome.shell favorite-apps "$(sed "s/, 'console.desktop'//; s/'console.desktop', \?//; s/'console.desktop'//" <<<"$fav")"

echo "== Réglages Guake"
dconf load /org/guake/ < "$D/guake/guake.dconf"
gsettings set guake.general default-shell "$(command -v zsh)"  # sinon Guake lance $SHELL de la session, encore bash jusqu'à la reconnexion

echo "OK. Déconnecte-toi puis reconnecte-toi (shell zsh, ~/.local/bin dans le PATH), puis touche ²."
