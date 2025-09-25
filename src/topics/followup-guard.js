'use strict';

/**
 * Follow-up guardrails
 * 
 * privilege checks for request/resolve
 * per-user-per-topic cooldown on "request"
 */

const db = require('../database');
const meta = require('../meta');
const privileges = require('../privileges');

const KEY_LAST_BY_UID = tid => `topic:${tid}:followup:lastByUid`;

// Read cooldown window from settings if present; default to 10 minutes (ms)
function getDefaultCooldownMs() {
	const v = parseInt(meta.config['followup:cooldownMs'], 10);
	return Number.isFinite(v) && v > 0 ? v : 10 * 60 * 1000;
}

/**
 * Ensures the caller can request a follow-up on tid.
 * 
 * Checks category/topic privilege: "topics:followup"
 * Also used by assertCooldownAndMark (after it passes cooldown).
 */
async function assertCanRequestFollowup({ tid, uid }) {
	const uidNum = parseInt(uid, 10) || 0;
	const allowed = await privileges.topics.can('topics:followup', tid, uidNum);
	if (!allowed) {
		const err = new Error('[[error:no-followup-privileges]]');
		err.status = 403;
		throw err;
	}
}

/**
 * Ensures the caller can resolve a follow-up on tid.
 * 
 * Checks category/topic privilege: "topics:resolveFollowup"
 */
async function assertCanResolveFollowup({ tid, uid }) {
	const uidNum = parseInt(uid, 10) || 0;
	const allowed = await privileges.topics.can('topics:resolveFollowup', tid, uidNum);
	if (!allowed) {
		const err = new Error('[[error:no-resolve-followup-privileges]]');
		err.status = 403;
		throw err;
	}
}

/**
 * Cooldown guard for requesting a follow-up.
 * 
 * Optionally accepts cooldownMs to override default (useful in tests)
 * Stamps the "last request" time on success
 */
async function assertCooldownAndMark({ tid, uid, cooldownMs }) {
	const uidStr = String(parseInt(uid, 10) || 0);
	const now = Date.now();
	const windowMs = Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : getDefaultCooldownMs();
	const key = KEY_LAST_BY_UID(tid);

	const lastStr = await db.getObjectField(key, uidStr);
	const last = parseInt(lastStr, 10) || 0;

	if (last && (now - last) < windowMs) {
		const err = new Error('[[error:followup-cooldown]]');
		err.status = 429; // Too Many Requests
		throw err;
	}

	await db.setObjectField(key, uidStr, String(now));
}

module.exports = {
	// names the tests expect:
	assertCanRequestFollowup,
	assertCanResolveFollowup,
	assertCooldownAndMark,

	// keep internals available if needed elsewhere:
	_getDefaultCooldownMs: getDefaultCooldownMs,
};
