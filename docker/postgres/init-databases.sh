#!/bin/sh
# Creates one database per microservice on the first start of the Postgres container.
set -eu
for db in $(echo "${POSTGRES_MULTIPLE_DATABASES:-}" | tr ',' ' '); do
  echo "Creating database $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
SELECT 'CREATE DATABASE "$db" OWNER "$POSTGRES_USER"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
SQL
done
