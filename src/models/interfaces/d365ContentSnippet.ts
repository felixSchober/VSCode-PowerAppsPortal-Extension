/* eslint-disable @typescript-eslint/naming-convention */
export interface ID365ContentSnippet {
	adx_contentsnippetid: string | undefined;
	adx_name: string;
	adx_value: string;
	_adx_contentsnippetlanguageid_value: string;
	_adx_websiteid_value: string;
}

export const CONTENTSNIPPET_SELECT = [
	'adx_name',
	'adx_value',
	'adx_contentsnippetid',
	'versionnumber',
	'_adx_contentsnippetlanguageid_value'
];