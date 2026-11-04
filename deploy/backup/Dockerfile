# syntax=docker/dockerfile:1
# The nightly database backup (Railway cron service `backup`) and the restore drill, in one
# image. Build context is the repository root:
#   docker build -f deploy/backup/Dockerfile .   (Railway: RAILWAY_DOCKERFILE_PATH=deploy/backup/Dockerfile)
#   backup.sh                  default command: dump, encrypt and upload both databases
#   restore.sh --db <name>     restore a backup into a scratch server (deploy/backup/compose.drill.yml)
# docs/deploy.md "Backups" has the setup and the drill.

# pg_dump must be at least the server's major version (Railway runs postgres-ssl:18). The same
# pinned image as the smoke stack's Postgres; a server upgrade to 19 needs this bumped first
# (pg_dump refuses a newer server, so the nightly run fails loudly, not silently).
FROM postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5

RUN apk add --no-cache age aws-cli curl

COPY --chmod=0755 deploy/backup/backup.sh deploy/backup/restore.sh /usr/local/bin/
COPY deploy/backup/recipients.txt /etc/splinance-backup/recipients.txt
# The drill sets up its scratch server with the production role scripts.
COPY deploy/db/prod.sql deploy/db/demo.sql /etc/splinance-backup/db/

ENV AWS_DEFAULT_REGION=eu-central-1
USER postgres
WORKDIR /tmp
# Not the Postgres entrypoint: this image never runs a server.
ENTRYPOINT []
CMD ["backup.sh"]
