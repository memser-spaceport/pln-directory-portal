# ⚙️ PLN Directory : Admin Panel

The PLN Directory data was initially being stored & managed on Airtable which meant that upon migrating that data into our database we would need to provide a tool to manage it.

After an extensive research, we've selected [Forest Admin](https://www.forestadmin.com/) as it covers all the existing needs that were previously provided by Airtable as well as:

- [Direct integration with NestJS](https://www.forestadmin.com/integrations/nestjs);
- Upload customization that allowed us to easily make use of our storage provider (Web3Storage);
- An easy-to-use interface that can be customizable either via code or its layout editor;

---

### [Forest Admin](https://www.forestadmin.com/)

Forest Admin provides an off-the-shelf admin panel based on a highly-extensible API plugged into your application.

Official Docs: [General Guide](https://docs.forestadmin.com/documentation/) & [NodeJS Guide](https://docs.forestadmin.com/developer-guide-agents-nodejs/getting-started/quick-start)

Useful links:

- [Agent NodeJS - API reference](https://forestadmin.github.io/agent-nodejs/index.html)
- [Learning about .forestadmin-schema.json](https://docs.forestadmin.com/developer-guide-agents-nodejs/under-the-hood/forestadmin-schema)
- [Quick product guide (video)](https://www.youtube.com/watch?v=aTMAYdTryJM)
- [How to enhance performance (video)](https://www.youtube.com/watch?v=UC5nH8q5YUI)

### 📖 Quick Guide

#### 🔑 How do we access the Admin Panel?

Link: https://app.forestadmin.com

> ℹ️ Before accessing the Admin Panel make sure you already have an account or ask to be invited by an Admin so that you can sign up for one.

#### 📨 How do we invite people to access the Admin Panel?

In case you have admin-level permissions and are logged in on the admin panel here are the steps needed to invite other users:

1. Click on the Forest Admin logo
2. Select “Project Settings”
3. Access the “Users” tab and click on the “Invite” CTA
4. Lastly, add the email address(es) to be invited and select the appropriate “Team” and “Role” as well as the permission level

#### 🚦 Managing different environments

Forest Admin enables us to work with multiple environments which is useful to test and validate changes before applying them to production.

For now, there are two remote environments that we can manage:
**Staging** and **Production**

When running our API locally it also boots a local instance of Forest Admin which adds a local development environment.

**How to switch between environments?**
Accessing the Admin Panel and clicking on the Forest Admin logo opens a menu that lists our Environments in which we’re both able to see which one we’re currently managing (highlighted in green) and switch to other(s).

### 🛠 PLN Customizations

#### 📎 Auto-generating UIDs

All entities on the PLN database include an unique unguessable identifiable field called `uid` that's used to indentify resources on the PLN API.

To ensure that the `uid` is always correctly populated on Forest Admin, we're making use of Forest Admin hooks to inject on each collection an auto-generated `uid` using the [cuid](https://github.com/paralleldrive/cuid/tree/master) library.

For more details on the actual implementation, please check: [generated-uid.ts](../apps/web-api/src/utils/forest-admin/generated-uid.ts#L7)

#### 🏞 Uploading images to Web3Storage

In order to support image uploads through Forest Admin we resorted to a custom [action](https://docs.forestadmin.com/developer-guide-agents-nodejs/agent-customization/actions) that will call the upload method on the images controller.

For more details on the actual implementation, please check:[`executeImageUpload` on agent.ts](../apps/web-api/src/utils/forest-admin/agent.ts#L18)

#### 📍 Mapping inserted location data into existing Google Places API results

Most fields on the Location entity (e.g. city, country, latitude, longitude) on the PLN Database are meant to be mapped from the Google Places API to ensure that all locations have valid data.

Due to some technical constraints on Forest Admin, we had to make use of hooks that fire before submitting a location so that when someone tries to insert a location any values inserted will go first through the Google Places API to retrieve results and if successfull store the mapped values from those results.

For more details on the actual implementation, please check: [`generateGoogleApiData` on agent.ts](../apps/web-api/src/utils/forest-admin/agent.ts#L176)

#### 🗃 Clearing API cache (Redis) upon creating/updating/deleting data

To avoid a scenario where any data changes happening through Forest Admin would not get immediately reflected on the PLN Directory due to having API cache becoming stale we need to reset the redis cache upon any changes occurring.

For more details on the actual implementation, please check: [reset-cache-after-cud.ts](../apps/web-api/src/utils/forest-admin/reset-cache-after-cud.ts#L17)

#### 🔄 Triggering data syncs

We've added hooks that call the Hightouch API with the corresponding sync so that everytime there's a data change made (e.g. members, teams) on Forest Admin it will immediatly trigger a sync.

For more details on the actual implementation, please check: [`triggerSync` on agent.ts](../apps/web-api/src/utils/forest-admin/agent.ts#L236)
