# claude : demande l'organisation de la session quand il y en a plusieurs (bin/claude-org), sinon transparent.
claude() {
  local tok
  tok=$("$DOTFILES/bin/claude-org" pick "$@") || return
  if [[ $tok ]]; then CLAUDE_CODE_OAUTH_TOKEN=$tok command claude "$@"; else command claude "$@"; fi
}
