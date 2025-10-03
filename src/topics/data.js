/**
 * Topics data layer: fetching & shaping topic objects
 *
 * Adds nested followup read shape with lazy defaults; keeps DB storage flat.
 */

'use strict';

const validator = require('validator');

const db = require('../database');
const categories = require('../categories');
const utils = require('../utils');
const translator = require('../translator');
const plugins = require('../plugins');
const meta = require('../meta');

// Parses ints from DB on read, so API returns numbers not strings.
const intFields = [
	'tid', 'cid', 'uid', 'mainPid', 'postcount',
	'viewcount', 'postercount', 'followercount',
	'deleted', 'locked', 'pinned', 'pinExpiry',
	'timestamp', 'upvotes', 'downvotes',
	'lastposttime', 'deleterUid',
	'followupPending', 'followupRequestedBy', 'followupLastPingAt',
	'score',
];

module.exports = function (Topics) {
	/**
	 * Fetches fields for multiple topics and normalizes/augments them.
	 * Preserves "fetch all" when `fields` is empty; only augments when selective.
	 */
	Topics.getTopicsFields = async function (tids, fields) {
		if (!Array.isArray(tids) || !tids.length) {
			return [];
		}

		// Treat empty array as "fetch all fields"
		const fetchAll = !fields || fields.length === 0;
		const effectiveFields = fetchAll ? [] : fields.slice(); // do NOT mutate caller's array

		// "scheduled" is derived from "timestamp" (only augment when selective)
		if (!fetchAll && effectiveFields.includes('scheduled') && !effectiveFields.includes('timestamp')) {
			effectiveFields.push('timestamp');
		}

		// If explicitly asking for 'followup' (and not fetching all), include backing fields
		if (!fetchAll && effectiveFields.includes('followup')) {
			['followupPending', 'followupRequestedBy', 'followupLastPingAt'].forEach((f) => {
				if (!effectiveFields.includes(f)) effectiveFields.push(f);
			});
		}

		const keys = tids.map(tid => `topic:${tid}`);
		const topics = await db.getObjects(keys, effectiveFields);

		const result = await plugins.hooks.fire('filter:topic.getFields', {
			tids,
			topics,
			fields: effectiveFields,
			keys,
		});
		// Normalize & decorate topic objects
		result.topics.forEach(topic => modifyTopic(topic, effectiveFields));
		return result.topics;
	};

	Topics.getTopicField = async function (tid, field) {
		const topic = await Topics.getTopicFields(tid, [field]);
		return topic && topic.hasOwnProperty(field) ? topic[field] : null;
	};

	Topics.getTopicFields = async function (tid, fields) {
		const topics = await Topics.getTopicsFields([tid], fields);
		return topics ? topics[0] : null;
	};

	Topics.getTopicData = async function (tid) {
		const topics = await Topics.getTopicsFields([tid], []);
		return topics && topics.length ? topics[0] : null;
	};

	Topics.getTopicsData = async function (tids) {
		return await Topics.getTopicsFields(tids, []);
	};

	Topics.getCategoryData = async function (tid) {
		const cid = await Topics.getTopicField(tid, 'cid');
		return await categories.getCategoryData(cid);
	};

	Topics.setTopicField = async function (tid, field, value) {
		await db.setObjectField(`topic:${tid}`, field, value);
	};

	Topics.setTopicFields = async function (tid, data) {
		await db.setObject(`topic:${tid}`, data);
	};

	Topics.deleteTopicField = async function (tid, field) {
		await db.deleteObjectField(`topic:${tid}`, field);
	};

	Topics.deleteTopicFields = async function (tid, fields) {
		await db.deleteObjectFields(`topic:${tid}`, fields);
	};

	/**
	 * getFollowup(tid) -> { pending, requestedBy, lastPingAt }
	 * Reads the nested followup shape (with lazy defaults); triggers read-path builder.
	 */
	Topics.getFollowup = async function (tid) {
		// Requesting 'followup' ensures backing fields load & nested shape is built
		const t = await Topics.getTopicFields(tid, ['followup']);
		return t && t.followup ? t.followup : { pending: false, requestedBy: 0, lastPingAt: 0 };
	};

	/**
	 * setFollowup(tid, patch) -> void
	 * Persists followup fields (flat storage) from a partial patch; coerces types.
	 */
	Topics.setFollowup = async function (tid, { pending, requestedBy, lastPingAt }) {
		const payload = {};
		// Store boolean as 0/1 for DB consistency
		if (typeof pending !== 'undefined') payload.followupPending = pending ? 1 : 0; // new flag
		// Coerce uids/timestamps to integers with safe fallbacks
		if (typeof requestedBy !== 'undefined') payload.followupRequestedBy = parseInt(requestedBy, 10) || 0;
		if (typeof lastPingAt !== 'undefined') payload.followupLastPingAt = parseInt(lastPingAt, 10) || 0;

		// Only write if something changed
		if (Object.keys(payload).length) {
			await db.setObject(`topic:${tid}`, payload); // flat, additive write
		}
	};
};

