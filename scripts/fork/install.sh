#!/bin/sh
# Install the latest Paradev++ release on Apple Silicon. Data stays outside the bundle.
# The archive may hold Superset++.app or Paradev++.app; the old name is replaced.
set -eu
repo="NicolaPanero/superset"
app_asset="Superset-fork-arm64.zip"
current_path=""
wait_pid=""
relaunch=false
status_file=""
app_path=""
app_url=""
sha256=""
system_check=""
while [ $# -gt 0 ]; do
    case "$1" in
        --wait-pid) wait_pid="$2"; shift 2 ;;
        --relaunch) relaunch=true; shift ;;
        --status-file) status_file="$2"; shift 2 ;;
        --app-path) app_path="$2"; shift 2 ;;
        --download-url) app_url="$2"; shift 2 ;;
        --sha256) sha256="$2"; shift 2 ;;
        --check-macos) system_check="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done
check_macos() {
    minimum=$(plutil -extract LSMinimumSystemVersion raw -o - "$1/Contents/Info.plist")
    current=$(sw_vers -productVersion)
    if ! awk -v current="$current" -v minimum="$minimum" 'BEGIN {
        if (current !~ /^[0-9]+(\.[0-9]+)*$/ || minimum !~ /^[0-9]+(\.[0-9]+)*$/) exit 1;
        n = split(current, actual, "."); m = split(minimum, required, ".");
        for (i = 1; i <= n || i <= m; i++) {
            if (actual[i] + 0 > required[i] + 0) exit 0;
            if (actual[i] + 0 < required[i] + 0) exit 1;
        }
        exit 0;
    }'; then
        echo "Paradev++ requires macOS $minimum or later (installed: $current)." >&2
        return 1
    fi
}
if [ -n "$system_check" ]; then
    check_macos "$system_check"
    exit
fi
case "$wait_pid" in
    "") ;;
    *[!0-9]*|0|1) echo "Invalid app process ID" >&2; exit 2 ;;
esac
if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    echo "This build is for Apple Silicon Macs only." >&2
    exit 1
fi
if [ -n "$wait_pid" ] && [ -z "$status_file" ]; then
    mkdir -p "$HOME/Library/Logs/Superset++"
    exec >> "$HOME/Library/Logs/Superset++/fork-update.log" 2>&1
fi
phase() {
    if [ -n "$status_file" ]; then
        printf '%s\n' "$1" > "$status_file.tmp"
        mv "$status_file.tmp" "$status_file"
    fi
}
work=$(mktemp -d)
staging=""
backup=""
committed=false
ready_to_restart=false
cleanup() {
    code=$?
    if [ "$committed" = false ] && [ -n "$backup" ] && [ -d "$backup" ]; then
        if [ ! -e "$app_path" ]; then
            if ! mv "$backup" "$app_path"; then
                echo "Previous app is preserved at $backup" >&2
                staging=""
            fi
        else
            echo "Previous app is preserved at $backup" >&2
            staging=""
        fi
    fi
    if [ -n "$staging" ]; then rm -rf "$staging"; fi
    rm -rf "$work"
    if [ "$code" -ne 0 ]; then
        phase failed
        echo "Paradev++ update failed (exit $code); see the update log." >&2
        launch="${current_path:-$app_path}"
        if [ "$ready_to_restart" = true ] && [ "$committed" = false ] && [ "$relaunch" = true ] && [ -n "$wait_pid" ] && [ -d "$launch" ]; then
            if ! kill -0 "$wait_pid" 2>/dev/null; then
                env -u SUPERSET_HOME_DIR -u SUPERSET_WORKSPACE_NAME open "$launch" || true
            fi
        fi
    fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
phase downloading
if [ -z "$app_url" ]; then
    curl --connect-timeout 15 --max-time 30 -fsSL "https://api.github.com/repos/$repo/releases/latest" -o "$work/release.json"
    app_url=$(grep -o "\"browser_download_url\": *\"[^\"]*/$app_asset\"" "$work/release.json" | sed 's/.*"\(https[^"]*\)"$/\1/')
fi
case "$app_url" in
    "https://github.com/$repo/releases/download/"*"/$app_asset") ;;
    *) echo "No trusted $app_asset release URL." >&2; exit 1 ;;
