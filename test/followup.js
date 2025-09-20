/**
 * Follow-up feature: data-layer behavior & hygiene tests
 *
 * Verifies lazy defaults, persistence of flat fields, nested read shape,
 * and that fetch-all responses don't leak backing keys.
 */

'use strict';

const assert = require('assert');

const categories = require('../src/categories');
const topics = require('../src/topics');
const User = require('../src/user');

describe('Follow-up state (data layer)', () => {
	let adminUid;
	let category;
	let created;

	before(async () => {
		// Create a poster and a category to host topics
		adminUid = await User.create({ username: 'followup-admin' });
		category = await categories.create({ name: 'Followup Tests' });

		// Create a basic topic we can mutate
		created = await topics.post({
			uid: adminUid,
			cid: category.cid,
			title: 'Followup test topic',
			content: 'main post',
		});
	});

	it('defaults: getFollowup returns lazy defaults on a fresh topic', async () => {
		const f = await topics.data.getFollowup(created.topicData.tid);
		assert.deepStrictEqual(f, { pending: false, requestedBy: 0, lastPingAt: 0 });
	});

	it('setFollowup persists partial patches and getFollowup returns nested shape', async () => {
		// set only pending + requestedBy first
		await topics.data.setFollowup(created.topicData.tid, { pending: true, requestedBy: adminUid });
		let f = await topics.data.getFollowup(created.topicData.tid);
		assert.deepStrictEqual(f, { pending: true, requestedBy: adminUid, lastPingAt: 0 });

		// now set lastPingAt and clear pending
		const ts = Date.now();
		await topics.data.setFollowup(created.topicData.tid, { pending: false, lastPingAt: ts });
		f = await topics.data.getFollowup(created.topicData.tid);
		assert.deepStrictEqual(f, { pending: false, requestedBy: adminUid, lastPingAt: ts });
	});

	it('fetch-all hygiene: getTopicData does NOT expose flat backing fields or nested followup by default', async () => {
		const t = await topics.data.getTopicData(created.topicData.tid);
		// No nested followup unless explicitly requested
		assert.strictEqual(Object.prototype.hasOwnProperty.call(t, 'followup'), false);
		// No flat backing fields should leak in fetch-all
		['followupPending', 'followupRequestedBy', 'followupLastPingAt'].forEach(k => {
			assert.strictEqual(Object.prototype.hasOwnProperty.call(t, k), false, `unexpected key leaked: ${k}`);
		});
	});

	it('explicit field request: requesting "followup" returns nested shape and still hides flat fields', async () => {
		const t = await topics.data.getTopicFields(created.topicData.tid, ['followup', 'tid', 'uid']);
		// Nested object present
		assert.strictEqual(typeof t.followup, 'object');
		assert.deepStrictEqual(['pending', 'requestedBy', 'lastPingAt'].sort(), Object.keys(t.followup).sort());
		// Backing fields hidden
		['followupPending', 'followupRequestedBy', 'followupLastPingAt'].forEach(k => {
			assert.strictEqual(Object.prototype.hasOwnProperty.call(t, k), false, `unexpected key leaked: ${k}`);
		});
		// Sanity: tid/uid still there
		assert.strictEqual(typeof t.tid, 'number');
		assert.strictEqual(typeof t.uid, 'number');
	});

	it('persistence across reload: followup survives subsequent reads and selective field calls', async () => {
		const tid = created.topicData.tid;
		// Selective read that doesn't ask for followup should not expose it
		const selective = await topics.data.getTopicFields(tid, ['tid', 'title']);
		assert.strictEqual(Object.prototype.hasOwnProperty.call(selective, 'followup'), false);

		// Asking for followup later should rebuild nested view from flat storage
		const withFollowup = await topics.data.getTopicFields(tid, ['followup']);
		assert.strictEqual(typeof withFollowup.followup, 'object');
	});
});
