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
const meta = require('../../../src/meta');

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

	describe('category score sort', () => {
		const scoreTopics = [];
		let fallbackCid;
		let fallbackTid;
		let originalTopicsPerPage;
		let originalUsePagination;

		before(async () => {
			originalTopicsPerPage = meta.config.topicsPerPage;
			originalUsePagination = meta.config.usePagination;
			meta.config.topicsPerPage = 2;
			meta.config.usePagination = 1;

			const extraVoters = await Promise.all([
				user.create({ username: 'score-voter-a' }),
				user.create({ username: 'score-voter-b' }),
				user.create({ username: 'score-voter-c' }),
			]);
			const voters = [voterUid, ...extraVoters];

			const configs = [
				{ title: 'Score sort high', votes: 4 },
				{ title: 'Score sort mid', votes: 2 },
				{ title: 'Score sort low', votes: 1 },
			];

			for (const config of configs) {
				// eslint-disable-next-line no-await-in-loop
				const result = await topics.post({
					uid: authorUid,
					cid,
					title: config.title,
					content: `${config.title} content`,
				});
				const { tid: newTid } = result.topicData;
				scoreTopics.push({ tid: newTid, score: config.votes });
				for (let i = 0; i < config.votes; i += 1) {
					// eslint-disable-next-line no-await-in-loop
					await apiPosts.upvote({ uid: voters[i] }, { pid: result.postData.pid, room_id: `topic_${newTid}` });
				}
			}

			const fallbackCategory = await categories.create({
				name: 'Score sort fallback',
				description: 'Fallback score zset',
			});
			fallbackCid = fallbackCategory.cid;
			const fallbackTopic = await topics.post({
				uid: authorUid,
				cid: fallbackCid,
				title: 'Fallback topic',
				content: 'Fallback content',
			});
			fallbackTid = fallbackTopic.topicData.tid;
			await db.sortedSetRemove(`cid:${fallbackCid}:tids:score`, fallbackTid);
		});

		after(() => {
			meta.config.topicsPerPage = originalTopicsPerPage;
			meta.config.usePagination = originalUsePagination;
		});

		it('returns topics ordered by descending score', async () => {
			const expected = scoreTopics
				.slice()
				.sort((a, b) => b.score - a.score)
				.concat({ tid, score: 0 })
				.map(item => item.tid);

			const { body } = await request.get(`${nconf.get('url')}/api/category/${cid}?sort=score_desc`);
			const returned = body.topics.map(topic => topic.tid);

			assert.strictEqual(returned.length, meta.config.topicsPerPage);
			assert.deepStrictEqual(returned, expected.slice(0, returned.length));

			const scores = body.topics.map(topic => topic.score);
			const expectedScores = scoreTopics.slice().sort((a, b) => b.score - a.score).map(item => item.score);
			assert.deepStrictEqual(scores, expectedScores.slice(0, scores.length));
		});

		it('supports pagination when sorting by score', async () => {
			const expected = scoreTopics
				.slice()
				.sort((a, b) => b.score - a.score)
				.concat({ tid, score: 0 })
				.map(item => item.tid);

			const { body: pageOne } = await request.get(`${nconf.get('url')}/api/category/${cid}?sort=score_desc&page=1`);
			assert.deepStrictEqual(pageOne.topics.map(topic => topic.tid), expected.slice(0, 2));
			assert.strictEqual(pageOne.pagination.currentPage, 1);

			const { body: pageTwo } = await request.get(`${nconf.get('url')}/api/category/${cid}?sort=score_desc&page=2`);
			assert.strictEqual(pageTwo.pagination.currentPage, 2);
			assert.deepStrictEqual(pageTwo.topics.map(topic => topic.tid), expected.slice(2, 4));
		});

		it('falls back to default sort when score zset is empty', async () => {
			const { body } = await request.get(`${nconf.get('url')}/api/category/${fallbackCid}?sort=score_desc`);
			assert(body.topics.length >= 1);
			assert.strictEqual(body.topics[0].tid, fallbackTid);
		});
	});
});
