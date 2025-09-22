'use strict';


define('sort', ['components'], function (components) {
	const module = {};

	module.handleSort = function (field, gotoOnSave) {
		const threadSort = components.get('thread/sort');
		threadSort.find('i').removeClass('fa-check');
		const currentSort = utils.params().sort || config[field];
		const currentSetting = threadSort.find('a[data-sort="' + currentSort + '"]');
		currentSetting.find('i').addClass('fa-check');

		$('body')
			.off('click', '[component="thread/sort"] a[data-sort]')
			.on('click', '[component="thread/sort"] a[data-sort]', function () {
				const newSetting = $(this).attr('data-sort');
				// If the new 'No Replies' sort option is selected, keep this front-end-only
				// and just log the action to the console as requested. Real filtering or
				// server-side changes are out of scope for this change.
				if (newSetting === 'no_replies') {
					console.log('No Replies selected');
					// Close dropdown if applicable and prevent navigation
					$(this).closest('.dropdown-menu').prev('[data-bs-toggle="dropdown"]').dropdown && $(this).closest('.dropdown-menu').prev('[data-bs-toggle="dropdown"]').dropdown('hide');
					return false;
				}
				const urlParams = utils.params();
				urlParams.sort = newSetting;
				const qs = $.param(urlParams);
				ajaxify.go(gotoOnSave + (qs ? '?' + qs : ''));
			});
	};

	return module;
});
