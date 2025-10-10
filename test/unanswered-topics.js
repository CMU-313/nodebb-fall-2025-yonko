'use strict';

const assert = require('assert');
const nconf = require('nconf');

const helpers = require('./helpers');
const request = require('../src/request');
const topics = require('../src/topics');
const categories = require('../src/categories');
const User = require('../src/user');
const groups = require('../src/groups');

describe('Unanswered topics', () => {
	let adminUid;
	let adminJar;
	let c1;
	let c2;
	let tUnansweredC1; // unanswered in category 1
	let tAnsweredC1; // answered in category 1
	let tUnansweredC2; // unanswered in category 2

	before(async () => {
		// create and login admin
		adminUid = await User.create({ username: 'admin-unanswered', password: '123456' });
		await groups.join('administrators', adminUid);
		const adminLogin = await helpers.loginUser('admin-unanswered', '123456');
		adminJar = adminLogin.jar;

		// categories
		c1 = await categories.create({ name: 'Unanswered Cat 1' });
		c2 = await categories.create({ name: 'Unanswered Cat 2' });

		// topics
		({ topicData: tUnansweredC1 } = await topics.post({ uid: adminUid, cid: c1.cid, title: 'u1', content: 'main' }));
		({ topicData: tAnsweredC1 } = await topics.post({ uid: adminUid, cid: c1.cid, title: 'a1', content: 'main' }));
		await topics.reply({ uid: adminUid, tid: tAnsweredC1.tid, content: 'reply -> answered' });
		({ topicData: tUnansweredC2 } = await topics.post({ uid: adminUid, cid: c2.cid, title: 'u2', content: 'main' }));
	});

	it('domain: Topics.getUnanswered returns only postcount==1', async () => {
		const result = await topics.getUnanswered({ uid: adminUid }, { start: 0 });
		assert(result && Array.isArray(result.topics));
		const tids = result.topics.map(t => t.tid);
		assert(tids.includes(tUnansweredC1.tid));
		assert(tids.includes(tUnansweredC2.tid));
		assert(!tids.includes(tAnsweredC1.tid));
		assert.strictEqual(typeof result.nextStart, 'number');
	});

	it('domain: Topics.getUnanswered filters by cid', async () => {
		const result = await topics.getUnanswered({ uid: adminUid }, { cid: c1.cid, start: 0 });
		const tids = result.topics.map(t => t.tid);
		assert(tids.includes(tUnansweredC1.tid));
		assert(!tids.includes(tUnansweredC2.tid));
		assert(!tids.includes(tAnsweredC1.tid));
	});

	it('HTTP: GET /api/topic/unanswered returns expected shape', async () => {
		const { response, body } = await request.get(`${nconf.get('url')}/api/topic/unanswered`, { jar: adminJar });
		assert.strictEqual(response.statusCode, 200);
		assert(body && Array.isArray(body.topics));
		const tids = body.topics.map(t => t.tid);
		assert(tids.includes(tUnansweredC1.tid));
		assert(tids.includes(tUnansweredC2.tid));
		assert(!tids.includes(tAnsweredC1.tid));
		assert.strictEqual(typeof body.nextStart, 'number');
	});

	it('HTTP: GET /api/topic/unanswered?cid filters by category', async () => {
		const { response, body } = await request.get(`${nconf.get('url')}/api/topic/unanswered?cid=${c1.cid}`, { jar: adminJar });
		assert.strictEqual(response.statusCode, 200);
		const tids = body.topics.map(t => t.tid);
		assert(tids.includes(tUnansweredC1.tid));
		assert(!tids.includes(tUnansweredC2.tid));
		assert(!tids.includes(tAnsweredC1.tid));
	});
});

