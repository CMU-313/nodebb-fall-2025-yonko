**User Guide on Unanswered Questions**

**Context**

We want to emulate the action that is available on Piazza, which the ability for a professor to sort posts by unanswered post. We want a similar choice to be available to teachers on Nodebb.

**How to Use Feature**

This feature is only available to an teacher role (which we assume is an admin). 
1. Create a post from a registered account under a topic
2. Using a teacher role login and go to a topic.
3. In the topic, there should be options to sort (Should start with Recently Replied). This option is the third option on the bar, after Tracking and All Tags. 
3. Click on that option and you should see an option for No Replies. 
4. This should should only show posts with no replies.

**Testing This Feature**

I added a test named unanswered-topics.js in the test folder. This test tests the backend of this feature. It creates some unanswered posts and answered posts. It then calls topic.getUnanswered to see that it only replies with posts with no replies. It then checks that the category filter works. Lastly it looks at the GET requests and makes sure that they return the right shape/data and the filters. I think this is sufficient because tests the backend and we can user test the front end individually.  
