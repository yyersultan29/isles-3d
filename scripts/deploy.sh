#!/usr/bin/env bash
# Builds the site for GitHub Pages and force-pushes it to the gh-pages branch.
# Usage: npm run deploy
# G5.7: the online game talks to the game server named by GAME_SERVER (host[:port], no scheme);
# empty means ?online looks for a server on the page's own host, port 8787 (local play only).
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE_URL="$(git remote get-url origin)"
REPO_NAME="$(basename -s .git "$REMOTE_URL")"

npx tsc -b
GAME_SERVER="${GAME_SERVER:-}"
if [ -z "$GAME_SERVER" ]; then echo "note: GAME_SERVER is empty, online play on the site needs ?server=…"; fi
VITE_GAME_SERVER="$GAME_SERVER" npx vite build --base="/${REPO_NAME}/"
touch dist/.nojekyll          # serve files as-is (no Jekyll processing)
cp dist/index.html dist/404.html

cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git push -q -f "$REMOTE_URL" gh-pages
rm -rf .git
echo "Deployed to gh-pages for ${REPO_NAME}"
