# PowerApps Portals Local Source Control

![Build & Deploy](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/workflows/Build%20&%20Deploy/badge.svg?branch=master) [![VS Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/FelixSchober.powerapps-portal-local-development.svg)](https://marketplace.visualstudio.com/items?itemName=FelixSchober.powerapps-portal-local-development)

This extension provides a local source control of [Power Apps portals](https://powerapps.microsoft.com/en-us/portals/) code including **web files** like images or style sheets, **web templates** and **content snippets**.

Once configured, the extension loads all portal code and files to a local project folder. Then, you can edit, create or delete files. These changes can be pushed to the portal using the source control pane within visual studio code.

![Change Code](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_intro.gif)

>**IMPORTANT** This extension is currently in preview. There are bugs and there will be strange behavior. Please only use this in demo or dev environments and not for production (yet).

## Features

### Modify file

You can modify web files, content snippets and web template code:
![Change Code](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_intro.gif)

### Add new (Web) File

You can add new web files, new templates and new content snippets. For new content snippets, the language is applied by following the language code from the path.

![Add new Web File](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/02_feature.gif)

### Delete Files

You can delete web files, templates and content snippets.

![Delete Content Snippet](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/03_feature.gif)

### Refresh to get latest changes

You can refresh the remote changes. This will download all files. If there are changes, they will appear in the source control pane.

![Refresh](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/04_feature.gif)

#### Periodic fetching

By default, the extension will fetch incremental changes made in Dynamics every two minutes. You can change this behavior. Open `.vscode/settings.json` and add the following setting: `"powerappsPortals.runPeriodicFetches": false`

### Discard local changes

Within the source control pane, you can click discard to discard all your local changes with the cached origin. To get the latest changes from origin, make sure to hit refresh.

![Discard](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/05_feature.gif)

## Setup

Go to the [VSCode Marketplace page of the extension](https://marketplace.visualstudio.com/items?itemName=FelixSchober.powerapps-portal-local-development) and install the extension.

After installing, open the command prompt (<kbd>Ctrl</kbd> + <kbd>P</kbd> or <kbd>⌘</kbd>+ <kbd>P</kbd>) and type `>PowerApps Portals: Configure`. Follow the setup instructions below and choose your authentication method.

### Authentication

There are two methods you can use to connect this extension with your CDS/Dynamics instance.

- User Account
- Application User

In most cases, user account will be the preferred method because it's easier to setup and all the changes will be in the user context.

### User Account (Device Code)

This extension connects to your CDS/Dynamics instance with a [Device Code](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-code) flow. This means that in order to connect to your instance you need to have the following information ready:

- Client Id (Azure Active Directory)
- Tenant Id (Azure Active Directory)
- URL of your instance (Dynamics)

#### User Account - Create AAD App

To setup an app registration, just follow these steps:

![AAD App Registration Setup](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_configurationDeviceCode_3.gif)

**Summary:**

- Create new app registration
- Add Dynamics CRM Api permission (user impersonation)
- Change app to public client
- Copy app and tenant id (needed for setup)

#### User Account - Extension Setup

Open the command prompt in VSCode (<kbd>Ctrl</kbd> + <kbd>P</kbd> or <kbd>⌘</kbd>+ <kbd>P</kbd>) and type `>PowerApps Portals: Configure`

![Extension Setup](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_configurationDeviceCode_1.gif)

After the initial setup the extension will prompt you to copy a code and click on Ok to open the browser

![Extension Setup - Device Code](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_configurationDeviceCode_2.gif)

Congratulations! The setup is finished.

### Application User (Client Credentials)

This extension connects to your CDS/Dynamics instance with a [client credentials authentication](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow) flow. This means that in order to connect to your instance you need to have the following information ready:

- Client Id (Azure Active Directory)
- Tenant Id (Azure Active Directory)
- Client Secret (Azure Active Directory)
- URL of your instance (Dynamics)

If you already have an application user in Dynamics connected to an app registration in Azure Active Directory (AAD), then you are good to go.

If you do not have this yet, then follow this guide to set everything up:

#### Application User - Create AAD App

First, you have to create a new 'Application Registration' in Azure Active Directory.

Follow the guide on the official Microsoft documentation: [Tutorial: Register an app with Azure Active Directory
](https://docs.microsoft.com/en-us/powerapps/developer/common-data-service/walkthrough-register-app-azure-active-directory)

Lastly, you have to create the client secret which the application is going to use to obtain the token.
Within the app registration page, go to **Certificates & secrets**

![Certificates and Secrets](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_appRegistrationSecret.png)

Then, create a new **client secret** and specify a life time.

![Create client secret](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/02_appRegistrationSecret.png)

Make sure to note down this secret because it will disappear once the page is closed.

Finally, to obtain all Ids you need in the following step, go to the **Overview** page and note down the highlighted values:

![Application Id and Tenant Id](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/03_appRegistrationSecret.png)

#### Application User - Create Application User

Now, you have to create an [Application User](https://docs.microsoft.com/en-us/power-platform/admin/create-users-assign-online-security-roles#create-an-application-user) in Dynamics. This will be the user this extension uses to load and upload portal data.

Make sure, you have the client id ready from the previous step.

To create this user, follow the guide on the official Microsoft documentation: [Create Application User](https://docs.microsoft.com/en-us/powerapps/developer/common-data-service/use-single-tenant-server-server-authentication#application-user-creation)

> **Important**: Don't forget to assign security role(s) to this application user.

#### Application User - Security Roles: Required Entities

- READ: Website Languages (`adx_websitelanguage`)
- READ: Portal Languages (`adx_portallanguage`)
- READ: Websites (`adx_website`)
- READ: Web Pages (`adx_webpage`)
- READ: Publishing States (`adx_publishingstate`)
- READ: Page Templates (`adx_pagetemplate`)
- FULL: Content Snippets (`adx_contentsnippet`)
- FULL: Web Templates (`adx_webtemplate`)
- FULL: Annotations (`annotation`)
- FULL: Web Files (`adx_webfile`)

## Configuration

To start using this application, issue the command >PowerApps Portals Configure

![Configuration Steps Example](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_configuration.gif)

Alternatively, you can also configure the extension from the settings.json located in `.vscode/settings.json`.

```json
{
    "powerappsPortals.aadTenantId": "00000000-0000-0000-0000-000000000000",
    "powerappsPortals.aadClientId": "00000000-0000-0000-0000-000000000000",
    "powerappsPortals.dynamicsInstanceName": "dynamicsUrl",
    "powerappsPortals.dynamicsCrmRegion": "crm4"
}
```

Information about the selected portal is stored in `.portal` located in your main project folder.

```json
{
    "portalId": "00000000-0000-0000-0000-000000000000",
    "portalName": "Your Portal Name"
}
```

### What happens with the client secret?

The client secret is stored encrypted on your local system keychain [keytar](https://github.com/atom/node-keytar). Where this is stored depends on your operating system.

Quoting from the project:

> On macOS the passwords are managed by the Keychain, on Linux they are managed by the Secret Service API/libsecret, and on Windows they are managed by Credential Vault.

The key takeaway here is that the secret is not stored somewhere in your project code.

## Limitations

Currently, this extension supports

- web templates
- web files
- content snippets

All other entity types are currently not supported. Support for web links etc. might come in the future.

Also, this extension does not create pages automatically, while you can create new web templates you still have to go to Dynamics to create a new web page and add the template to the web page manually.

In addition, there is no auto completion support but this might also be added in the future.

This extension uses the source control pane in Visual Studio Code to show changes. However, this extension **does not provide a source control history**. You cannot undo a commit to the portal origin. Similarly, if you choose to checkout the files from the portal origin with your local files, you basically overwrite your local files with the portal files in your online Dynamics.

This limitation also applies to merge conflicts. Before committing your changes, always make sure you are using the most recent online file version. When you commit your files you are overwriting the origin file, not merging it.

## Known Issues

Issues are tracked here: https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/issues

## Release Notes

### 0.1.0

Initial preview release of extension

### 0.1.5

- Timeout for Dynamics API actions
- Use of ***Request methods in Dynamics API for future proofing

### 0.1.8

- Ignore .DS_Store files

### 0.2.0

**Folder Mode for Web Files**: Web Files are now represented according to the path within the Portal. E.g. if the parent page of an image is called `assets`, the image will now be placed in `Web Files/assets/`. Creating new folder structure also creates the corresponding web page hierarchy in Dynamics.

![Folder Mode for Web Files](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/04_release020_folderMode.png)

**Migration for Folder Mode**: There is a migration assistant that asks the user if he wants to migrate from the previous mode to the new folder mode. This assistant is triggered once the source control pane is clear (no changes) and the extension starts.

It is also possible to manually switch by changing a setting `"powerappsPortals.useFoldersForFiles": true`. Then, restart vscode and click on "Discard local changes" once everything is loaded.

**Periodic Refresh**: Now, the extension loads data from Dynamics every two minutes to make sure that the data is always at the most recent state. However, for use cases with multiple developers it's still a good idea to use a repository in combination with this extension.

**Incremental Refresh**
When the application reloads, only the most recent changes are loaded. Users can still click on "Refresh" in the source control pane or in the status bar to get a full refresh.

**Hide Commit Warning**
The warning that committing data will override the data in Dynamics can now be overridden so that it doesn't show each time a user commits something.

![Hide commit warning](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/04_release020_ConsentCommit.png)

**Inactive Record filtering**
Inactive records are now filtered out by default.

**Bug Fixes**
I fixed some of the old bugs but there will be new bugs. Sorry for that ;)

### 0.3.1

**Device Code Authentication**
Addition of additional user authentication method called [Device Flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-code). This authentication method allows a user to make changes in the context of their own user instead of an application user.
In addition, there is also significant less setup needed for this method.

![Extension Setup - Device Code](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_configurationDeviceCode_2.gif)

### 0.3.2

**Content Snippets Bug Fixes**
When adding a new content snippet the extension used to include the language code into the name of the content snippet. This is now fixed.

**Content Snippet Delete from Extension**
When deleting a content snippet in the extension the SCM window was not updated to show it as deleted.

**Added .git to portal ignore manager**
When using the extension in combination with a git repository, sometimes .git files would show up.

**Creating web files**
When creating new web files it used to take the path prefix as the partial web file URL. This has been fixed.

### 0.4.0

**Security Fixes**
Dependencies were updated to the latest version which includes fixes for some security issues.

**Webfile encoding fix**
CSS files that have been created by a template are encoded with UTF-16LE vs. UTF-8 as it was before. This led to issue when using the extension with a new portal.

**Webpage root fix**
When uploading new webfiles under the root web page the extension tried to find a parent 'home' page. When multiple pages without a parent page are found this can lead to issues.
The extension now searches for pages that both have no parent page and are also a root page.

## Credits

Icons made by [Freepik](https://www.flaticon.com/authors/freepik) from www.flaticon.com
