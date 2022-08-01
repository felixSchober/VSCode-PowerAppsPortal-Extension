import path = require("path");

import * as mime from "mime-types";
import {
    Command,
    Disposable,
    Event,
    EventEmitter,
    ExtensionContext,
    ProgressLocation,
    RelativePattern,
    scm,
    SourceControl,
    SourceControlResourceGroup,
    SourceControlResourceState,
    TextDocument,
    Uri,
    window,
    workspace,
    WorkspaceFolder,
} from "vscode";

import { ConfigurationManager } from "../configuration/configurationManager";
import { DEFAULT_MIME_TYPE, WebFile } from "../models/WebFile";
import { IPortalDataDocument } from "../models/interfaces/dataDocument";
import { getFileName, getFileType, PortalData, PortalFileType } from "../models/portalData";
import { DialogReporter } from "../telemetry/DialogReporter";

import * as afs from "./afs";
import { ALL_FILES_GLOB } from "./afs";
import { PortalIgnoreConfigurationManager } from "./portalIgnoreConfigurationManager";
import { FOLDER_CONTENT_SNIPPETS, FOLDER_TEMPLATES, FOLDER_WEB_FILES, PowerAppsPortalRepository } from "./portalRepository";

export class PowerAppsPortalSourceControl implements Disposable {
    private portalScm: SourceControl;
    private changedResources: SourceControlResourceGroup;
    private portalRepository: PowerAppsPortalRepository;
    private _onRepositoryChange = new EventEmitter<PortalData>();
    private timeout?: NodeJS.Timer;
    private portalData!: PortalData;
    private changedGroup: Set<Uri> = new Set<Uri>();
    private changedResourceStates: Map<string, SourceControlResourceState> = new Map<string, SourceControlResourceState>();
    private configurationManager: ConfigurationManager;
    private portalIgnoreConfigManager: PortalIgnoreConfigurationManager;
    public useFoldersForWebFiles: boolean;
    private runPeriodicFetches: boolean;
    private periodicFetchInterval: NodeJS.Timeout | undefined;

    constructor(context: ExtensionContext, private readonly workspaceFolder: WorkspaceFolder, configurationManager: ConfigurationManager) {
        this.portalScm = scm.createSourceControl(
            "powerappsPortal",
            "PowerApps Portal " + configurationManager.d365InstanceName,
            workspaceFolder.uri
        );
        this.changedResources = this.portalScm.createResourceGroup("workingTree", "Changes");
        this.portalRepository = new PowerAppsPortalRepository(workspaceFolder, configurationManager);
        this.portalScm.quickDiffProvider = this.portalRepository;
        this.portalScm.inputBox.placeholder = "This feature is not supported";
        this.portalScm.inputBox.visible = false;
        this.configurationManager = configurationManager;
        this.useFoldersForWebFiles = configurationManager.useFoldersForWebFiles || false;
        this.runPeriodicFetches = configurationManager.runPeriodicFetches;
        this.periodicFetchInterval = undefined;
        this.portalIgnoreConfigManager = new PortalIgnoreConfigurationManager();
        context.subscriptions.push(this.portalScm);
        this.registerFileSystemWatcher(context, workspaceFolder);
    }

    private async downloadData(silent: boolean, incrementalRefresh: boolean): Promise<PortalData> {
        this.refreshStatusBar("$(sync~spin)", `Portal: Downloading`);
        let result: PortalData;
        try {
            result = await this.portalRepository.download(silent, incrementalRefresh);
        } catch (error) {
            this.refreshStatusBar("$(dialog-error)", `Portal: Download Error`);
            await DialogReporter.reportError(error, "Could not download portal data");
            throw new Error(`[SCM] Could not download portal data: ${(error as Error)?.message}`);
        }
        this.refreshStatusBar("$(sync)", `${result.portalName}@${result.instanceName}`);
        console.log("[SCM] Download complete");
        return result;
    }

