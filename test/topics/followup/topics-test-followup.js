const assert = require('assert');

function replace(obj, key, fn, originals) {
	originals.push({ obj, key, orig: obj[key] });
	obj[key] = fn;
}

function restoreAll(originals) {
	for (const { obj, key, orig } of originals) {
		obj[key] = orig;
	}
}

describe('followup request contract', () => {
	let topicsAPI;
	let topicsModule, guardModule, socketHelpers, pluginsModule, eventsModule;
	let originals;

	beforeEach(function () {
		originals = [];
		topicsModule = require('../../../src/topics');
		guardModule = require('../../../src/topics/followup-guard');
		socketHelpers = require('../../../src/socket.io/helpers');
		pluginsModule = require('../../../src/plugins');
		eventsModule = require('../../../src/events');

		// stub topics methods
		replace(topicsModule, 'exists', async () => true, originals);
		replace(topicsModule, 'getTopicFields', async () => ({ tid: 1, title: 'T' }), originals);
		const setFollowupCalls = [];
		replace(topicsModule, 'setFollowup', async (tid, followup) => { setFollowupCalls.push({ tid, followup }); }, originals);
		replace(topicsModule, 'getFollowup', async () => ({ pending: true, requestedBy: 42, lastPingAt: Date.now() }), originals);

		// topic events.log
		const topicEvents = topicsModule.events || {};
		replace(topicsModule, 'events', { log: async () => {} }, originals);

		// guard
		replace(guardModule, 'assertCanRequestFollowup', async () => {}, originals);
		replace(guardModule, 'assertCooldownAndMark', async () => {}, originals);

		// sockets/plugins/events
		const emitCalls = [];
		replace(socketHelpers, 'emitToUids', async (event, payload, uids) => { emitCalls.push({ event, payload, uids }); }, originals);
		const hookCalls = [];
		replace(pluginsModule.hooks, 'fire', async (name, data) => { hookCalls.push({ name, data }); }, originals);
		const eventsCalls = [];
		replace(eventsModule, 'log', async (data) => { eventsCalls.push(data); }, originals);

		// require API after stubs (fresh require)
		delete require.cache[require.resolve('../../../src/api/topics')];
		topicsAPI = require('../../../src/api/topics');

		// attach helper refs to this scope for assertions
		this._setFollowupCalls = setFollowupCalls;
		this._emitCalls = emitCalls;
		this._hookCalls = hookCalls;
		this._eventsCalls = eventsCalls;
	});

	afterEach(function () {
		restoreAll(originals);
		delete require.cache[require.resolve('../../../src/api/topics')];
	});

	it('persists followup, emits socket event and fires hook', async function () {
		const caller = { uid: 42, ip: '127.0.0.1' };
		const res = await topicsAPI.requestFollowup(caller, { tid: 1 });

		// return shape
		assert(res && res.followup, 'expected followup in response');
		assert.strictEqual(res.followup.pending, true);
		assert.strictEqual(res.followup.requestedBy, 42);

		// persistence called
		assert(this._setFollowupCalls.length === 1, 'setFollowup should be called once');

		// socket emitted
		assert(this._emitCalls.length === 1, 'socket emit should be called once');
		assert(/event:followup:requested/.test(this._emitCalls[0].event));
		assert.strictEqual(this._emitCalls[0].payload.tid, 1);

		// hook fired
		assert(this._hookCalls.length === 1, 'hook fire should be called once');
		assert.strictEqual(this._hookCalls[0].name, 'action:followup.requested');
	});
});

describe('followup missing topic (no extra deps)', () => {
	let topicsAPI;
	let topicsModule, guardModule;
	let originals;

	beforeEach(function () {
		originals = [];
		topicsModule = require('../../../src/topics');
		guardModule = require('../../../src/topics/followup-guard');

		replace(topicsModule, 'exists', async () => false, originals);
		replace(guardModule, 'assertCanRequestFollowup', async () => {}, originals);
		replace(guardModule, 'assertCooldownAndMark', async () => {}, originals);

		delete require.cache[require.resolve('../../../src/api/topics')];
		topicsAPI = require('../../../src/api/topics');
	});

	afterEach(function () {
		restoreAll(originals);
		delete require.cache[require.resolve('../../../src/api/topics')];
	});

	it('throws 404 with .status set', async () => {
		const caller = { uid: 10 };
		let threw = false;
		try {
			await topicsAPI.requestFollowup(caller, { tid: 9999 });
		} catch (err) {
			threw = true;
			assert(err instanceof Error, 'expected an Error');
			assert.strictEqual(err.status, 404, 'expected status 404');
		}
		assert(threw, 'expected function to throw');
	});
});