#!/bin/sh
# Runs cccc (https://github.com/moznion/cccc) at the pinned version.
# Downloads the release archive once, checks it against the SHA-256 below,
# and caches the binary in node_modules/.cache. Arguments go to cccc.
# Set GITHUB_TOKEN to authenticate the download, as CI does, so shared
# runner egress doesn't hit GitHub's unauthenticated rate limit.
set -eu

version=v1.7.0

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=x86_64-unknown-linux-musl sha256=75d2fb5486238eeb40a80fec2de8fe5075e6ce567b6741a56fa511ed2082e45a ;;
  Linux-aarch64 | Linux-arm64) target=aarch64-unknown-linux-musl sha256=f775a19ebd58fc7a4cd64769b8d442425d8afde66207386db04eb87747ed75b8 ;;
  Darwin-x86_64) target=x86_64-apple-darwin sha256=ac3edcd5e64c26933b18952df350401e1379220208cb78a414d8d4c3f1879d2e ;;
  Darwin-arm64) target=aarch64-apple-darwin sha256=babeea26b5304e41ed503b799a59924bbe90b44806bd2ad176e643159fb7213b ;;
  *) echo "cccc: no pinned release for $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac

dir="$(dirname "$0")/../node_modules/.cache/cccc/$version"
bin="$dir/cccc"

if [ ! -x "$bin" ]; then
  mkdir -p "$dir"
  archive="$dir/cccc.tar.gz"
  url="https://github.com/moznion/cccc/releases/download/$version/cccc-$version-$target.tar.gz"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -sSfL -H "Authorization: Bearer $GITHUB_TOKEN" -o "$archive" "$url"
  else
    curl -sSfL -o "$archive" "$url"
  fi
  if command -v sha256sum >/dev/null; then
    actual=$(sha256sum "$archive" | cut -d' ' -f1)
  else
    actual=$(shasum -a 256 "$archive" | cut -d' ' -f1)
  fi
  if [ "$actual" != "$sha256" ]; then
    rm -f "$archive"
    echo "cccc: checksum mismatch for $target (expected $sha256, got $actual)" >&2
    exit 1
  fi
  tar xzf "$archive" -C "$dir" cccc
  rm -f "$archive"
fi

exec "$bin" "$@"
