# claude : demande l'organisation de la session quand il y en a plusieurs (bin/claude-org), sinon transparent.
# Dans l'app Herdr (HC_TERMINAL_ID), une session interactive s'ouvre dans la vue Discussion (claude/gui/bridge.mjs) ;
# `claude --tui …` garde la console, comme tout ce que la Discussion ne sait pas prendre (-p, sous-commandes, autres options).
# Chaque appel relit ce fichier : un shell déjà ouvert suit ses modifications sans être relancé.
claude() { source "$DOTFILES/zsh/claude.zsh" && _claude "$@"; }

_claude() {
  local tok gui=
  if [[ $1 == --tui ]]; then shift
  elif [[ $HC_TERMINAL_ID ]] && _claude_gui_args "$@"; then gui=1
  fi
  tok=$("$DOTFILES/bin/claude-org" pick "$@") || return
  local run=(command claude)
  [[ $gui ]] && run=(node "$DOTFILES/claude/gui/bridge.mjs")
  if [[ $tok ]]; then CLAUDE_CODE_OAUTH_TOKEN=$tok "${run[@]}" "$@"; else "${run[@]}" "$@"; fi
}

# Ce que la Discussion prend : --resume/-r [<id> | <recherche>] (sans rien : son sélecteur), --continue/-c,
# --model <m>, --permission-mode <m>, puis un prompt. Le premier mot qui n'est pas une option est le prompt,
# sauf s'il nomme une sous-commande.
_claude_gui_args() {
  while (( $# )); do
    case $1 in
      --resume|-r) [[ $2 && $2 != -* ]] && shift; shift ;;
      --model|--permission-mode) [[ $2 && $2 != -* ]] || return 1; shift 2 ;;
      --continue|-c) shift ;;
      -*) return 1 ;;
      auth|mcp|plugin|plugins|setup-token|doctor|update|upgrade|install|config|migrate-installer|agents|ultrareview|purge|respawn|remote-control) return 1 ;;
      *) return 0 ;;
    esac
  done
  return 0
}
