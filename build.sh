#!/bin/bash
set -e

echo "=== build.sh ==="
[ -n "$STRAVA_CLIENT_ID" ] && echo "STRAVA_CLIENT_ID: found"

if [ -z "$STRAVA_CLIENT_ID" ]; then
  echo "WARNING: STRAVA_CLIENT_ID is empty — config.js will have no client id"
fi

# Only the public client id is written to the page. The client secret stays
# server-side in the strava-token Netlify Function (env var STRAVA_CLIENT_SECRET).
cat > src/streak-checker/config.js <<EOF
window.STRAVA_CONFIG = {
  clientId: '${STRAVA_CLIENT_ID}',
};
EOF

echo "config.js written"
