# User Guide

This guide explains how to use and user-test the new features added in this project, and where to find the automated tests that verify their behavior.

## Unanswered Questions

### Context

We want to emulate the action that is available on Piazza, which the ability for a professor to sort posts by unanswered post. We want a similar choice to be available to teachers on Nodebb.

###  How to Use Feature

This feature is only available to an teacher role (which we assume is an admin/moderator).
1. Create a post from a registered account under a topic
2. Using a teacher role login and go to a topic.
3. In the topic, there should be options to sort (Should start with Recently Replied). This option is the third option on the bar, after Tracking and All Tags. 
3. Click on that option and you should see an option for No Replies. 
4. This should should only show posts with no replies.

### Testing This Feature

I added a test named unanswered-topics.js in the test folder. This test tests the backend of this feature. It creates some unanswered posts and answered posts. It then calls topic.getUnanswered to see that it only replies with posts with no replies. It then checks that the category filter works. Lastly it looks at the GET requests and makes sure that they return the right shape/data and the filters. I think this is sufficient because tests the backend and we can user test the front end individually.  

## Upvote & Downvote Topics

### Context

Topics now have a score equal to the net votes on the first post (upvotes − downvotes). This enables sorting by score and an optional “High attention” badge for hot topics.

###  How to Use Feature

1. As a regular user, open a topic and upvote/downvote the first post to change the topic’s score (votes on replies don’t affect score).
2. On a category page, open the sorting drop down and pick "Most Votes" to list topics by score.
3. (Optional) As an admin, set the "high attention threshold" in the ACP. Topics with scores ≥ threshold display a badge on topic pages.

### Testing This Feature

Automated:
- `test/topics/score/score.js` verifies score updates on main-post votes, no effect from reply votes, presence of score in the API, and score_desc sorting.
- `test/topics/attention/attention.js` verifies the badge toggles based on the configured threshold.

Manual:
- Create several topics, vote the first post on some of them.
- Sort the category by Highest Score and confirm order.
- Adjust the threshold in ACP and confirm the badge appears/disappears accordingly.

Tests cover vote transitions, main vs. reply isolation, score in the API, sorting by score, and the attention badge threshold. Since the UI just renders these API results, end-to-end API tests are sufficient with a brief manual check.
