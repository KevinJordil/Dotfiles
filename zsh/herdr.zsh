# Guake : son unique onglet lance herdr (onglets principaux = workspaces, sous-onglets = tabs)
[[ -n $GUAKE_TAB_UUID && -z $HERDR_ENV ]] && (( $+commands[herdr] )) && exec herdr  # herdr absent : un exec raté fermerait le shell

if [[ -n $HERDR_ENV ]]; then
  # Historique par onglet principal (workspace) ; il suit le renommage, le nouveau part de l'ancien
  mkdir -p ~/.zsh_history.d
  _hist_follow() {
    local n=$(herdr workspace get $HERDR_WORKSPACE_ID 2>/dev/null | jq -r '.result.workspace.label // empty')
    local f=~/.zsh_history.d/${n//\//_}
    [[ -z $n || $HISTFILE == $f ]] && return
    [[ -f $f || ! -f $HISTFILE ]] || cp $HISTFILE $f
    fc -p $f $HISTSIZE $SAVEHIST
  }
  autoload -Uz add-zsh-hook && add-zsh-hook precmd _hist_follow

  # Nom du tab = dossier·programme (dossier seul au repos), comme le renommage auto de tmux.
  # Un nom donné à la main est gardé : on ne renomme que si le nom actuel est un numéro ou le dernier nom auto (fichier par tab)
  _tab_auto() {
    local a=${XDG_RUNTIME_DIR:-/tmp}/herdr-tab-${HERDR_TAB_ID//:/-} n=${PWD:t}${1:+·${1%% *}}
    local cur=$(herdr tab get $HERDR_TAB_ID 2>/dev/null | jq -r '.result.tab.label // empty') last
    [[ -f $a ]] && last=$(<$a)
    [[ $cur == $n || ! ( $cur == <-> || $cur == $last ) ]] && return
    herdr tab rename $HERDR_TAB_ID "$n" >/dev/null && print -r -- $n >$a
  }
  _tab_idle() { _tab_auto; }
  _tab_run() { _tab_auto "$2"; }
  add-zsh-hook precmd _tab_idle
  add-zsh-hook preexec _tab_run

  # Sidebar des agents Claude (titre, dernière demande, shells, état fini) : un seul script par session (verrou)
  ( flock -n 9 && exec ~/dotfiles/bin/herdr-agents ) 9>${XDG_RUNTIME_DIR:-/tmp}/herdr-agents.lock &!

  # nom <x> : renomme l'onglet principal (l'historique suit au prompt suivant)
  nom() { herdr workspace rename $HERDR_WORKSPACE_ID "$1" >/dev/null; }
fi
