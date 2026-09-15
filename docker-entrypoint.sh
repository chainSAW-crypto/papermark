#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[entrypoint] running prisma migrate deploy..."
  node ./node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema
else
  echo "[entrypoint] SKIP_MIGRATIONS=true, skipping prisma migrate deploy"
fi

echo "[entrypoint] starting app..."
exec "$@"
