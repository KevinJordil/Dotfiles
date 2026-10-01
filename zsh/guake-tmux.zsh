# Guake : chaque onglet = un set tmux ; fermer la dernière console ferme l'onglet
# Le set porte le nom de l'onglet (tab<N> si sans nom) → après redémarrage, l'onglet retrouve son set restauré (resurrect)
if [[ -n $GUAKE_TAB_UUID && -z $TMUX ]]; then
  export SHELL=${commands[zsh]}  # tmux ouvre $SHELL : encore bash après chsh tant que la session n'est pas relancée
  _i=$(guake -x $GUAKE_TAB_UUID 2>/dev/null)
  if [[ $_i == <-> ]]; then
    _s=$(jq -r ".workspace[\"0\"][0][$_i] | select(.custom_label_set) | .label" ~/.config/guake/session.json 2>/dev/null)
    _s=${_s:-tab$_i}
    # 1er onglet après redémarrage : restaure les sets sauvegardés (verrou : les onglets démarrent en parallèle)
    flock -o ~/.cache/tmux-restore2.lock zsh -c 'tmux has 2>/dev/null || { tmux new -d -s _boot && tmux run ~/.tmux/plugins/tmux-resurrect/scripts/restore.sh; tmux kill-session -t _boot }'
    # onglet renommé depuis Guake (le set tmux, lui, a gardé tab<N>) : reprend tab<N> s'il est sans client
    if [[ $_s != tab$_i ]] && ! tmux has -t "=$_s" 2>/dev/null \
       && [[ $(tmux display -p -t "=tab$_i:" '#{session_attached}' 2>/dev/null) == 0 ]]; then
      tmux rename-session -t "=tab$_i" "$_s"
      [[ -f ~/.zsh_history.d/$_s || ! -f ~/.zsh_history.d/tab$_i ]] || cp ~/.zsh_history.d/tab$_i ~/.zsh_history.d/$_s
    fi
    # set déjà ouvert dans un autre onglet → set neuf
    [[ $(tmux display -p -t "=$_s:" '#{session_attached}' 2>/dev/null) != [1-9]* ]] && exec tmux new -A -s "$_s"
  fi
  exec tmux new
fi

# Historique par set tmux (initialisé avec l'ancien historique)
if [[ -n $TMUX ]]; then
  mkdir -p ~/.zsh_history.d
  HISTFILE=~/.zsh_history.d/$(tmux display -p '#S')
  [[ -f $HISTFILE || ! -f ~/.zsh_history ]] || cp ~/.zsh_history $HISTFILE
  # à chaque prompt, l'historique suit le nom du set (renommé par `nom`, Guake ou à la main) ; le nouveau part de l'ancien
  _hist_follow() {
    local f=~/.zsh_history.d/$(tmux display -p '#S' 2>/dev/null)
    [[ $f == */ || $HISTFILE == $f ]] && return
    [[ -f $f || ! -f $HISTFILE ]] || cp $HISTFILE $f
    fc -p $f $HISTSIZE $SAVEHIST
  }
  autoload -Uz add-zsh-hook && add-zsh-hook precmd _hist_follow
fi

# nom <x> : renomme l'onglet Guake + le set tmux (l'historique suit au prompt suivant)
nom() {
  guake -r "$1"
  tmux rename-session "$1"
}
