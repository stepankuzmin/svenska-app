#!/usr/bin/env bash
set -euo pipefail

destination="${1:?destination subdirectory, or . for the site root}"
source="${2-}"

if [ "$destination" = "." ] && [ -z "$source" ]; then
  echo "Refusing to delete the site root." >&2
  exit 1
fi

checkout="$(mktemp -d)/gh-pages"
remote="${PAGES_REMOTE:-https://x-access-token:${GITHUB_TOKEN:?}@github.com/${GITHUB_REPOSITORY:?}.git}"

if ! git clone --quiet --depth=1 --branch gh-pages "$remote" "$checkout"; then
  git init --quiet -b gh-pages "$checkout"
  git -C "$checkout" remote add origin "$remote"
fi

if [ "$destination" = "." ]; then
  find "$checkout" -mindepth 1 -maxdepth 1 ! -name .git ! -name pr-preview -exec rm -rf {} +
  cp -r "$source/." "$checkout/"
else
  rm -rf "${checkout:?}/$destination"
  if [ -n "$source" ]; then
    mkdir -p "$checkout/$destination"
    cp -r "$source/." "$checkout/$destination/"
  fi
fi

touch "$checkout/.nojekyll"

git -C "$checkout" add --all
if git -C "$checkout" diff --cached --quiet; then
  echo "No change to publish."
  exit 0
fi

git -C "$checkout" -c user.name="github-actions[bot]" \
  -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit --quiet -m "Publish $destination from ${GITHUB_SHA:0:7}"
git -C "$checkout" push --quiet origin gh-pages
