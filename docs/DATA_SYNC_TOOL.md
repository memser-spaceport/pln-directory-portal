# 🔁 Data Sync Tool

The Data Sync Tool is a tool for synchronizing data between two databases. In the context of this project we've decided to use [Hightouch](https://hightouch.com/).

In the scope of this project, we needed to keep an Airtable database in sync with our source database, thus using a one-way sync.

## 📚 Decision Log

We’ve selected the tool provided by Hightouch as it stood out from others by easily allowing the connection between our PostgreSQL database and an Airtable database. It required some advanced configuration, but we were able to manage it exclusively from inside their panel.

### Primary Metrics

- Ease of implementation
- Level of customization
  - Ability to connect field by field, making it easy to have different structures between PostgreSQL and Airtable
- Automated triggers
  - Ability to trigger all the updates solely with API call's, which is very important for us as we want to have a fully automated process
- Satisfaction with PostgreSQL ↔️ Airtable integration

### Secondary Metrics

- Ease of automated triggers
  - Ease of configuration with our Admin Tool by querying an API every time a new sync is required
- Ability to configure the sync inside the Hightouch tool panel

## Automated Triggers

The Data Sync Tool is configured to run every time a request is performed against the Hightouch API. More information [here](https://hightouch.com/docs/syncs/schedule-sync-ui).

This is done by a trigger in the Forest admin agent configuration. More details on this described on the [Admin Panel documentation](./ADMIN_PANEL.md).

## SQL Queries

There are three SQL queries that are configured in the Hightouch tool, but that should be kept updated here as well in case there's any loss of data.

These queries are present inside the [data-sync folder](../data-sync):

- [Teams Query](../data-sync/teams-query.sql)
- [Members Query](../data-sync/members-query.sql)
- [Industry Tags Query](../data-sync/industry-tags-query.sql)
