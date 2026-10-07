#!/bin/sh
# Installs or updates the NicolaPanero/superset fork on an Apple Silicon Mac
# from the fork's latest GitHub release:
#
#   curl -fsSL https://raw.githubusercontent.com/NicolaPanero/superset/fork/main/scripts/fork/install.sh | sh
#
# Settings and data live outside the app (~/.superset and
# ~/Library/Application Support/Superset), so updating keeps them. The txcript
# transfer helper goes to ~/.superset/bin. Downloading with curl leaves the app
# without macOS's quarantine flag, so it opens without the "unidentified
# developer" prompt even though it isn't notarized.
#
# Options:
#   --wait-pid PID   wait for that process (the running app) to quit first
#   --relaunch       open the app once installed

set -eu

repo="NicolaPanero/superset"
app_asset="Superset-fork-arm64.zip"
helper_asset="txcript-transfer-arm64"
app_name="Superset.app"
wait_pid=""
relaunch=false

while [ $# -gt 0 ]; do
    case "$1" in
        --wait-pid) wait_pid="$2"; shift 2 ;;
        --relaunch) relaunch=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    echo "This build is for Apple Silicon Macs only." >&2
    exit 1
fi

release=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest")
asset_url() {
    printf '%s' "$release" |
        grep -o "\"browser_download_url\": *\"[^\"]*/$1\"" |
        sed 's/.*"\(https[^"]*\)"$/\1/'
}
app_url=$(asset_url "$app_asset")
helper_url=$(asset_url "$helper_asset")
if [ -z "$app_url" ]; then
    echo "No $app_asset in the latest release of $repo." >&2
    exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "Downloading $app_url"
curl -fL --progress-bar "$app_url" -o "$work/$app_asset"
ditto -x -k "$work/$app_asset" "$work/app"
if [ ! -d "$work/app/$app_name" ]; then
    echo "The download has no $app_name." >&2
    exit 1
fi
if [ -n "$helper_url" ]; then
    echo "Downloading $helper_url"
    curl -fL --progress-bar "$helper_url" -o "$work/txcript-transfer"
fi

if [ -n "$wait_pid" ]; then
    while kill -0 "$wait_pid" 2>/dev/null; do
        sleep 0.5
    done
fi

destination="/Applications"
if [ ! -w "$destination" ]; then
    destination="$HOME/Applications"
    mkdir -p "$destination"
fi

rm -rf "$destination/$app_name"
mv "$work/app/$app_name" "$destination/$app_name"
xattr -dr com.apple.quarantine "$destination/$app_name" 2>/dev/null || true
echo "Installed $destination/$app_name"

if [ -f "$work/txcript-transfer" ]; then
    mkdir -p "$HOME/.superset/bin"
    chmod 700 "$work/txcript-transfer"
    mv "$work/txcript-transfer" "$HOME/.superset/bin/txcript-transfer"
    xattr -d com.apple.quarantine "$HOME/.superset/bin/txcript-transfer" 2>/dev/null || true
    echo "Installed ~/.superset/bin/txcript-transfer"
fi

if [ "$relaunch" = true ]; then
    open "$destination/$app_name"
fi
