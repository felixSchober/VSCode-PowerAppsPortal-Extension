var dynamicsWebApi = require('dynamics-web-api');
import { RetrieveMultipleRequest, RetrieveRequest } from 'dynamics-web-api';
import { relative } from 'path';
import { ConfigurationManager } from '../configuration/configurationManager';
import { ContentSnippet } from '../models/ContentSnippet';
import { ID365ContentSnippet } from '../models/interfaces/d365ContentSnippet';
import { ID365Note } from '../models/interfaces/d365Note';
import { ID365PublishingState } from '../models/interfaces/d365PublishingState';
import { ID365WebFile } from '../models/interfaces/d365WebFile';
import { ID365Webpage } from '../models/interfaces/d365Webpage';
import { ID365Website } from '../models/interfaces/d365Website';
import { ID365WebTemplate } from '../models/interfaces/d365WebTemplate';
import { Language } from '../models/Language';
import { WebTemplate } from '../models/WebTemplate';
import { CrmAdalConnectionSettings } from './adalConnection';

export class DynamicsApi {
	private webApi: DynamicsWebApi;

	d365InstanceName: string | undefined;
	d365CrmRegion: string | undefined;
	private configurationManager: ConfigurationManager;

	constructor(configurationManager: ConfigurationManager) {
		this.configurationManager = configurationManager;
		const adalConnect = this.getAdalConnection();

		this.d365InstanceName = this.configurationManager.d365InstanceName;
		this.d365CrmRegion = this.configurationManager.d365CrmRegion;

		const webApiUrl = `https://${this.d365InstanceName}.${this.d365CrmRegion}.dynamics.com/api/data/v9.1/`;
		this.webApi = new dynamicsWebApi({
			webApiUrl: webApiUrl,
			onTokenRefresh: (callback: any) => adalConnect.aquireToken(callback),
		});
	}

	public async getLanguage(languageCode: string): Promise<Language> {
		const select = ['languagelocaleid', 'code'];
		const filter = `code eq '${languageCode}'`;
		const response = await this.webApi.retrieveMultiple<Language>('languagelocale', select, filter);

		if (!response || !response.value || response.value?.length < 1) {
			throw Error('Could not get language from Dynamics instance with code eq ' + languageCode);
		}

		const result = response.value[0];
		return result;
	}

	public async getPortals(): Promise<Map<string, string>> {
		const result = new Map<string, string>();

		const request: RetrieveMultipleRequest = {
			select: ['adx_websiteid', 'adx_name'],
		};
		const response = await this.webApi.retrieveAllRequest<ID365Website>(request);
		if (!response.value) {
			return result;
		}

		for (const website of response.value) {
			result.set(website.adx_name, website.adx_websiteid);
		}
		return result;
	}

	public async getPortalId(portalName: string): Promise<string> {
		const select = ['adx_websiteid'];
		const filter = `adx_name eq '${portalName}'`;

		const response = await this.webApi.retrieveMultiple<ID365Website>('adx_websites', select, filter);

		if (response.value?.length !== 1) {
			throw Error(
				`Found either no portal with the name ${portalName} or too many (result set: ${response.value?.length})`
			);
		}
		const result = response.value[0].adx_websiteid;
		return result;
	}

	public async getWebpageId(name: string, portalId: string): Promise<string> {
		const select = ['adx_webpageid'];
		const filter = `_adx_websiteid_value eq ${portalId} and adx_name eq '${name}' and adx_isroot eq true`;

		const response = await this.webApi.retrieveMultiple<ID365Webpage>('adx_webpages', select, filter);

		if (response.value?.length !== 1) {
			throw Error(
				`Found either no webpage with the name ${name} or too many (result set: ${response.value?.length}). filter: ${filter}`
			);
		}
		const result = response.value[0].adx_webpageid;
		return result;
	}

	public async getPublishedPublishStateId(portalId: string): Promise<string> {
		const select = ['adx_publishingstateid'];
		const filter = `_adx_websiteid_value eq ${portalId} and adx_name eq 'Published'`;

		const response = await this.webApi.retrieveMultiple<ID365PublishingState>(
			'adx_publishingstates',
			select,
			filter
		);
		if (!response || !response.value || response.value.length < 1) {
			throw Error(`Found no publishing state for portal with id ${portalId}. Filter expression: ${filter}`);
		}

		const result = response.value[0].adx_publishingstateid;
		return result;
	}

