#!/usr/bin/env bash
# Ban macOS/Linux cua start-node-red.ps1. Cach dung: ./nodered/start-node-red.sh [--sync-flow]
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
install_root="${ORCHID_NODE_RED_HOME:-$HOME/.orchid-node-red}"
user_dir="$install_root/data"
node_red_entry="$install_root/node_modules/node-red/red.js"
dashboard_package="$install_root/node_modules/@flowfuse/node-red-dashboard/package.json"
flow_file="$user_dir/flows.json"
auth_file="$user_dir/orchid-auth.json"
install_hint="npm install --prefix \"$install_root\" --no-save node-red @flowfuse/node-red-dashboard"

if [[ ! -f "$node_red_entry" || ! -f "$dashboard_package" ]]; then
  echo "Node-RED / FlowFuse Dashboard 2 is not installed. Run: $install_hint" >&2
  exit 1
fi

mkdir -p "$user_dir"
if [[ ! -f "$auth_file" ]]; then
  echo "Dashboard login is not configured. Create an admin account first:" >&2
  echo "  node \"$script_dir/set-dashboard-password.cjs\" \"$auth_file\" --user admin --role admin" >&2
  exit 1
fi
export ORCHID_AUTH_FILE="$auth_file"

if [[ ! -f "$flow_file" ]]; then
  cp "$script_dir/orchid-flow.json" "$flow_file"
elif [[ "${1:-}" == "--sync-flow" ]]; then
  cp "$flow_file" "$user_dir/flows.backup.$(date +%Y%m%d-%H%M%S).json"
  cp "$script_dir/orchid-flow.json" "$flow_file"
fi

cd "$user_dir"
exec node "$node_red_entry" --userDir "$user_dir" --settings "$script_dir/settings.js"
