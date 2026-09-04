#!/usr/bin/env bash
# Builds Snimok.app (and Snimok.zip) into ./build.
# Usage: SNIMOK_SERVER_URL=https://your-app.vercel.app ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

SERVER_URL="${SNIMOK_SERVER_URL:-http://localhost:3000}"
# Code-signing identity. "-" = ad-hoc: works, but macOS ties the Screen Recording
# permission to the exact binary, so every rebuild asks again. Create a
# self-signed "Code Signing" certificate in Keychain Access (e.g. "Snimok Dev")
# and pass SNIMOK_SIGN_IDENTITY="Snimok Dev" to get a stable identity.
SIGN_IDENTITY="${SNIMOK_SIGN_IDENTITY:-}"
if [ -z "$SIGN_IDENTITY" ]; then
  if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Snimok Dev"'; then
    SIGN_IDENTITY="Snimok Dev"
  else
    SIGN_IDENTITY="-"
  fi
fi
APP=build/Snimok.app

echo "▸ compiling (server: $SERVER_URL)"
swift build -c release --arch arm64 --arch x86_64 2>&1 | grep -Ev '^\s*$' | tail -3

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/apple/Products/Release/Snimok "$APP/Contents/MacOS/Snimok"
sed "s|__SERVER_URL__|$SERVER_URL|" Resources/Info.plist > "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

echo "▸ icon"
rm -rf build/icon.iconset
swiftc -O Resources/make-icon.swift -o build/make-icon 2>/dev/null
build/make-icon build/icon.iconset >/dev/null
iconutil -c icns build/icon.iconset -o "$APP/Contents/Resources/AppIcon.icns"

echo "▸ signing ($SIGN_IDENTITY)"
codesign --force --deep --sign "$SIGN_IDENTITY" "$APP"

(cd build && rm -f Snimok.zip && ditto -c -k --keepParent Snimok.app Snimok.zip)
echo "✓ $APP"
echo "✓ build/Snimok.zip"
