'use strict';

/**
 * Topic score tests
 *
 * Verifies:
 * 1) New topics start with score = 0 and appear in per-category zset with score 0
 * 2) Voting the main post updates topic.score and the per-category score zset
 * 3) Voting a reply does NOT change topic.score
 * 4) Topic API payload includes `score`
 */

const assert = require('assert');
const nconf = require('nconf');

const db = require('../../../src/database');
const topics = require('../../../src/topics');
const posts = require('../../../src/posts');
const categories = require('../../../src/categories');
const user = require('../../../src/user');
const apiPosts = require('../../../src/api/posts');
const request = require('../../../src/request');

describe('topics/score (topic-level score derived from main post votes)', () => {
	let authorUid;
	let voterUid;
	let cid;
	let tid;
	let mainPid;

	before(async () => {
		authorUid = await user.create({ username: 'score-author' });
		voterUid = await user.create({ username: 'score-voter' });

		({ cid } = await categories.create({
			name: 'Score Test Cat',
			description: 'For topic.score tests',
		}));

		const result = await topics.post({
			uid: authorUid,
			cid,
			title: 'Score: brand new topic',
			content: 'OP content',
		});

		tid = result.topicData.tid;
		mainPid = result.postData.pid;
	});

	it('initial state: topic.score should be 0', async () => {
		const score = await topics.getTopicField(tid, 'score');
		assert.strictEqual(score, 0);
	});

	it('initial state: category score zset should hold tid with score 0', async () => {
		// score sorted set is per-category only (no global)
		const zset = `cid:${cid}:tids:score`;
		const zscore = await db.sortedSetScore(zset, tid);
		// may be 0 or null depending on implementation; we add an explicit check
		// If not present yet, that means the set will be materialized on first update;
		// but our create.js writes it at creation time, so expect 0.
		assert.strictEqual(zscore, 0);
	});

	it('topic API payload should include `score`', async () => {
		const { body } = await request.get(`${nconf.get('url')}/api/topic/${tid}`);
		assert.ok(Object.prototype.hasOwnProperty.call(body, 'score'), 'score missing from topic payload');
		assert.strictEqual(body.score, 0);
	});

	it('upvoting the main post increments topic.score and category zset', async () => {
		await apiPosts.upvote({ uid: voterUid }, { pid: mainPid, room_id: `topic_${tid}` });

		// topic.score
		const score = await topics.getTopicField(tid, 'score');
		assert.strictEqual(score, 1);

		// category zset
		const zscore = await db.sortedSetScore(`cid:${cid}:tids:score`, tid);
		assert.strictEqual(zscore, 1);
	});

	it('switching to downvote moves score to -1', async () => {
		// from current state (has an upvote), downvote toggles to -1
		await apiPosts.downvote({ uid: voterUid }, { pid: mainPid, room_id: `topic_${tid}` });

		const score = await topics.getTopicField(tid, 'score');
		assert.strictEqual(score, -1);

		const zscore = await db.sortedSetScore(`cid:${cid}:tids:score`, tid);
		assert.strictEqual(zscore, -1);
	});

	it('unvoting restores score to 0', async () => {
		await apiPosts.unvote({ uid: voterUid }, { pid: mainPid, room_id: `topic_${tid}` });

		const score = await topics.getTopicField(tid, 'score');
		assert.strictEqual(score, 0);

		const zscore = await db.sortedSetScore(`cid:${cid}:tids:score`, tid);
		assert.strictEqual(zscore, 0);
	});

	it('voting a reply should NOT change topic.score', async () => {
		// create a reply and vote on it
		const reply = await topics.reply({
			uid: authorUid,
			tid,
			content: 'a reply that is valid',
		});

		await apiPosts.upvote({ uid: voterUid }, { pid: reply.pid, room_id: `topic_${tid}` });

		// topic score should remain 0
		const score = await topics.getTopicField(tid, 'score');
		assert.strictEqual(score, 0);

		// zset score should remain 0 as well
		const zscore = await db.sortedSetScore(`cid:${cid}:tids:score`, tid);
		assert.strictEqual(zscore, 0);
	});
});