	public async getContentSnippets(websiteId: string): Promise<Array<ContentSnippet>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_contentsnippets',
			select: [
				'adx_name',
				'adx_value',
				'adx_contentsnippetid',
				'versionnumber',
				'_adx_contentsnippetlanguageid_value',
			],
			filter: '_adx_websiteid_value eq ' + websiteId,
		};
		const response = await this.webApi.retrieveAllRequest<ID365ContentSnippet>(request);
		if (!response.value || response.value?.length === 0) {
			throw Error(`Could not get content snippets from dynamics instance for website with id ${websiteId}.`);
		}

		return response.value.map(
			(c) =>
				new ContentSnippet(
					c.adx_value,
					c._adx_contentsnippetlanguageid_value,
					c.versionnumber,
					c.adx_contentsnippetid,
					c.adx_name
				)
		);
	}

	public async getWebTemplates(websiteId: string): Promise<Array<WebTemplate>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_webtemplates',
			select: ['adx_name', 'adx_source'],
			filter: '_adx_websiteid_value eq ' + websiteId,
		};

		const response = await this.webApi.retrieveAllRequest<ID365WebTemplate>(request);
		if (!response.value || response.value?.length === 0) {
			throw Error(`Could not get web templates from dynamics instance for website with id ${websiteId}.`);
		}

		const result: Array<WebTemplate> = response.value.map((e) => new WebTemplate(e));
		return result;
	}

	public async getWebFiles(portalId: string): Promise<Array<ID365WebFile>> {
		const select = ['adx_webfileid', 'adx_name', 'adx_partialurl', '_adx_websiteid_value'];
		const filter = '_adx_websiteid_value eq ' + portalId;

		const response = await this.webApi.retrieveMultiple<ID365WebFile>('adx_webfiles', select, filter);

		if (!response.value) {
			return [];
		}
		return response.value;
	}

	public async getWebFileNotes(): Promise<Array<ID365Note>> {
		const select = ['annotationid', 'filename', 'isdocument'];
		const filter = "objecttypecode eq 'adx_webfile'";

		const response = await this.webApi.retrieveMultiple<ID365Note>('annotations', select, filter);

		if (!response.value) {
			return [];
		}
		return response.value;
	}

	public async uploadImages(
		images: Array<ID365Note>,
		websiteId: string,
		parentPageId: string,
		publishingStateId: string
	): Promise<Array<ID365WebFile>> {
		const result: Array<ID365WebFile> = [];

		for (const note of images) {
			console.log(`\tCreating webfile ${note.filename}`);
			const file = await this.createWebFile(note.filename, websiteId, parentPageId, publishingStateId);

			if (!file.adx_webfileid) {
				throw Error(`Webfile for file ${note.filename} was not created successfully -> no id on obejct`);
			}

			console.log(`\tUploading contents to webfile ${note.filename}. File Id: ${file.adx_webfileid}`);
			const createdNote = await this.createNote(note, file.adx_webfileid);

			console.log('\tUploaded file: ' + createdNote.filename);

			result.push(file);
		}

		return result;
	}

	public async updateImages(images: Array<ID365Note>): Promise<Array<ID365Note>> {
		const result: Array<ID365Note> = [];

		for (const img of images) {
			if (!img.annotationid) {
				throw Error(`Could not update image with name: ${img.filename}. Existing id was undefined.`);
			}

			const updatedImage: any = {
				documentbody: img.documentbody,
			};

			console.log(`\tUpdating image ${img.filename} to D365`);
			await this.webApi.update<boolean>(img.annotationid, 'annotations', updatedImage);
			console.log('\tUpdated file: ' + img.filename);
			result.push(img);
		}

		return result;
	}

	private async createWebFile(
		name: string,
		websiteId: string,
		parentPageId: string,
		publishingStateId: string
	): Promise<ID365WebFile> {
		const select = ['adx_webfileid', 'adx_name', 'adx_partialurl', '_adx_websiteid_value'];
		const file: any = {
			adx_name: name,
			adx_partialurl: name,
			'adx_websiteid@odata.bind': `adx_websites(${websiteId})`,
			'adx_parentpageid@odata.bind': `adx_webpages(${parentPageId})`,
			'adx_publishingstateid@odata.bind': `adx_publishingstates(${publishingStateId})`,
		};

		console.log(`Adding web file ${file.adx_name} to D365`);
		const requestResponse = await this.webApi.create<ID365WebFile>(
			file,
			'adx_webfiles',
			['return=representation'],
			select
		);

		return requestResponse;
	}

	private async createNote(note: ID365Note, webfileId: string): Promise<ID365Note> {
		const select = ['annotationid', 'filename', 'isdocument'];
		const noteToCreate: any = {
			filename: note.filename,
			isdocument: note.isdocument,
			documentbody: note.documentbody,
			'objectid_adx_webfile@odata.bind': `adx_webfiles(${webfileId})`,
		};

		console.log(`Adding note ${noteToCreate.filename} to D365`);
		const requestResponse = await this.webApi.create<ID365Note>(
			noteToCreate,
			'annotations',
			['return=representation'],
			select
		);

		return requestResponse;
	}

	private getAdalConnection(): CrmAdalConnectionSettings {
		if (!this.configurationManager || !this.configurationManager.isConfigured) {
			throw Error('Configuration was not done');
		}

		const adal = new CrmAdalConnectionSettings(this.configurationManager);
		return adal;
	}
}
