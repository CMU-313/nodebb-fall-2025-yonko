'use strict';

const assert = require('assert');
const User = require('../../../src/user');
const groups = require('../../../src/groups');
const categories = require('../../../src/categories');
const topics = require('../../../src/topics');
const apiCategories = require('../../../src/api/categories');
const guard = require('../../../src/topics/followup-guard');

describe('Follow-up guard', () => {
	let uidStudent;
	let uidStaff;
	let adminUid;
	let cid;
	let tid;

	before(async () => {
		// Users + admin
		uidStudent = await User.create({ username: 'stu' });
		uidStaff = await User.create({ username: 'staff' });
		adminUid = await User.create({ username: 'admin-for-guard' });
		await groups.join('administrators', adminUid);

		// Category
		const cat = await categories.create({ name: 'guard-cat' });
		cid = cat.cid;

		// Minimal baseline privs so a regular user can create/reply
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{
				cid,
				privilege: [
					'groups:find',
					'groups:read',
					'groups:topics:read',
					'groups:topics:create',
					'groups:topics:reply',
				],
				set: true,
				member: 'registered-users',
			}
		);

		// Follow-up specific privs (start enabled; individual tests will toggle)
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{ cid, privilege: ['groups:topics:followup'], set: true, member: 'registered-users' }
		);
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{ cid, privilege: ['groups:topics:resolveFollowup'], set: true, member: 'registered-users' }
		);

		// Topic to act on
		const posted = await topics.post({
			uid: uidStudent,
			cid,
			title: 'guard topic to the topic',
			content: 'hello how are you doing today?',
		});
		tid = posted.topicData.tid;
	});

	it('403 when privilege missing: followup', async () => {
		// Remove followup privilege, then expect 403
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{ cid, privilege: 'groups:topics:followup', set: false, member: 'registered-users' }
		);

		let err;
		try {
			await guard.assertCanRequestFollowup({ tid, uid: uidStudent });
		} catch (e) {
			err = e;
		}

		assert(err);
		assert.strictEqual(err.status, 403);
		assert.strictEqual(err.message, '[[error:no-followup-privileges]]');

		// Restore for later tests
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{ cid, privilege: 'groups:topics:followup', set: true, member: 'registered-users' }
		);
	});

	it('429 on cooldown breach', async () => {
		// First call succeeds and stamps cooldown
		await guard.assertCooldownAndMark({ tid, uid: uidStudent, cooldownMs: 10 * 60 * 1000 });

		// Immediate second call should 429
		let err;
		try {
			await guard.assertCooldownAndMark({ tid, uid: uidStudent, cooldownMs: 10 * 60 * 1000 });
		} catch (e) {
			err = e;
		}

		assert(err);
		assert.strictEqual(err.status, 429);
		assert.strictEqual(err.message, '[[error:followup-cooldown]]');
	});

	it('403 when privilege missing: resolve', async () => {
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{ cid, privilege: 'groups:topics:resolveFollowup', set: false, member: 'registered-users' }
		);

		let err;
		try {
			await guard.assertCanResolveFollowup({ tid, uid: uidStaff });
		} catch (e) {
			err = e;
		}

		assert(err);
		assert.strictEqual(err.status, 403);
		assert.strictEqual(err.message, '[[error:no-resolve-followup-privileges]]');

		// Restore (if other suites rely on defaults)
		await apiCategories.setPrivilege(
			{ uid: adminUid },
			{ cid, privilege: 'groups:topics:resolveFollowup', set: true, member: 'registered-users' }
		);
	});
});
