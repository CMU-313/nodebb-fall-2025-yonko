define('forum/topic-followup', ['jquery', 'forum/topic'], function ($) {
// This is the CRITICAL test: check for this log!
	console.log('Followup Script Loading: SUCCESS! (via define)');

	var Followup = {};

	Followup.init = function () {
		// Your logic for setting up the event listener on the button
		console.log('Followup.init running');
		
		// This is the handler for your button click
		$('#content').off('click', '.topic-followup-button').on('click', '.topic-followup-button', function () {
			// Check the console when you click the button
			console.log('Request Followup button clicked!');

			// Socket.io emission logic would go here:
			// socket.emit('plugins.topicfollowup.request', { tid: ajaxify.data.tid }); 
		});
	};

	// Use a NodeBB hook to run your init code when the page changes
	$(window).on('action:topic.loaded action:ajaxify.end', Followup.init);

	// Return the module object
	return Followup;
});