function escapeTitle(topicData) {
	if (topicData) {
		if (topicData.title) {
			topicData.title = translator.escape(validator.escape(topicData.title));
		}
		if (topicData.titleRaw) {
			topicData.titleRaw = translator.escape(topicData.titleRaw);
		}
	}
}

/**
 * Normalizes a single topic object (types, derived fields, and presentation).
 */
function modifyTopic(topic, fields) {
	if (!topic) {
		return; // gaurd
	}

	db.parseIntFields(topic, intFields, fields); // cast int fields

	if (topic.hasOwnProperty('title')) {
		topic.titleRaw = topic.title;
		topic.title = String(topic.title);
	}

	escapeTitle(topic);

	if (topic.hasOwnProperty('timestamp')) {
		topic.timestampISO = utils.toISOString(topic.timestamp);
		if (!fields.length || fields.includes('scheduled')) {
			topic.scheduled = topic.timestamp > Date.now();
		}
	}

	if (topic.hasOwnProperty('lastposttime')) {
		topic.lastposttimeISO = utils.toISOString(topic.lastposttime);
	}

	if (topic.hasOwnProperty('pinExpiry')) {
		topic.pinExpiryISO = utils.toISOString(topic.pinExpiry);
	}

	if (topic.hasOwnProperty('upvotes') && topic.hasOwnProperty('downvotes')) {
		topic.votes = topic.upvotes - topic.downvotes;
	}

	// Determine fetch mode: only add derived fields when fetching all or explicitly requested
	const fetchAll = !fields || fields.length === 0;

	// High-attention badge: derived from topic.score (which tracks main post net votes)
	// Only include when fetching all fields, or when 'highAttention' or 'score' is explicitly requested.
	if (fetchAll || (Array.isArray(fields) && (fields.includes('highAttention') || fields.includes('score')))) {
		try {
			const threshold = Number(meta.config['attention:scoreThreshold']) || 0;
			// topic.score may be undefined in some selective-field fetches; coerce safely
			const score = Number(topic.score) || 0;
			topic.highAttention = score >= threshold;
		} catch (e) {
			// Fail-safe: don't break existing payloads if Meta isn't available
			topic.highAttention = false;
		}
	}

	if (fields.includes('teaserPid') || !fields.length) {
		topic.teaserPid = topic.teaserPid || null;
	}

	if (fields.includes('tags') || !fields.length) {
		const tags = String(topic.tags || '');
		topic.tags = tags.split(',').filter(Boolean).map((tag) => {
			const escaped = validator.escape(String(tag));
			return {
				value: tag,
				valueEscaped: escaped,
				valueEncoded: encodeURIComponent(tag),
				class: escaped.replace(/\s/g, '-'),
			};
		});
	}

	// FOLLOWUP: expose nested only when explicitly requested
	const wantsFollowup = Array.isArray(fields) && fields.includes('followup');
	if (wantsFollowup) {
		// Coerce/normalize flat values; default if missing
		const pendingRaw = topic.followupPending;
		const pending = pendingRaw === 1 || pendingRaw === true || pendingRaw === '1';
		const requestedBy = Number.isInteger(topic.followupRequestedBy) ? topic.followupRequestedBy : 0;
		const lastPingAt = Number.isInteger(topic.followupLastPingAt) ? topic.followupLastPingAt : 0;

		topic.followup = { pending, requestedBy, lastPingAt };
		// Hide flat storage fields when we expose nested shape
		delete topic.followupPending;
		delete topic.followupRequestedBy;
		delete topic.followupLastPingAt;
	} else if (fetchAll) {
		// In fetch-all responses, hide backing fields to preserve old schemas
		delete topic.followupPending;
		delete topic.followupRequestedBy;
		delete topic.followupLastPingAt;
	}
}
