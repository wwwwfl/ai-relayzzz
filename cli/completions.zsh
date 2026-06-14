#compdef airelay

_airelay() {
  local line state

  _arguments -C \
    "1: :->cmds" \
    "*::arg:->args"

  case "$state" in
    cmds)
      _values "airelay command" \
        "login[Bind device to cloud admin]" \
        "local[Manage local relay server]" \
        "local:start[Start local relay server]" \
        "local:status[Show status and configuration]" \
        "agent:install[Install agent adapter]" \
        "agent:doctor[Check agent configuration]" \
        "agent:uninstall[Uninstall agent adapter]" \
        "help[Display help]"
      ;;
    args)
      case $line[1] in
        local:start)
          _arguments \
            "--config[Config file path]:file:_files" \
            "--port[Port number]:port:" \
            "--host[Host address]:host:"
          ;;
        agent:install)
          _arguments \
            "--dry-run[Show what would be changed]"
          ;;
      esac
      ;;
  esac
}

_airelay "$@"
