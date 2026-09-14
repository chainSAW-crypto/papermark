#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[entrypoint] running prisma migrate deploy..."
  ./node_modules/.bin/prisma migrate deploy --schema=prisma/schema
else
  echo "[entrypoint] SKIP_MIGRATIONS=true, skipping prisma migrate deploy"
fi

echo "[entrypoint] starting app..."
exec "$@"
