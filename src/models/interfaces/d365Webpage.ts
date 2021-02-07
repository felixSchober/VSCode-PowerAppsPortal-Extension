/* eslint-disable @typescript-eslint/naming-convention */
export interface ID365Webpage {
	adx_webpageid: string;
	adx_name: string;
	adx_partialurl: string;
	_adx_parentpageid_value: string | undefined;
	_adx_websiteid_value: string | undefined;
	_adx_publishingstateid_value: string | undefined;
	adx_hiddenfromsitemap: boolean | undefined;
	_adx_pagetemplateid_value: string | undefined;
	

}

export const WEBPAGE_SELECT = ['adx_webpageid', 'adx_name', 'adx_partialurl', '_adx_parentpageid_value'];