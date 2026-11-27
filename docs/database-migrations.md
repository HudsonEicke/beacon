# Database Migrations

The schema is built from plain SQL migration files in `Backend/Data/Migrations/`, which [DbUp](https://dbup.readthedocs.io/) runs when the API starts. A file runs once per database. DbUp records each one it has run in the `schemaversions` table, and the API won't start if a migration fails.

`0001_baseline.sql` is the schema as it was when migrations were introduced. Every change after that is a new file.

## Adding a migration

1. Create the next numbered file in `Backend/Data/Migrations/`, e.g. `0002_add_message_attachments.sql`. Files run in name order, so keep the four-digit prefix.
2. Write plain PostgreSQL. Each file runs in its own transaction, so if one statement fails the whole file is rolled back.
3. Update the entity classes and `MessagingAppContext` to match.
4. Run the backend tests. They start from an empty database and run every migration, so a broken file fails them.

## Rules

- **Never edit a migration that has been merged.** Databases that already ran it won't run it again, so the edit would only reach new installs. Fix it with a new migration.
- **Keep the previous release working.** Rolling back the app doesn't roll back the database, so the old version has to run against the new schema. Add new columns as nullable or with a default. To remove or rename something, stop using it in one release and drop it in a later one.
- **Don't use `CREATE INDEX CONCURRENTLY`** or other statements that can't run inside a transaction.

## Local development

The API creates the schema in an empty `messaging_app` database. A local database created from the old `Database/messagingapp.sql` script has the tables but no `schemaversions` table, so the baseline fails with "already exists". Drop it and create an empty one:

```sh
dropdb -U postgres messaging_app
createdb -U postgres messaging_app
```
