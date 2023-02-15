# 👨‍💻 Technology stack

## 🛠️ Repository Tooling

**[Git](https://www.git-scm.com/)**

Git is a free and open-source distributed version control system designed to handle everything from small to very large projects with speed and efficiency.

**[GitHub](https://www.github.com/)**

The largest and most advanced development platform in the world.

**[NX](https://www.nx.dev/)**

We’re going to use a monorepo approach for the repository, which is a software development approach where we develop multiple projects in the same repository (e.g., a frontend web application and a REST API). The major benefit of doing so is the fact that these projects can depend on each other and even share code between them, e.g., the model/interfaces to be used by both the web application and the backend.

This means that, whenever we make a change on any interface shared by both apps, we’ll get a warning and will be prompted to fix the issue.

NX calls itself a next-generation build system with first-class monorepo support and powerful integrations. When we make a change, we don’t want to rebuild or retest every project in the monorepo, but rather rebuild and retest the projects that can be affected by our change – and that’s where it excels.

## 📈 Error Monitoring

**[Sentry](https://www.sentry.io/)**

Sentry is an Error Monitoring service that supports different technologies and is being used at Pixelmatters for some time now, for different projects.

We’re going to be taking advantage of Sentry’s Slack integration in order to track and triage errors in real-time.

## 📝 Code Quality

**[ESLint](https://www.eslint.org/)**

ESLint is a tool for identifying and reporting on patterns found in JavaScript code, intending to make code more consistent and avoid bugs. We’ll be using TypeScript ESLint, which enables ESLint to run on TypeScript code.

**[Stylelint](https://www.stylelint.io/)**

The ESLint equivalent for styling – a modern linter that helps us avoid errors (e.g., malformed hex colors) and enforce conventions (e.g., consistent patterns for selector names) in our styles.

**[Prettier](https://www.prettier.io/)**

Prettier is an opinionated code formatter that enforces a consistent code style (i.e. code formatting) across our entire codebase by parsing our code away and re-printing it with its own rules, taking stuff as maximum line length into account, wrapping code when necessary.
​

**[Codecov](http://www.codecov.io)**

Codecov makes it easy to see absolute test coverage and coverage changes overlayed with our source code, making it easier to identify needed test areas.

## 🎨 Frontend

**[React](https://www.reactjs.org/)**

React is the most used frontend web framework, with a big community that produces countless libraries and already built components for us to use. Pixelmatters’ team also has extensive knowledge of it, and currently, it is far easier to hire someone for React than any other frontend framework.

**[Next.js](https://www.nextjs.org/)**

Next.js is a React Framework, meaning that it uses React as the view layer and builds features on top of it. It provides a vast group of features we need for a production-level application: hybrid static & server rendering, TypeScript support, smart bundling, route pre-fetching, and more.

**[TypeScript](https://www.typescriptlang.org/)**

Nowadays, typed JavaScript is a must-have for any robust and maintainable web application, the reason why we’ll be using the above stack along with TypeScript.

## 🎨 UI Development

**[Tailwind CSS](https://www.tailwindcss.com/)**

A utility-first CSS framework packed with helper classes that can be composed to build any design, directly from our markup.

**[Headless UI](https://www.headlessui.dev/)**

Completely unstyled, fully accessible UI components, designed to integrate beautifully with Tailwind CSS. We’ll be using this as our base component library.

**[Radix UI](https://www.radix-ui.com/)**

Unstyled, accessible components for building high‑quality design systems and web apps in React. We’ll be using this as our secondary component library, whenever Headless UI does not fit our needs.

**[Storybook](https://storybook.js.org/)**

Storybook is an open-source tool for building UI components and pages in isolation, promoting a component-based approach to our development process.

**[Chromatic](https://www.chromatic.com/)**

Chromatic will help us review UI implementation among the team by publishing our Storybook instance to a secure CDN. Like code review, but for UI.

## 🧪 Unit Testing

**[Jest](https://www.jestjs.io/)**

JavaScript unit/component testing framework with a focus on simplicity.

**[React Testing Library](https://www.testing-library.com/docs/react-testing-library/intro/)**

Simple utilities for testing DOM-based React user interfaces. It’s built on top of the DOM Testing Library, adding APIs for working with React components.

## 🛠️ Other Tooling

**[Mock Service Worker](https://www.mswjs.io/)**

Mock Service Worker is an API mocking library that uses Service Worker API to intercept actual network-level requests. The major benefit is helping to prevent having the frontend team blocked from working on features that depend on backend development, by providing the means to mock those dependencies.

## 🛠️ Backend

**[NestJS](https://www.nestjs.com/)**

A progressive Node.js framework for building efficient, reliable and scalable server-side applications.​

**[TS-Rest](https://ts-rest.com/)**

ts-rest provides an RPC-like client side interface over your existing REST APIs, as well as allowing you define a separate contract implementation rather than going for a 'implementation is the contract' approach, which is best suited for smaller or simpler APIs.

**[Zod](https://zod.dev/)**

Zod is a TypeScript-first schema builder for static type-checked data. It’s a great way to validate and type our API requests and responses.

**[Swagger](https://www.swagger.io/)**

Simplify API development for users, teams, and enterprises with the Swagger open source and professional toolset. Find out how Swagger can help you design and document your APIs at scale.

**[Forest Admin](https://www.forestadmin.com/)**

Forest Admin instantly provides all common admin tasks such as CRUD operations, simple chart rendering, user group management, and WYSIWYG interface editor. That’s what makes Forest Admin a quick and easy solution to get your admin interface started.

## 💾 Database

**[PostgreSQL](https://www.postgresql.org/)**

PostgreSQL is a powerful, open-source object-relational database system with over 30 years of active development that has earned it a strong reputation for reliability, feature robustness, and performance.

## 📦 Cache

**[Redis](https://www.redis.io/)**

The open source, in-memory data store used by millions of developers as a database, cache, streaming engine, and message broker.

## 🚀 Hosting

**[Heroku](https://www.heroku.com/)**

Heroku is a platform as a service (PaaS) that enables developers to build, run, and operate applications entirely in the cloud.

## 🎯 Serverless Functions

**[Cloudflare](https://www.cloudflare.com/)**

Cloudflare is a web infrastructure and website security company, providing content delivery network services, DDoS mitigation, Internet security, and distributed domain name server services.

## 📁 File Storage

**[web3.Storage](https://web3.storage/)**

At the core of web3.storage is a storage service to safely secure and make your data available - giving developers the power of decentralized storage and content addressing via simple client libraries or an HTTP API.

**[Google Cloud Platform](https://cloud.google.com/)**

Google Cloud Platform, is a suite of cloud computing services that runs on the same infrastructure that Google uses internally for its end-user products, such as Google Search and YouTube.

## 🛠️ Other Tooling

**[Docker](https://www.docker.com/)**

Docker takes away repetitive, mundane configuration tasks and is used throughout the development lifecycle for fast, easy and portable application development – desktop and cloud. Docker’s comprehensive end to end platform includes UIs, CLIs, APIs and security that are engineered to work together across the entire application delivery lifecycle.
