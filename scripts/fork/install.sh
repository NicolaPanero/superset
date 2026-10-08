#!/bin/sh
# Installs or updates the NicolaPanero/superset fork on an Apple Silicon Mac
# from the fork's latest GitHub release:
#
#   curl -fsSL https://raw.githubusercontent.com/NicolaPanero/superset/fork/main/scripts/fork/install.sh | sh
#
# Installs as "Superset Fork.app", beside an official Superset. Settings and
# data live outside the app (~/.superset-fork and ~/Library/Application
# Support/Superset Fork), so updating keeps them. An earlier fork build
# installed as "Superset.app" is moved to the Trash; an official Superset is
# never touched. The app carries its txcript helpers. Downloading with curl leaves the app
# without macOS's quarantine flag, so it opens without the "unidentified
# developer" prompt even though it isn't notarized.
#
# Options:
#   --wait-pid PID   wait for that process (the running app) to quit first
#   --relaunch       open the app once installed

set -eu

repo="NicolaPanero/superset"
app_asset="Superset-fork-arm64.zip"
app_name="Superset Fork.app"
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

app_url=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" |
    grep -o "\"browser_download_url\": *\"[^\"]*/$app_asset\"" |
    sed 's/.*"\(https[^"]*\)"$/\1/')
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
    # Releases built before the rename still ship "Superset.app".
    if [ -d "$work/app/Superset.app" ]; then
        app_name="Superset.app"
    else
        echo "The download has no $app_name." >&2
        exit 1
    fi
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

# Earlier fork builds took the official name; only they carry the helper.
for legacy in "/Applications/Superset.app" "$HOME/Applications/Superset.app"; do
    if [ "$app_name" != "Superset.app" ] && [ -x "$legacy/Contents/Resources/resources/bin/txcript-transfer" ]; then
        trashed="$HOME/.Trash/Superset (old fork) $(date +%Y%m%d-%H%M%S).app"
        if mv "$legacy" "$trashed" 2>/dev/null; then
            echo "Moved the earlier fork build $legacy to the Trash"
        else
            echo "Could not move $legacy to the Trash; remove it by hand." >&2
        fi
    fi
done

if [ "$relaunch" = true ]; then
    # The updater runs inside the old app; its Superset variables would point
    # the new one at the old data folder.
    env -u SUPERSET_HOME_DIR -u SUPERSET_WORKSPACE_NAME open "$destination/$app_name"
fi
