# Web App

## Run development server

Run `nx serve web-app` for a dev server. Navigate to [localhost:4200](http://localhost:4200). The app will automatically reload if you change any of the source files.

## Build the app

Run `nx build web-app` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

## Generate sitemap & robots.txt

Run `nx run web-app:postbuild` after building the project to generate a sitemap of the app along with a `robots.txt` file. The resulting `sitemap.xml` and `robots.txt` files will be stored in the `dist/apps/web-app/public` directory.

## Run unit tests

Run `nx test web-app` to execute the unit tests via [Jest](https://jestjs.io).

Run `nx affected:test` to execute the unit tests affected by a change.

## Run end-to-end tests

Run `nx e2e web-app` to execute the end-to-end tests via [Cypress](https://www.cypress.io).

Run `nx affected:e2e` to execute the end-to-end tests affected by a change.

## Scaffold a new component

Run `nx g @nrwl/react:component my-component --project=web-app` to generate a new component.
