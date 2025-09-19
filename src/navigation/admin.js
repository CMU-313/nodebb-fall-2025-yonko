'use strict';

const validator = require('validator');
const winston = require('winston');

const plugins = require('../plugins');
const db = require('../database');
const pubsub = require('../pubsub');

const admin = module.exports;
let cache = null;

pubsub.on('admin:navigation:save', () => {
	cache = null;
});

admin.save = async function (data) {
	const order = Object.keys(data);
	const bulkSet = [];
	data.forEach((item, index) => {
		item.order = order[index];
		if (item.hasOwnProperty('groups')) {
			item.groups = JSON.stringify(item.groups);
		}
		bulkSet.push([`navigation:enabled:${item.order}`, item]);
	});

	cache = null;
	pubsub.publish('admin:navigation:save');
	const ids = await db.getSortedSetRange('navigation:enabled', 0, -1);
	await db.deleteAll(ids.map(id => `navigation:enabled:${id}`));
	await db.setObjectBulk(bulkSet);
	await db.delete('navigation:enabled');
	await db.sortedSetAdd('navigation:enabled', order, order);
};

admin.getAdmin = async function () {
	const [enabled, available] = await Promise.all([
		admin.get(),
		getAvailable(),
	]);
	return { enabled: enabled, available: available };
};

const fieldsToEscape = ['iconClass', 'class', 'route', 'id', 'text', 'textClass', 'title'];

admin.escapeFields = navItems => toggleEscape(navItems, true);
admin.unescapeFields = navItems => toggleEscape(navItems, false);

function toggleEscape(navItems, flag) {
	navItems.forEach((item) => {
		if (item) {
			fieldsToEscape.forEach((field) => {
				if (item.hasOwnProperty(field)) {
					item[field] = validator[flag ? 'escape' : 'unescape'](String(item[field]));
				}
			});
		}
	});
}

admin.get = async function () {
	if (cache) {
		return cache.map(item => ({ ...item }));
	}
	const ids = await db.getSortedSetRange('navigation:enabled', 0, -1);
	const data = await db.getObjects(ids.map(id => `navigation:enabled:${id}`));
	cache = data.filter(Boolean).map((item) => {
		if (item.hasOwnProperty('groups')) {
			try {
				item.groups = JSON.parse(item.groups);
			} catch (err) {
				winston.error(err.stack);
				item.groups = [];
			}
		}
		item.groups = item.groups || [];
		if (item.groups && !Array.isArray(item.groups)) {
			item.groups = [item.groups];
		}
		return item;
	});
	admin.escapeFields(cache);

	return cache.map(item => ({ ...item }));
};

// Ensure default core navigation items from install/data/navigation.json are present
admin.ensureDefaults = async function () {
	try {
		const core = require('../../install/data/navigation.json').map(item => ({ ...item }));
		const ids = await db.getSortedSetRange('navigation:enabled', 0, -1);
		const existing = ids.length ? await db.getObjects(ids.map(id => `navigation:enabled:${id}`)) : [];
		const existingRoutes = existing.filter(Boolean).map(item => item.originalRoute || item.route || '');

		const toAdd = core.filter((item) => {
			// compare against originalRoute or route
			const route = item.route || '';
			return !existingRoutes.includes(route);
		});

		if (!toAdd.length) {
			return;
		}

		// Append missing items preserving order after existing
		const currentCount = ids.length || 0;
		const bulkSet = [];
		const newOrder = [];
		toAdd.forEach((item, idx) => {
			const order = String(currentCount + idx);
			item.order = order;
			if (item.hasOwnProperty('groups')) {
				item.groups = JSON.stringify(item.groups);
			}
			bulkSet.push([`navigation:enabled:${order}`, item]);
			newOrder.push(order);
		});

		// Persist the objects and update the sorted set
		await db.setObjectBulk(bulkSet);
		// Add to sorted set with score equal to order
		await db.sortedSetAdd('navigation:enabled', newOrder, newOrder);
		cache = null;
		pubsub.publish('admin:navigation:save');
	} catch (err) {
		winston.error(`[navigation.ensureDefaults] ${err.stack}`);
	}
};

admin.update = async function (route, data) {
	const ids = await db.getSortedSetRange('navigation:enabled', 0, -1);
	const navItems = await db.getObjects(ids.map(id => `navigation:enabled:${id}`));
	const matchedRoutes = navItems.filter(item => item && item.route === route);
	if (matchedRoutes.length) {
		await db.setObjectBulk(
			matchedRoutes.map(item => [`navigation:enabled:${item.order}`, data])
		);
		cache = null;
		pubsub.publish('admin:navigation:save');
	}
};

async function getAvailable() {
	const core = require('../../install/data/navigation.json').map((item) => {
		item.core = true;
		item.id = item.id || '';
		return item;
	});

	const navItems = await plugins.hooks.fire('filter:navigation.available', core);
	navItems.forEach((item) => {
		if (item && !item.hasOwnProperty('enabled')) {
			item.enabled = true;
		}
	});
	return navItems;
}

require('../promisify')(admin);