    public static async getPortalScm(
        context: ExtensionContext,
        workspaceFolder: WorkspaceFolder,
        configurationManager: ConfigurationManager,
        overwrite: boolean
    ): Promise<PowerAppsPortalSourceControl> {
        const portalScm = new PowerAppsPortalSourceControl(context, workspaceFolder, configurationManager);

        console.log("[SCM] Downloading portal data");
        let portalData: PortalData;

        try {
            portalData = await portalScm.downloadData(false, false);
        } catch (error) {
            throw new Error(`[SCM] Could not download portal data: ${error}`);
        }

        console.log("[SCM] Portal Data downloaded");

        // save chosen portal id and name to config file so that the user doesn't need to
        // specify the portal again
        // also, this helps activating the extension on future runs.
        configurationManager.portalId = portalScm.portalRepository.portalId;
        configurationManager.portalName = portalScm.portalRepository.portalName;
        configurationManager.defaultPageTemplate = portalScm.portalRepository.defaultPageTemplate;
        await configurationManager.storePortalConfigurationFile();

        portalScm.portalData = portalData;

        // clone portal to the local workspace
        try {
            await portalScm.setPortalData(portalData, overwrite);
        } catch (error) {
            await DialogReporter.reportError(error, "Could not set portal data");
        }
        return portalScm;
    }

