#!/usr/bin/env bash
# Installe l'environnement Guake + tmux (Ubuntu). Relançable sans risque : chaque étape vérifie avant d'agir.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)

echo "== Paquets"
missing=()
for p in guake tmux jq xclip git; do command -v $p >/dev/null || missing+=($p); done
(( ${#missing[@]} )) && sudo apt-get install -y "${missing[@]}"

echo "== Plugins tmux"
mkdir -p ~/.tmux/plugins ~/.cache
for p in tmux-resurrect tmux-continuum; do
  [[ -d ~/.tmux/plugins/$p ]] || git clone -q --depth 1 https://github.com/tmux-plugins/$p ~/.tmux/plugins/$p
done

echo "== Liens vers le repo (fichier existant sauvegardé en .bak)"
link() {
  mkdir -p "$(dirname "$2")"
  [[ -e $2 && ! -L $2 ]] && mv "$2" "$2.bak"
  ln -sfn "$1" "$2"
}
link "$D/tmux/tmux.conf" ~/.tmux.conf
link "$D/tmux/tabs.sh" ~/.tmux/tabs.sh
link "$D/gtk/gtk.css" ~/.config/gtk-3.0/gtk.css

echo "== zshrc"
line="source $D/zsh/guake-tmux.zsh  # Guake + tmux (dotfiles) : doit rester en tête"
grep -qF "$D/zsh/guake-tmux.zsh" ~/.zshrc 2>/dev/null || { printf '%s\n\n' "$line" | cat - ~/.zshrc 2>/dev/null > ~/.zshrc.new; mv ~/.zshrc.new ~/.zshrc; }

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
