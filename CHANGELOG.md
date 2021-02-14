# Change Log

## 0.3.1
(Released: 14.02.2021)

**Device Code Authentication**
Addition of additional user authentication method called [Device Flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-code). This authentication method allows a user to make changes in the context of their own user instead of an application user. 
In addition, there is also significant less setup needed for this method.

![Extension Setup - Device Code](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/01_configurationDeviceCode_2.gif)

## 0.2.1 
(Released: 10.02.2021)

**Folder Mode for Web Files**: 
Web Files are now represented according to the path within the Portal. E.g. if the parent page of an image is called `assets`, the image will now be placed in `Web Files/assets/`. Creating new folder structure also creates the corresponding web page hierarchy in Dynamics. 

![Folder Mode for Web Files](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/04_release020_folderMode.png)

**Migration for Folder Mode**: 
There is a migration assistant that asks the user if he wants to migrate from the previous mode to the new folder mode. This assistant is triggered once the source control pane is clear (no changes) and the extension starts.

It is also possible to manually switch by changing a setting `"powerappsPortals.useFoldersForFiles": true`. Then, restart vscode and click on "Discard local changes" once everything is loaded.


**Periodic Refresh**: 
Now, the extension loads data from Dynamics every two minutes to make sure that the data is always at the most recent state. However, for use cases with multiple developers it's still a good idea to use a repository in combination with this extension.


**Incremental Refresh**:
When the application reloads, only the most recent changes are loaded. Users can still click on "Refresh" in the source control pane or in the status bar to get a full refresh.

**Hide Commit Warning:**:
The warning that committing data will override the data in Dynamics can now be overridden so that it doesn't show each time a user commits something.

![Hide commit warning](https://github.com/felixSchober/VSCode-PowerAppsPortal-Extension/raw/master/readme/04_release020_ConsentCommit.png)

**Inactive Record filtering**:
Inactive records are now filtered out by default.

**Bug Fixes**
I fixed some of the old bugs but there will be new bugs. Sorry for that ;)

## 0.1.8

- Ignore .DS_Store files

## 0.1.5

- Timeout for Dynamics API actions
- Use of ***Request methods in Dynamics API for future proofing

## 0.1.0

Initial preview release of extension


