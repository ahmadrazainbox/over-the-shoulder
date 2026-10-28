#!/bin/sh
# Builds the zip attached to a GitHub release: the extension folder only, ready for "Load unpacked".
# Run: npm run package
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./extension/manifest.json').version")
out="over-the-shoulder-$version.zip"
rm -f "$out"
(cd extension && zip -qr -X "../$out" . -x '.*')
echo "$out"
