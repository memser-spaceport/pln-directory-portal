# Web App — Components

The `apps/web-app/components` folder contains reusable components that are used across the web app.

## Structure

The top-level folder is `components`, and it contains subfolders for each component category. The `shared` folder contains generic components that can be reused across various contexts of the web app, while the `layout`, `members`, and `teams` folders contain components that are specific to those areas of the web app.

```
├── components/
│   ├── layout/
│   │   └── # layout-related components
│   ├── members/
│   │   ├── member-profile/
│   │   │   └── # member profile-related components
│   │   ├── members-directory/
│   │   │   └── # members directory-related components
│   │   └── # other members-related components
│   ├── portal/
│   │   └── # portal-related components
│   ├── shared/
│   │   └── # components to be re-used across multiple contexts
│   ├── teams/
│   │   ├── team-profile/
│   │   │   └── # team profile-related components
│   │   ├── teams-directory/
│   │   │   └── # teams directory-related components
│   │   └── # other teams-related components
```

### Component Categories

**Layout:** This folder contains components related to the overall layout of the web app, such as a loading overlay and navbar.

**Members:** This folder contains components related to the members' pages. It is divided into two subfolders, `member-profile` and `members-directory`, which contain components related to individual member profiles and the directory of all members, respectively.

**Portal:** This folder contains components specific to the portal page(s). It contains various components, such as `card`, `event-card` or `portal-header`.

**Shared:** This folder contains generic components that can be reused across the web app. It is divided into subfolders based on the type of component, such as `directory` or `profile`, and also contains other components such as `error-message` or `loading-indicator`.

**Teams:** This folder contains components related to the teams' pages. It is divided into two subfolders, `team-profile` and `teams-directory`, which contain components related to individual team profiles and the directory of all teams, respectively.

## Naming Best Practices and Guidelines

1. **Use kebab case:** Kebab case is a naming convention where words are separated by hyphens (-) and all letters are lowercase. For example, `member-profile` and `loading-indicator`.

2. **Use clear and descriptive names:** Name your components in a clear and concise way that describes their purpose. For example, `member-profile` clearly describes a component that displays a member's profile, while `member` could be too generic and may not provide enough information.

3. **Shared folder:** If a component can be reused across different categories or areas of the web app, place it in the `shared` folder. This helps keep the structure organized and makes it easier to find and reuse components. However, make sure the component is truly generic and not specific to a certain area of the web app.

4. **Benefit from the hierarchy:** This can help organize the components into a clear and logical structure. The hierarchy should reflect the organization of the application.
