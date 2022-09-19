![Protocol Labs Network logo](./apps/web-app/public/assets/images/protocol-labs-network-logo-horizontal-white.svg#gh-dark-mode-only)
![Protocol Labs Network logo](./apps/web-app/public/assets/images/protocol-labs-network-logo-horizontal-black.svg#gh-light-mode-only)

# Protocol Labs Network

This project was generated using [Nx](https://nx.dev). Check the docs to learn more.

## Setting up the project

1. Run `yarn install` in the root of the project
2. Setup the environment variables via the `.env` file:
   1. Run `cp .env.example .env` at the root of the project
   2. Copy & paste the necessary environment variables values from the 1Password vault

### Run development server

Run `nx serve web-app` for a dev server. Navigate to [localhost:4200](http://localhost:4200). The app will automatically reload if you change any of the source files.

### Build the app

Run `nx build web-app` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

### Generate sitemap & robots.txt

Run `nx run web-app:postbuild` after building the project to generate a sitemap of the app along with a `robots.txt` file. The resulting `sitemap.xml` and `robots.txt` files will be stored in the `dist/apps/web-app/public` directory.

### Run unit tests

Run `nx test web-app` to execute the unit tests via [Jest](https://jestjs.io).

Run `nx affected:test` to execute the unit tests affected by a change.

### Run end-to-end tests

Run `nx e2e web-app` to execute the end-to-end tests via [Cypress](https://www.cypress.io).

Run `nx affected:e2e` to execute the end-to-end tests affected by a change.

## Adding capabilities to our workspace

Nx supports many plugins which add capabilities for developing different types of applications and different tools.

These capabilities include generating applications, libraries, etc as well as the devtools to test, and build projects as well.

### Scaffold a new component

Run `nx g @nrwl/react:component my-component --project=web-app` to generate a new component.

### Generate a React application

Run `nx g @nrwl/react:app my-react-app` to generate an application.

### Generate a Next.js application

Run `nx g @nrwl/next:app my-nextjs-app` to generate an application.

### Generate a library

Run `nx g @nrwl/react:lib my-lib` to generate a library.

Libraries are shareable across libraries and applications. They can be imported from `@protocol-labs-network/mylib`.

### Understand the workspace

Run `nx graph` to see a diagram of the dependencies of your projects.
