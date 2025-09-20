'use strict';

const meta = require('../meta');
const helpers = require('./helpers');
const pagination = require('../pagination');

module.exports = async function (req, res) {
	const page = parseInt(req.query.page, 10) || 1;
	const metaConfigBool = (meta.config && meta.config.topicsPerPage);
	const resLocals = (res.locals && res.locals.user && res.locals.user.topicsPerPage);
	const topicsPerPage = resLocals || metaConfigBool || 10;

	const data = {
		title: 'Unanswered',
		breadcrumbs: helpers.buildBreadcrumbs([
		{ text: '[[pages:unanswered]]' },
		]),
	widgets: res.locals.widgets || {},
	topics: [],
	};

	// pagination and pageCount so API responses match documented schema
	data.pageCount = Math.max(1, Math.ceil((data.topicCount || 0) / topicsPerPage));
	data.pagination = pagination.create(page, data.pageCount, req.query);

	res.render('unanswered', data);
};
