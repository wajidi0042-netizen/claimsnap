#!/bin/bash
# Copy a few CarDD photos into local-photos/ (gitignored) for the hero and the
# sample buttons. They stay on this Mac: the CarDD licence forbids redistribution.
#
# Usage:  bash tools/pick-local-photos.sh /path/to/folder/with/cardd/jpgs [count]
set -e
SRC="$1"; N="${2:-6}"
[ -d "$SRC" ] || { echo "Give a folder that contains CarDD .jpg photos."; exit 1; }
cd "$(dirname "$0")/.."
mkdir -p local-photos; rm -f local-photos/*.jpg
i=0
find "$SRC" -type f \( -iname '*.jpg' -o -iname '*.jpeg' \) | sort -R | head -n "$N" | while read -r f; do
  i=$((i+1)); out="local-photos/photo$i.jpg"
  sips -Z 1600 -s format jpeg "$f" --out "$out" >/dev/null
done
printf '{"photos":[' > local-photos/manifest.json
first=1
for f in local-photos/photo*.jpg; do
  [ $first = 1 ] || printf ',' >> local-photos/manifest.json
  printf '"%s"' "$(basename "$f")" >> local-photos/manifest.json; first=0
done
printf ']}\n' >> local-photos/manifest.json
echo "Done:"; ls local-photos
