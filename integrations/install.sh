#!/bin/sh
set -eu
# One command; no package manager, sudo, or changes to the system Node installation.
wedraft_base=${1:?Usage: install.sh https://your-site/integrations/ [installer options]}
shift
case "$wedraft_base" in
  https://*|http://127.0.0.1/*|http://127.0.0.1:*/*|http://localhost/*|http://localhost:*/*) ;;
  *) echo 'WeDraft requires HTTPS, or HTTP on this computer (localhost).' >&2; exit 1 ;;
esac
wedraft_base=${wedraft_base%/}/
wedraft_tmp=$(mktemp -d "${TMPDIR:-/tmp}/wedraft-install.XXXXXX")
trap 'rm -rf "$wedraft_tmp"' EXIT HUP INT TERM
wedraft_fetch() { curl --fail --silent --show-error --http1.1 --retry 2 --retry-delay 1 --proto '=https,http' --max-time "${3:-180}" "$1" -o "$2"; }
wedraft_check() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 -c "$1";
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum -c "$1";
  else echo 'SHA-256 tool missing (shasum or sha256sum).' >&2; exit 1; fi
}
wedraft_fetch "${wedraft_base}installer.mjs" "$wedraft_tmp/installer.mjs"
wedraft_fetch "${wedraft_base}installer.sha256" "$wedraft_tmp/installer.sha256"
(cd "$wedraft_tmp" && wedraft_check installer.sha256)
wedraft_node=$(command -v node || true)
if [ -z "$wedraft_node" ] || ! "$wedraft_node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  case "$(uname -s)" in Darwin) wedraft_os=darwin ;; Linux) wedraft_os=linux ;; *) echo 'Automatic setup currently supports macOS and Linux.' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) wedraft_arch=arm64 ;; x86_64|amd64) wedraft_arch=x64 ;; *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;; esac
  wedraft_compression=tar.gz
  if [ "$wedraft_os" = darwin ] || command -v xz >/dev/null 2>&1; then wedraft_compression=tar.xz; fi
  wedraft_fetch 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' "$wedraft_tmp/node-shasums.txt"
  wedraft_archive=$(awk -v ending="-${wedraft_os}-${wedraft_arch}.${wedraft_compression}" '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-/ && substr($2,length($2)-length(ending)+1)==ending {print $2; exit}' "$wedraft_tmp/node-shasums.txt")
  [ -n "$wedraft_archive" ] || { echo 'Could not locate the official Node 24 runtime.' >&2; exit 1; }
  echo 'Preparing a private Node runtime for WeDraft…'
  wedraft_version=${wedraft_archive#node-}
  wedraft_version=${wedraft_version%%-*}
  wedraft_fetch "https://nodejs.org/dist/$wedraft_version/$wedraft_archive" "$wedraft_tmp/$wedraft_archive" 900
  awk -v name="$wedraft_archive" '$2 == name {print}' "$wedraft_tmp/node-shasums.txt" > "$wedraft_tmp/runtime.sha256"
  (cd "$wedraft_tmp" && wedraft_check runtime.sha256 && tar -xf "$wedraft_archive")
  wedraft_runtime="$wedraft_tmp/${wedraft_archive%.$wedraft_compression}"
  wedraft_node="$wedraft_runtime/bin/node"
  set -- --copy-runtime --runtime-license "$wedraft_runtime/LICENSE" "$@"
fi
"$wedraft_node" "$wedraft_tmp/installer.mjs" --base-url "$wedraft_base" "$@"
