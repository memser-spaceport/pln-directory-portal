# Fathom Guidelines

In our integration with Fathom, we keep the event codes in a file named [constants](../apps/web-app/constants.ts). In order to add a new event code to the list, it is necessary to follow a specific structure.

## Main structure

The main structure for organizing the events codes is as follows:

1. Portal (landing page)
2. Directory (what is common between members and teams directories)
3. Members
4. Teams

### Portal

These refer to the landing page of our website. All portal-specific event codes should be grouped together under the portal section.

### Directory

This section is intended for event codes that are common to both members and teams directories. Any event codes that are specific to either the members or teams directory should be placed in their respective sections.

### Members and Teams

This section is for events that are specific to the members or teams directories. Each of these sections are also divided into two sub-sections: directory and profile.

#### Directory and Profile

This level is for events that are specific to either the directory or profile page of the members or teams section.

## Adding a New Event Code

To add a new event code to the list of Fathom events, follow these steps:

1. Determine the level to which the event code belongs.
   For example, if it's a member-specific event related to the directory page, it should go under the "Members > Directory" section.
2. Add the new event code to the appropriate section in the constants file.
3. If necessary, update any section to include the new event code.

By following this, we can keep our Fathom events organized and easily accessible. This also allows us to add new events to the list in a consistent and streamlined manner.

### Naming best practices and guidelines to ensure consistency

1. **Use clear and descriptive names:** Event names should be descriptive and reflect the action that triggers them. Avoid using ambiguous names or acronyms that may be difficult to understand.

2. **Use lower camel case:** Event names should be written in lower camel case (e.g., `scheduleMeeting`).

3. **Use a hierarchical naming convention:** As seen in the provided code example, using a hierarchical naming convention can help organize the events into a clear and logical structure. The hierarchy should reflect the organization of the application, with top-level events representing high-level actions and lower-level events representing more specific actions.
