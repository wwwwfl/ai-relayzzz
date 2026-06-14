#!/bin/bash
# airelay shell completion for bash/zsh

_airelay_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"
  
  # Main commands
  local commands="login local local:start local:status agent:install agent:doctor agent:uninstall help"
  
  # Options
  local options="--help --version --config --port --host --dry-run"
  
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${commands}" -- ${cur}))
  elif [[ ${prev} == "--config" ]]; then
    COMPREPLY=($(compgen -f -- ${cur}))
  else
    COMPREPLY=($(compgen -W "${options}" -- ${cur}))
  fi
}

complete -F _airelay_completions airelay
