/**
 * Follow-up feature: end-to-end data & API behavior
 */

'use strict';

const assert = require('assert');
const nconf = require('nconf');

const categories = require('../src/categories');
const topics = require('../src/topics');
const User = require('../src/user');
const request = require('../src/request');

describe('Follow-up feature (topics)', () => {
	let adminUid;
	let category;
	let created; // { topicData, postData }
	let tid; // number
	let slug; // string

	before(async () => {
		// Create a user & category
		adminUid = await User.create({ username: 'followup-admin' });
		category = await categories.create({ name: 'Followup Tests' });

		// Create a topic we can mutate
		created = await topics.post({
			uid: adminUid,
			cid: category.cid,
			title: 'Followup test topic',
			content: 'main post',
		});
		tid = created.topicData.tid;
		slug = created.topicData.slug;
	});

	it('defaults: getFollowup returns lazy defaults on a fresh topic', async () => {
		// Ensures missing fields don’t break reads and default safely
		const f = await topics.getFollowup(tid);
		assert.deepStrictEqual(f, { pending: false, requestedBy: 0, lastPingAt: 0 });
	});

	it('partial persistence: setFollowup patches fields and getFollowup returns nested shape', async () => {
		// Set only pending + requestedBy
		await topics.setFollowup(tid, { pending: true, requestedBy: adminUid });
		let f = await topics.getFollowup(tid);
		assert.deepStrictEqual(f, { pending: true, requestedBy: adminUid, lastPingAt: 0 });

		// Now set lastPingAt and clear pending
		const ts = Date.now();
		await topics.setFollowup(tid, { pending: false, lastPingAt: ts });
		f = await topics.getFollowup(tid);
		assert.deepStrictEqual(f, { pending: false, requestedBy: adminUid, lastPingAt: ts });
	});

	it('fetch-all hygiene: getTopicData does NOT expose flat fields or nested followup by default', async () => {
		// "fetch-all" keeps legacy schemas stable
		const t = await topics.getTopicData(tid);

		// No nested object unless explicitly requested
		assert.strictEqual(Object.prototype.hasOwnProperty.call(t, 'followup'), false);

		// No flat DB backing fields should leak
		['followupPending', 'followupRequestedBy', 'followupLastPingAt'].forEach((k) => {
			assert.strictEqual(
				Object.prototype.hasOwnProperty.call(t, k),
				false,
				`unexpected key leaked: ${k}`
			);
		});
	});

	it('explicit field request: requesting "followup" returns nested shape and still hides flat fields', async () => {
		// Ask specifically for the nested view
		const t = await topics.getTopicFields(tid, ['followup', 'tid', 'uid']);

		// Nested object present with the exact 3 keys
		assert.strictEqual(typeof t.followup, 'object');
		assert.deepStrictEqual(
			Object.keys(t.followup).sort(),
			['pending', 'requestedBy', 'lastPingAt'].sort()
		);

		// Backing fields hidden
		['followupPending', 'followupRequestedBy', 'followupLastPingAt'].forEach((k) => {
			assert.strictEqual(
				Object.prototype.hasOwnProperty.call(t, k),
				false,
				`unexpected key leaked: ${k}`
			);
		});

		// Sanity: core fields still available
		assert.strictEqual(typeof t.tid, 'number');
		assert.strictEqual(typeof t.uid, 'number');
	});

	it('persistence across reads: selective calls don’t expose followup unless asked, then rebuild from flat', async () => {
		// Selective read that doesn’t ask for followup -> not present
		const selective = await topics.getTopicFields(tid, ['tid', 'title']);
		assert.strictEqual(Object.prototype.hasOwnProperty.call(selective, 'followup'), false);

		// Ask for followup later -> nested object appears, built from flat storage
		const withFollowup = await topics.getTopicFields(tid, ['followup']);
		assert.strictEqual(typeof withFollowup.followup, 'object');
	});

	it('API default: GET /api/topic/:slug omits followup and does not leak flat fields (back-compat)', async () => {
		const { response, body } = await request.get(`${nconf.get('url')}/api/topic/${slug}`);
		assert.strictEqual(response.statusCode, 200);
		assert(body);

		// Top-level topic payload is the response body itself in this route
		const t = body;

		// No nested followup by default in public API
		assert.strictEqual(Object.prototype.hasOwnProperty.call(t, 'followup'), false);

		// No flat DB backing fields leaked
		['followupPending', 'followupRequestedBy', 'followupLastPingAt'].forEach((k) => {
			assert.strictEqual(
				Object.prototype.hasOwnProperty.call(t, k),
				false,
				`unexpected key leaked via API: ${k}`
			);
		});
	});
});