esac
curl --connect-timeout 15 --max-time 900 -fL --progress-bar "$app_url" -o "$work/$app_asset"
if [ -n "$sha256" ]; then
    case "$sha256" in *[!a-f0-9]*|"") echo "Invalid checksum" >&2; exit 1 ;; esac
    [ ${#sha256} -eq 64 ] || exit 1
    printf '%s  %s\n' "$sha256" "$work/$app_asset" | shasum -a 256 -c -
fi
ditto -x -k "$work/$app_asset" "$work/app"
app_name=""
for candidate in "Paradev++.app" "Superset++.app"; do
    if [ -d "$work/app/$candidate" ]; then app_name="$candidate"; break; fi
done
[ -n "$app_name" ] || { echo "The download has no Paradev++.app or Superset++.app." >&2; exit 1; }
source="$work/app/$app_name"
bundle_id=$(plutil -extract CFBundleIdentifier raw -o - "$source/Contents/Info.plist")
[ "$bundle_id" = "com.superset.desktop.fork" ] || { echo "The archive is not Paradev++." >&2; exit 1; }
[ -x "$source/Contents/MacOS/${app_name%.app}" ] || exit 1
check_macos "$source"
if [ -z "$app_path" ]; then
    destination="/Applications"
    if [ ! -w "$destination" ]; then destination="$HOME/Applications"; mkdir -p "$destination"; fi
    app_path="$destination/$app_name"
fi
case "$app_path" in /*/Superset++.app|/*/Paradev++.app) ;; *) echo "Invalid app destination" >&2; exit 1 ;; esac
current_path="$app_path"
destination=$(dirname "$app_path")
app_path="$destination/$app_name"
[ -d "$destination" ] && [ -w "$destination" ] || { echo "App destination is not writable." >&2; exit 1; }
for existing in "$app_path" "$current_path"; do
    if [ -d "$existing" ]; then
        existing_id=$(plutil -extract CFBundleIdentifier raw -o - "$existing/Contents/Info.plist")
        [ "$existing_id" = "com.superset.desktop.fork" ] || { echo "Refusing to replace another app." >&2; exit 1; }
    fi
done
staging=$(mktemp -d "$destination/.superset-update.XXXXXX")
mv "$source" "$staging/$app_name"
xattr -dr com.apple.quarantine "$staging/$app_name" 2>/dev/null || true
phase ready
ready_to_restart=true
if [ -n "$wait_pid" ]; then
    count=0
    while kill -0 "$wait_pid" 2>/dev/null; do
        [ "$count" -lt 60 ] || { echo "The app did not quit; update cancelled." >&2; exit 1; }
        count=$((count + 1))
        sleep 0.5
    done
else
    if pgrep -f '(Superset|Paradev)\+\+\.app/Contents/MacOS/(Superset|Paradev)\+\+($| --)' >/dev/null 2>&1; then
        echo "Quit Paradev++ before installing." >&2; exit 1
    fi
fi
if [ -d "$app_path" ]; then
    backup="$staging/previous.app"
    mv "$app_path" "$backup"
fi
mv "$staging/$app_name" "$app_path"
committed=true
echo "Installed $app_path"
if [ "$current_path" != "$app_path" ] && [ -d "$current_path" ]; then
    mv "$current_path" "$HOME/.Trash/$(basename "$current_path" .app) (replaced) $(date +%Y%m%d-%H%M%S).app" 2>/dev/null ||
        echo "The previous app remains at $current_path" >&2
fi
case "$app_path" in
    "/Applications/$app_name"|"$HOME/Applications/$app_name")
        for legacy in "/Applications/Superset.app" "$HOME/Applications/Superset.app" "/Applications/Superset Fork.app" "$HOME/Applications/Superset Fork.app"; do
            if [ -x "$legacy/Contents/Resources/resources/bin/txcript-transfer" ]; then
                legacy_id=$(plutil -extract CFBundleIdentifier raw -o - "$legacy/Contents/Info.plist" 2>/dev/null || true)
                if [ "$legacy_id" = "com.superset.desktop.fork" ]; then
                    trashed="$HOME/.Trash/Superset (old fork) $(date +%Y%m%d-%H%M%S).app"
                    mv "$legacy" "$trashed" 2>/dev/null || true
                fi
            fi
        done ;;
esac
if [ "$relaunch" = true ]; then
    env -u SUPERSET_HOME_DIR -u SUPERSET_WORKSPACE_NAME open "$app_path"
fi
phase installed
