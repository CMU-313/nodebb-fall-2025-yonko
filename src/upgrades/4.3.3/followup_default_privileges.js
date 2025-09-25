'use strict';

/**
 * Grants sensible defaults for the new follow-up privileges across all existing categories:
 * 
 * registered-users  => groups:topics:followup  (students can request follow-ups)
 * administrators    => groups:topics:resolveFollowup (staff can resolve)
 *
 * Run via: ./nodebb upgrade
 */

module.exports = {
	name: 'followup_default_privileges',
	timestamp: Date.UTC(2025, 9, 25), // any stable, increasing timestamp
	method: async function () {
		const categories = require('../../categories');
		const privileges = require('../../privileges');

		let cids = await categories.getAllCidsFromSet('categories:cid');
		cids = (cids || []).map(Number).filter(Boolean);
		if (!cids.length) return;

		// Students (registered-users) can request follow-ups
		await Promise.all(cids.map(cid =>
			privileges.categories.give(['groups:topics:followup'], cid, 'registered-users')));

		// Staff (administrators) can resolve follow-ups
		await Promise.all(cids.map(cid =>
			privileges.categories.give(['groups:topics:resolveFollowup'], cid, 'administrators')));
	},
};
