'use strict';

/**
 * High attention badge tests
 *
 * Verifies:
 * 1) topic.highAttention is false when score < threshold
 * 2) topic.highAttention is true when score >= threshold
 * 3) Voting replies does not affect highAttention
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
const Configs = require('../../../src/meta/configs');

describe('topics/attention (high attention badge derived from main post votes)', () => {
	let authorUid;
	let voterUid;
	let cid;
	let tid;
	let mainPid;

	before(async () => {
		authorUid = await user.create({ username: 'attention-author' });
		voterUid = await user.create({ username: 'attention-voter' });

		({ cid } = await categories.create({
			name: 'Attention Test Cat',
			description: 'For topic.highAttention tests',
		}));

		// ensure threshold is a known value
		await Configs.setMultiple({ 'attention:scoreThreshold': 2 });

		const result = await topics.post({
			uid: authorUid,
			cid,
			title: 'Attention: brand new topic',
			content: 'OP content',
		});

		tid = result.topicData.tid;
		mainPid = result.postData.pid;
	});

	it('initial state: highAttention should be false', async () => {
		const topicData = await topics.getTopicData(tid);
		assert.strictEqual(topicData.highAttention, false);
	});

	it('below threshold: highAttention remains false', async () => {
		// upvote once (threshold is 2)
		await apiPosts.upvote({ uid: voterUid }, { pid: mainPid, room_id: `topic_${tid}` });

		const topicData = await topics.getTopicData(tid);
		assert.strictEqual(topicData.score, 1);
		assert.strictEqual(topicData.highAttention, false);
	});

	it('meeting threshold: highAttention becomes true', async () => {
		// add another upvote from a second voter to reach threshold
		const secondVoter = await user.create({ username: 'attention-voter2' });
		await apiPosts.upvote({ uid: secondVoter }, { pid: mainPid, room_id: `topic_${tid}` });

		const topicData = await topics.getTopicData(tid);
		assert.strictEqual(topicData.score, 2);
		assert.strictEqual(topicData.highAttention, true);
	});

	it('voting a reply does NOT affect highAttention', async () => {
		const reply = await topics.reply({
			uid: authorUid,
			tid,
			content: 'a reply that is valid',
		});

		await apiPosts.upvote({ uid: voterUid }, { pid: reply.pid, room_id: `topic_${tid}` });

		const topicData = await topics.getTopicData(tid);
		// score should remain 2 and highAttention true
		assert.strictEqual(topicData.score, 2);
		assert.strictEqual(topicData.highAttention, true);
	});
});
