#!/usr/bin/env bash
# Onglets tmux en largeur égale, texte centré : calcule @tab (libellé déjà paddé) pour chaque fenêtre.
# Appelé par les hooks de ~/.tmux.conf (ajout/suppression/renommage de fenêtre, redimensionnement).
for s in $(tmux ls -F '#{session_id}' 2>/dev/null); do
  mapfile -t wins < <(tmux list-windows -t "$s" -F '#{window_id}	#{window_index}	#{window_width}	#{window_name}')
  n=${#wins[@]}
  for k in "${!wins[@]}"; do
    IFS=$'\t' read -r id idx width name <<< "${wins[k]}"
    avail=$(( width - (n - 1) ))  # moins les séparateurs │
    w=$(( avail / n ))
    (( k == n - 1 )) && w=$(( avail - w * (n - 1) ))  # le dernier prend le reste
    text="$idx $name"
    (( ${#text} > w - 2 )) && text="${text:0:$(( w > 3 ? w - 3 : 0 ))}…"
    left=$(( (w - ${#text}) / 2 ))
    printf -v label '%*s%s%*s' "$left" '' "$text" "$(( w - left - ${#text} ))" ''
    tmux set -w -t "$id" @tab "${label//#/##}"
  done
done
