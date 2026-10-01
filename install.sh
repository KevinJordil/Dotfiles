#!/usr/bin/env bash
# Installe l'environnement Guake + tmux (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)

echo "== Paquets"
missing=()
for p in zsh guake tmux jq xclip git; do command -v $p >/dev/null || missing+=($p); done
(( ${#missing[@]} )) && sudo apt-get install -y "${missing[@]}"

echo "== Oh My Zsh + Powerlevel10k + zsh-autosuggestions"
clone() { [[ -d $2 ]] || git clone -q --depth 1 "$1" "$2"; }
clone https://github.com/ohmyzsh/ohmyzsh ~/.oh-my-zsh
clone https://github.com/romkatv/powerlevel10k ~/.oh-my-zsh/custom/themes/powerlevel10k
clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions
[[ $(getent passwd "$USER" | cut -d: -f7) == */zsh ]] || chsh -s "$(command -v zsh)"  # demande le mot de passe

echo "== Plugins tmux"
mkdir -p ~/.tmux/plugins ~/.cache
for p in tmux-resurrect tmux-continuum; do clone https://github.com/tmux-plugins/$p ~/.tmux/plugins/$p; done

echo "== Liens vers le repo (fichier existant sauvegardé en .bak)"
link() {
  mkdir -p "$(dirname "$2")"
  [[ -e $2 && ! -L $2 ]] && mv "$2" "$2.bak"
  ln -sfn "$1" "$2"
}
link "$D/tmux/tmux.conf" ~/.tmux.conf
link "$D/tmux/tabs.sh" ~/.tmux/tabs.sh
link "$D/gtk/gtk.css" ~/.config/gtk-3.0/gtk.css
link "$D/zsh/zshrc" ~/.zshrc  # réglages propres au PC : ~/.zshrc.local (hors repo)
link "$D/zsh/p10k.zsh" ~/.p10k.zsh

echo "== Réglages Guake"
dconf load /org/guake/ < "$D/guake/guake.dconf"

echo "== Patch Guake : onglets en largeur égale (à refaire après une mise à jour de Guake)"
nb=$(python3 -c 'import guake,os;print(os.path.dirname(guake.__file__))')/notebook.py
if grep -q '"tab-expand"' "$nb"; then
  echo "déjà appliqué"
else
  sudo sed -i.bak '/self.set_tab_reorderable(root_terminal_box, True)/a\        self.child_set_property(root_terminal_box, "tab-expand", True)  # onglets en largeur égale' "$nb"
  grep -q '"tab-expand"' "$nb" || echo "ATTENTION : patch non appliqué (code de Guake différent ?)"
fi

echo "OK. Relance Guake : guake --quit; guake &"
