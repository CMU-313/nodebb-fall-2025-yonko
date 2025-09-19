'use strict';

const nconf = require('nconf');
const meta = require('../meta');
const helpers = require('./helpers');

const unansweredController = module.exports;
const relative_path = nconf.get('relative_path');

unansweredController.get = async function (req, res, _) {
	// Minimal rendering: provide the template the variables it expects so it can render
	const data = {};
	if (_ != null) {
		console.log(_);
	}

	const isDisplayedAsHome = !(req.originalUrl.startsWith(`${relative_path}/api/unanswered`) || req.originalUrl.startsWith(`${relative_path}/unanswered`));
	if (isDisplayedAsHome) {
		data.title = meta.config.homePageTitle || '[[pages:home]]';
	} else {
		data.title = 'Unanswered';
		data.breadcrumbs = helpers.buildBreadcrumbs([{ text: 'Unanswered' }]);
	}

	// minimal placeholders expected by templates
	data.topics = [];
	data.widgets = { header: [], sidebar: [], footer: [] };
	data['feeds:disableRSS'] = meta.config['feeds:disableRSS'] || 0;

	res.render('unanswered', data);
};

require('../promisify')(unansweredController, ['get']);
