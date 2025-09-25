const assert = require('assert');

// This test file is standalone and stubs modules required by the API.
// It assumes your test runner is mocha (node --test or mocha).

const topicsApi = require('../src/api/topics');
const topics = require('../src/topics');
const followupGuard = require('../src/topics/followup-guard');
const events = require('../src/events');
const socketHelpers = require('../src/socket.io/helpers');

describe('topicsAPI followup endpoints', () => {
	let emitted;
	let logged;
	let _origTopicsExists;
	let _origTopicsGetFollowup;

	beforeEach(() => {
		// capture emissions/logs
		emitted = [];
		logged = [];

		// Stub socket emit helper
		socketHelpers.emitToUids = (event, data, uids) => {
			emitted.push({ event, data, uids });
		};

		// Stub events.log
		events.log = async (obj) => {
			logged.push(obj);
		};

		// Save original exists to restore after test
		_origTopicsExists = topics.exists;
		// Save original getFollowup to restore after test
		_origTopicsGetFollowup = topics.getFollowup;

		// Default topic persistence stubs
		// Keep behavior compatible with Topics.exists: return a boolean for single
		// tid, or an array of booleans for an array of tids.
		topics.exists = async (tid) => {
			if (Array.isArray(tid)) {
				return tid.map(() => true);
			}
			return true;
		};
		// prefer setFollowup if present, otherwise updateTopicField/update
		topics._storedFollowups = {};
		topics.setFollowup = async (tid, followup) => {
			topics._storedFollowups[tid] = followup;
		};
		// Make getFollowup return the stored followup (or defaults) so API's read-path works in tests
		topics.getFollowup = async (tid) => {
			if (topics._storedFollowups.hasOwnProperty(tid)) return topics._storedFollowups[tid];
			return { pending: false, requestedBy: 0, lastPingAt: 0 };
		};
		topics.updateTopicField = async (tid, field, val) => {
			if (field === 'followup') topics._storedFollowups[tid] = val;
		};
		topics.update = async (tid, data) => {
			if (data && data.followup) topics._storedFollowups[tid] = data.followup;
		};

		// Default guard: allow
		followupGuard.assertCanRequestFollowup = async () => {};
		followupGuard.assertCooldownAndMark = async () => {};
		followupGuard.assertCanResolveFollowup = async () => {};
	});

	afterEach(() => {
		// Restore original exists implementation so other tests aren't affected
		topics.exists = _origTopicsExists;
		// Restore original getFollowup implementation
		topics.getFollowup = _origTopicsGetFollowup;
	});

	it('requestFollowup: sets pending=true, requestedBy and lastPingAt; emits and logs', async () => {
		const caller = { uid: 123, ip: '1.2.3.4' };
		const tid = 42;

		const res = await topicsApi.requestFollowup(caller, { tid });
		const f = res.followup;

		assert.strictEqual(f.pending, true);
		assert.strictEqual(f.requestedBy, caller.uid);
		assert.ok(typeof f.lastPingAt === 'number' && f.lastPingAt > 0, 'lastPingAt is a timestamp');

		// persisted
		assert.deepStrictEqual(topics._storedFollowups[tid], f);

		// socket emitted
		assert.strictEqual(emitted.length >= 1, true);
		assert.strictEqual(emitted[0].event, 'event:followup:requested');

		// event logged
		assert.strictEqual(logged.length >= 1, true);
		assert.strictEqual(logged[0].type, 'followup-request');
		assert.strictEqual(logged[0].tid, tid);
	});

	it('resolveFollowup: sets pending=false and clears requester; emits and logs', async () => {
		const caller = { uid: 9, ip: '5.6.7.8' };
		const tid = 99;

		// seed an existing followup to ensure update path
		topics._storedFollowups[tid] = { pending: true, requestedBy: 777, lastPingAt: Date.now() - 1000 };

		const res = await topicsApi.resolveFollowup(caller, { tid });
		const f = res.followup;

		assert.strictEqual(f.pending, false);
		assert.strictEqual(f.requestedBy, 0);
		assert.strictEqual(f.lastPingAt, 0);

		// persisted
		assert.deepStrictEqual(topics._storedFollowups[tid], f);

		// socket emitted
		assert.strictEqual(emitted.length >= 1, true);
		assert.strictEqual(emitted[0].event, 'event:followup:resolved');

		// event logged
		assert.strictEqual(logged.length >= 1, true);
		assert.strictEqual(logged[0].type, 'followup-resolve');
		assert.strictEqual(logged[0].tid, tid);
	});

	it('requestFollowup: throws when missing privilege (403-like)', async () => {
		const caller = { uid: 5, ip: '1.1.1.1' };
		const tid = 7;

		followupGuard.assertCanRequestFollowup = async () => {
			throw new Error('[[error:no-followup-privileges]]');
		};

		await assert.rejects(
			async () => topicsApi.requestFollowup(caller, { tid }),
			err => /no-followup-privileges/.test(err.message)
		);
	});

	it('requestFollowup: throws on cooldown breach (429-like)', async () => {
		const caller = { uid: 6, ip: '2.2.2.2' };
		const tid = 8;

		followupGuard.assertCooldownAndMark = async () => {
			throw new Error('[[error:followup-cooldown]]');
		};

		await assert.rejects(
			async () => topicsApi.requestFollowup(caller, { tid }),
			err => /followup-cooldown/.test(err.message)
		);
	});

	it('resolveFollowup: throws when missing resolve privilege (403-like)', async () => {
		const caller = { uid: 11, ip: '3.3.3.3' };
		const tid = 13;

		followupGuard.assertCanResolveFollowup = async () => {
			throw new Error('[[error:no-resolve-followup-privileges]]');
		};

		await assert.rejects(
			async () => topicsApi.resolveFollowup(caller, { tid }),
			err => /no-resolve-followup-privileges/.test(err.message)
		);
	});
});