    private registerFileSystemWatcher(context: ExtensionContext, workspaceFolder: WorkspaceFolder) {
        const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(workspaceFolder, ALL_FILES_GLOB));
        fileSystemWatcher.onDidChange(uri => {
            this.onResourceChange(uri);
        }, context.subscriptions);
        fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
        fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);
        context.subscriptions.push(fileSystemWatcher);
    }

    private async getLocalFile(uri: Uri, fileType: PortalFileType, fileAsBase64: boolean = false): Promise<string> {
        if (fileType !== PortalFileType.webFile) {
            const document = await workspace.openTextDocument(uri);
            return document.getText();
        } else {
            const fileBuffer = await afs.readFile(uri.fsPath);

            if (fileAsBase64) {
                return fileBuffer.toString(afs.BASE64);
            } else {
                return fileBuffer.toString();
            }
        }
    }

    public refreshStatusBar(icon: string, text: string) {
        this.portalScm.statusBarCommands = [
            {
                command: "powerapps-portal-local-development.source-control.refresh",
                arguments: [this],
                title: `${icon} ${text}`,
                tooltip: "Download latest portal changes",
            },
        ];
    }

    public async commitAll(): Promise<void> {
        if (!this.changedResources.resourceStates.length) {
            return await DialogReporter.reportError("", "There is nothing to commit.");
        }
        console.log("[SCM] Commit data");

        // commit all files to the repo
        try {
            await this.prepareCommitToRepository();
        } catch (error) {
            return await DialogReporter.reportError(error, "Could not commit all documents to Dynamics");
        }

        try {
            await this.setPortalData(this.portalRepository.getPortalData(), false);
        } catch (error) {
            return await DialogReporter.reportError(error, "Could not set portal data");
        }

        void window.showInformationMessage(`Data uploaded`, { modal: false });
        await this.refresh(true);
    }

    private async prepareCommitToRepository() {
        return await window.withProgress({ location: ProgressLocation.SourceControl }, async () => {
            for (const changedResource of this.changedResourceStates.values()) {
                const fileType = getFileType(changedResource.resourceUri);
                // was deleted?
                if (changedResource.decorations?.strikeThrough) {
                    try {
                        await this.portalRepository.deleteDocumentInRepository(fileType, changedResource.resourceUri);
                        console.log(`[SCM] Deleting ${changedResource.resourceUri}.`);
                    } catch (error) {
                        await DialogReporter.reportError(error, `Could not delete file ${changedResource.resourceUri}`);
                    }
                    continue;
                }

                const updatedContents = await this.getLocalFile(changedResource.resourceUri, fileType, true);
                // was the file modified?
                if (this.portalData.fileExists(changedResource.resourceUri)) {
                    try {
                        await this.portalRepository.updateDocumentInRepository(fileType, changedResource.resourceUri, updatedContents);
                    } catch (error) {
                        await DialogReporter.reportError(error, `Could not update file ${changedResource.resourceUri}`);
                    }
                } else {
                    // file added
                    try {
                        await this.portalRepository.addDocumentToRepository(fileType, changedResource.resourceUri, updatedContents);
                    } catch (error) {
                        await DialogReporter.reportError(error, `Could not add file ${changedResource.resourceUri}.`);
                    }
                }
            }
        });
    }

    /**
     * Throws away all local changes and resets all files to the checked out version of the repository.
     */
    async resetFilesToCheckedOutVersion(): Promise<void> {
        // create folder structure
        await afs.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_CONTENT_SNIPPETS));
        await afs.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_WEB_FILES));
        await afs.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_TEMPLATES));

        for (const snippet of this.portalData.data.contentSnippet.entries()) {
            await this.resetFile(snippet[0], PortalFileType.contentSnippet, snippet[1]);
        }

        for (const template of this.portalData.data.webTemplate.values()) {
            await this.resetFile(template.name, PortalFileType.webTemplate, template);
        }

        for (const webFile of this.portalData.data.webFile.values()) {
            await this.resetFile(webFile.d365Note.filename, PortalFileType.webFile, webFile);
        }

        // delete new existing non-tracked files
        if (this.changedResourceStates.size > 0) {
            console.log(`[SCM] found ${this.changedResourceStates.size} untracked new files to reset.`);
            for (const f of this.changedResourceStates.values()) {
                // don't delete file if the file is tracked
                if (this.portalData.fileExists(f.resourceUri)) {
                    continue;
                }
                console.log(`[SCM] Deleting ${f.resourceUri}.`);

                try {
                    await afs.unlink(f.resourceUri.fsPath);
                } catch (error) {
                    console.warn(`[SCM] Could not delete file ${f.resourceUri.fsPath}. Error: ${error}`);
                }
            }
        }

        this.changedResourceStates.clear();
    }

    /** Resets the given local file content to the checked-out version. */
    private async resetFile(fileName: string, fileType: PortalFileType, portalDocument: IPortalDataDocument): Promise<void> {
        const filePath = await this.portalRepository.createLocalResourcePath(fileName, fileType, portalDocument);

        let fileContent: string = "";

        switch (fileType) {
            case PortalFileType.contentSnippet:
                fileContent = this.portalData.data.contentSnippet.get(fileName)?.source || "";
                await afs.writeDocument(filePath, fileContent);
                break;

            case PortalFileType.webTemplate:
                fileName = fileName.toLowerCase();
                fileContent = this.portalData.data.webTemplate.get(fileName)?.source || "";
                await afs.writeDocument(filePath, fileContent);
                break;

            case PortalFileType.webFile:
                fileContent = this.getWebFileContents(portalDocument);
                await afs.writeBase64File(filePath, fileContent);
                break;

            default:
                break;
        }
    }

    private getWebFileContents(portalDocument: IPortalDataDocument): string {
        const f = <WebFile>portalDocument;
        const fileContent = this.portalData.data.webFile.get(f.fileId)?.b64Content || "";
        return fileContent;
    }

    async tryCheckout(): Promise<void> {
        if (this.changedResources.resourceStates.length) {
            const changedResourcesCount = this.changedResources.resourceStates.length;
            return DialogReporter.reportError(
                `There is one or more changed resources (${changedResourcesCount}). Discard or commit your local changes before checking out another version.`
            );
        } else {
            try {
                const newPortalData = await this.downloadData(false, true);

                // force set data (overwrite = true)
                await this.setPortalData(newPortalData, true);
            } catch (error) {
                await DialogReporter.reportError(error, "Could not check out portal data");
            }
        }
    }

    // Refreshes the portal data if runPeriodicFetches is true
    public initializePeriodicFetch() {
        if (this.runPeriodicFetches && !this.periodicFetchInterval) {
            console.log("[SCM] Periodic data fetching enabled");
            const doRefresh = async () => {
                console.log("[SCM] Trigger silent portal data fetch");
                await this.refresh(true);
            };
            this.periodicFetchInterval = setInterval(() => {
                void doRefresh();
            }, 120000);
        }
    }

    /**
     * Refresh is used when the information on the server may have changed.
     * For example another user updates the Fiddle online.
     */
    public async refresh(silent: boolean): Promise<void> {
        try {
            const latestPortalData = await this.downloadData(silent, silent);
            await this.setPortalData(latestPortalData, false);
        } catch (error) {
            await DialogReporter.reportError(error, "Could not refresh portal data");
        }
    }

    private async setPortalData(newPortalData: PortalData, overwrite: boolean) {
        console.log(`[SCM] Setting portal data. Overwrite: ${overwrite}.\n[SCM] =========================================`);
        console.log(`\tOld Snippets: ${this.portalData?.data.contentSnippet.size}.`);
        console.log(`\tNew Snippets: ${newPortalData.data.contentSnippet.size}.`);
        console.log(`\tOld Templates: ${this.portalData?.data.webTemplate.size}.`);
        console.log(`\tNew Templates: ${newPortalData.data.webTemplate.size}.`);
        console.log(`\tOld Files: ${this.portalData?.data.webFile.size}.`);
        console.log(`\tNew Files: ${newPortalData.data.webFile.size}.`);

        this.portalData = newPortalData;
        if (overwrite) {
            // overwrite local file content
            await this.resetFilesToCheckedOutVersion();
        }

        // initially, mark all files as changed
        this.changedGroup = await this.portalRepository.provideSourceControlledResources();

        this._onRepositoryChange.fire(this.portalData);
        this.refreshStatusBar("$(refresh)", `${this.portalData.portalName}@${this.portalData.instanceName}`);
        await this.tryUpdateChangedGroup();

        if (this.portalScm.count === 0 && (await this.configurationManager.askForPortalDataFileMigration())) {
            await this.startFileToFolderMigration();
        }
    }

    public async startFileToFolderMigration() {
        console.log("[SCM] Ask for file migration");
        const loadNewData = await this.configurationManager.askForPortalDataFileMigration();
        console.log("[SCM] Migration - load new data: " + loadNewData);

        if (loadNewData) {
            await this.refresh(false);
            console.log("[SCM] Migration - Refresh finished");

            const options = ["Apply Changes", "I'll do it myself"];
            const pickedOption = await window.showInformationMessage(
                "To finish the migration, we have to move the files. Open your source control pane to make sure everything is alright. Once you are ok with the changes click on 'Apply'.",
                ...options
            );
            console.log("[SCM] Migration - User selection for applying: " + pickedOption);

            if (pickedOption === options[0]) {
                await this.resetFilesToCheckedOutVersion();
                console.log("[SCM] Migration - File changes applied");
            }
        }
    }

    getWorkspaceFolder(): WorkspaceFolder {
        return this.workspaceFolder;
    }

    getSourceControl(): SourceControl {
        return this.portalScm;
    }

    get onRepositoryChange(): Event<PortalData> {
        return this._onRepositoryChange.event;
    }

    onResourceChange(_uri: Uri): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.changedGroup.add(_uri);
        this.timeout = setTimeout(() => void this.tryUpdateChangedGroup(), 500);
    }

    async tryUpdateChangedGroup(): Promise<void> {
        console.log(`[SCM] Update ${this.changedGroup.size} files.`);
        try {
            await this.updateChangedGroup();
        } catch (error) {
            await DialogReporter.reportError(error, "Could not update changed group");
        }
    }

    /** This is where the source control determines, which documents were updated, removed, and theoretically added. */
    async updateChangedGroup(): Promise<void> {
        // for simplicity we ignore which document was changed in this event and scan all of them

        const uris = this.changedGroup;
        this.changedGroup = new Set<Uri>();

        try {
            await window.withProgress({ location: ProgressLocation.SourceControl }, async () => {
                // first check all files with a deleted resource state
                // we want to make sure that are actually deleted
                for (const [resourceStateKey, deletedFile] of this.changedResourceStates.entries()) {
                    // skip non deleted files
                    if (!deletedFile.decorations?.strikeThrough) {
                        continue;
                    }

                    const fileExistsInPortalData = this.portalData.fileExists(deletedFile.resourceUri);

                    // file does still exist in local repo
                    if (fileExistsInPortalData) {
                        continue;
                    } else {
                        // file does not exist in local repo -> remove it from
                        // changed resource. In case it has been restored, it will be re
                        this.changedResourceStates.delete(resourceStateKey);
                    }
                }

                for (const uri of uris) {
                    // if the current file is not a "portal file" ignore it
                    if (getFileType(uri) === PortalFileType.other) {
                        continue;
                    }

                    // check if file or file extension should be ignored
                    if (this.portalIgnoreConfigManager.isIgnored(uri)) {
                        console.log(`Ignore file ${uri.fsPath} because it's on the ignore list.`);
                        continue;
                    }

                    let isDirty: boolean;
                    let wasDeleted: boolean;

                    const pathExists = await afs.exists(uri.fsPath);
                    if (pathExists) {
                        const m = mime.lookup(uri.fsPath) || DEFAULT_MIME_TYPE;
                        let document: TextDocument;
                        if (m.startsWith("text")) {
                            try {
                                document = await workspace.openTextDocument(uri);
                                isDirty = this.isDirty(document);
                            } catch (error) {
                                const fileBuffer = await afs.readFile(uri.fsPath);
                                const encodedFile = fileBuffer.toString(afs.BASE64);
                                isDirty = this.isDirtyBase64(uri, encodedFile);
                            }
                        } else {
                            const fileBuffer = await afs.readFile(uri.fsPath);
                            const encodedFile = fileBuffer.toString(afs.BASE64);
                            isDirty = this.isDirtyBase64(uri, encodedFile);
                        }

                        wasDeleted = false;
                    } else {
                        // does the file exist in the repo?
                        // if it doesn't then we can remove it from scm directly
                        const fileExistsInPortalData = this.portalData.fileExists(uri);
                        if (!fileExistsInPortalData) {
                            console.log("[SCM] File was deleted but is not tracked for portal.");
                            isDirty = false;
                            wasDeleted = true;
                        } else {
                            isDirty = true;
                            wasDeleted = true;
                        }
                    }

                    if (isDirty) {
                        const resourceState = this.toSourceControlResourceState(uri, wasDeleted);

                        // use a map to prevent duplicate change entries
                        this.changedResourceStates.set(uri.fsPath, resourceState);
                    } else {
                        // uri is not dirty. check if it is in 'changedresouce' state (could have been previously changed but then changed back)
                        if (this.changedResourceStates.has(uri.fsPath)) {
                            console.log(`[SCM]\t${uri} no longer dirty`);
                            this.changedResourceStates.delete(uri.fsPath);
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Could not get scm state.");
            console.error(error);
        }

        this.changedResources.resourceStates = [...this.changedResourceStates.values()];

        // the number of modified resources needs to be assigned to the SourceControl.count filed to let VS Code show the number.
        this.portalScm.count = this.changedResources.resourceStates.length;
    }

    /** Determines whether the resource is different, regardless of line endings. */
    isDirty(localDoc: TextDocument): boolean {
        const remoteText = this.portalData.getDocumentContent(localDoc.uri, true) || "";
        const localText = localDoc.getText();
        const isDirty = this.removeLineCharacters(remoteText) !== this.removeLineCharacters(localText);

        if (isDirty) {
            console.log(`[SCM]\t${localDoc.fileName} is dirty`);
        }
        return isDirty;
    }

    /**
     * Removes `\r` and `\n` from the given string.
     */
    private removeLineCharacters(text: string): string {
        return text.replace(/\n/g, "").replace(/\r/g, "");
    }

    isDirtyBase64(originalDocUri: Uri, doc: string): boolean {
        const originalText = this.portalData.getDocumentContent(originalDocUri, false) || "";
        const isDirty = originalText !== doc;

        if (isDirty) {
            console.log(`[SCM]\t${originalDocUri.fsPath} is dirty (base64)`);
        }

        return isDirty;
    }

    toSourceControlResourceState(docUri: Uri, deleted: boolean): SourceControlResourceState {
        const repositoryUri = this.portalRepository.provideOriginalResource(docUri, null);

        const fileName = getFileName(docUri).split(".")[0];

        const command: Command | undefined = !deleted
            ? {
                  title: "Show changes",
                  command: "vscode.diff",
                  arguments: [repositoryUri, docUri, `${this.portalData.instanceName} ${fileName} ↔ Local changes`],
                  tooltip: "Diff your changes",
              }
            : undefined;

        const resourceState: SourceControlResourceState = {
            resourceUri: docUri,
            command: command,
            decorations: {
                strikeThrough: deleted,
                tooltip: "File was locally deleted.",
            },
        };

        return resourceState;
    }

    dispose() {
        this._onRepositoryChange.dispose();
        this.portalScm.dispose();
    }

    getPortalData(): PortalData {
        return this.portalData;
    }
}

