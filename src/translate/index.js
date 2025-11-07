/* eslint-disable strict */

const translatorApi = module.exports;

// minimal: call your Flask service and return tuple
translatorApi.translate = async function (postData) {
	const base = 'http://128.2.220.239:5000';
	const content = encodeURIComponent(String(postData.content || ''));
	const resp = await fetch(`${base}/?content=${content}`);
	const data = await resp.json();
	return [data.is_english, data.translated_content];
};
