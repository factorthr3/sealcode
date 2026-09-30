# syntax=docker/dockerfile:1.7
# Nightly encrypted Postgres backups. pg_dump comes from the same Postgres image as the database.
FROM postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
RUN apk add --no-cache openssl curl
COPY deploy/backup/backup.sh deploy/backup/restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
