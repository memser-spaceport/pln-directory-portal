![Protocol Labs Network logo](./apps/web-app/public/assets/images/protocol-labs-network-logo-horizontal-white.svg#gh-dark-mode-only)
![Protocol Labs Network logo](./apps/web-app/public/assets/images/protocol-labs-network-logo-horizontal-black.svg#gh-light-mode-only)

# Protocol Labs Network

This project was generated using [Nx](https://nx.dev). Check the docs to learn more.

## Setting up the project

1. Run `yarn install` in the root of the project
2. Setup the environment variables via the `.env` file:
   1. Run `cp .env.example .env` at the root of the project
   2. Copy & paste the necessary environment variables values from the 1Password vault

### Create a new pre-release & deploy app to staging

1. Make sure you have the [GitHub CLI](https://cli.github.com/) installed on your machine (installation instructions [here](https://github.com/cli/cli#installation))
2. Run `yarn run deploy:staging`

Alternatively, direclty run the "Staging Release & Deployment" workflow on GitHub, under Actions.

### Create a new release & deploy app to production

1. Make sure you have the [GitHub CLI](https://cli.github.com/) installed on your machine (installation instructions [here](https://github.com/cli/cli#installation))
2. Run `yarn run deploy:production`

Alternatively, direclty run the "Production Release & Deployment" workflow on GitHub, under Actions.

## Adding capabilities to our workspace

Nx supports many plugins which add capabilities for developing different types of applications and different tools.

These capabilities include generating applications, libraries, etc as well as the devtools to test, and build projects as well.

### Generate a React application

Run `nx g @nrwl/react:app my-react-app` to generate an application.

### Generate a Next.js application

Run `nx g @nrwl/next:app my-nextjs-app` to generate an application.

### Generate a library

Run `nx g @nrwl/react:lib my-lib` to generate a library.

Libraries are shareable across libraries and applications. They can be imported from `@protocol-labs-network/mylib`.

### Understand the workspace

Run `nx graph` to see a diagram of the dependencies of your projects.
