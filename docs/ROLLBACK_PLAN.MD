# Rollback Plan

> **:warning: Warning**
>
> Before proceeding with any deployment or rollback, make sure there are up-to-date backups!

> **ℹ️ Note**
>
> Each release might have additional rollback steps (e.g. reverting data changes) that are too specific to be included in this general guide.

## Rolling back an unsuccessful deployment

### Due to code or environment configuration that breaks the app

To rollback the app when there is something that breaks the app, follow these steps:

1. Using Heroku’s CLI, run the `heroku releases` command to list all the existing releases done on Heroku;

2. Choose a stable release version (e.g., v50);

```bash
$ heroku releases
Rel   Change                   By                    When
----  ----------------------   -------------------   -------------
v52   Config add AWS_S3_KEY    shanley@heroku.com    5 minutes ago
v51   Deploy de63889           kendra@heroku.com     7 minutes ago
v50   Deploy 7c35f77           katie@heroku.com      3 hours ago
```

3. Run `heroku rollback v50` to rollback both the app code and environment configuration to that previous point;

More info on the [Heroku Releases and Rollbacks documentation](https://blog.heroku.com/releases-and-rollbacks).

---

### Due to a corrupted database or a critical data loss

To perform this kind of recovery, follow [this guide](https://devcenter.heroku.com/articles/heroku-postgres-rollback#common-use-case-recovery-after-a-critical-data-loss).

> **:warning: Warning**
>
> Keep in mind that this rollback will replace the database on its entirety.

---

### Due to unwanted database migrations

In case there are unwanted database schema changes applied by Prisma migrations, it should be reasonably simple to revert by generating a SQL file for a down migration and using it.

> **ℹ️ Note**
>
> Using a down migration does not revert data changes.

More information on the [Prisma documentation about down migrations](https://www.prisma.io/docs/guides/database/developing-with-prisma-migrate/generating-down-migrations).

---

### Due to missing uploaded files

TBD when the file backups are implemented.
