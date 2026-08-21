-- Chat-app seed data — runs after all qhorus schema migrations.
-- Scenario: a product team preparing for a v2.0 release.
-- Exercises: channels, topics, members, messages (all types), threading,
-- commitments, correlation chains, reactions.

-- =========================================================================
-- Spaces (default + 3 case spaces)
-- =========================================================================
INSERT INTO space (id, name, description, tenancy_id, created_at)
VALUES ('aa000000-0000-0000-0000-000000000000', 'Team', 'Default space for organisation-wide channels', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO space (id, name, description, tenancy_id, created_at)
VALUES ('aa000000-0000-0000-0000-000000000001', 'Case Alpha', 'Primary demo case', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO space (id, name, description, tenancy_id, created_at)
VALUES ('aa000000-0000-0000-0000-000000000002', 'Case Beta', 'Secondary demo case', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO space (id, name, description, tenancy_id, created_at)
VALUES ('aa000000-0000-0000-0000-000000000003', 'Case Gamma', 'Tertiary demo case', 'chat-app', CURRENT_TIMESTAMP);

-- =========================================================================
-- Channels
-- =========================================================================
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440001', 'general', 'Team announcements and discussion', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440002', 'engineering', 'Engineering coordination', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440003', 'design', 'Design reviews and feedback', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440004', 'random', 'Water cooler', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
-- Case Alpha channels (normative triple)
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440011', 'alpha-work', 'Alpha case work channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440012', 'alpha-observe', 'Alpha case observation channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440013', 'alpha-oversight', 'Alpha case oversight channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
-- Case Beta channels (normative triple)
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440021', 'beta-work', 'Beta case work channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440022', 'beta-observe', 'Beta case observation channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440023', 'beta-oversight', 'Beta case oversight channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
-- Case Gamma channels (normative triple)
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440031', 'gamma-work', 'Gamma case work channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000003', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440032', 'gamma-observe', 'Gamma case observation channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000003', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO channel (id, name, description, semantic, paused, auto_created, tenancy_id, space_id, created_at, last_activity_at)
VALUES ('550e8400-e29b-41d4-a716-446655440033', 'gamma-oversight', 'Gamma case oversight channel', 'APPEND', false, false, 'chat-app', 'aa000000-0000-0000-0000-000000000003', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- =========================================================================
-- Topics
-- =========================================================================
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'general', false, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'v2-release', false, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'general', false, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'deploy-pipeline', false, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'bug-auth-timeout', true, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440003', 'general', false, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440003', 'nav-redesign', false, 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO topic (channel_id, name, resolved, tenancy_id, created_at) VALUES ('550e8400-e29b-41d4-a716-446655440004', 'general', false, 'chat-app', CURRENT_TIMESTAMP);

-- =========================================================================
-- Members
-- =========================================================================
-- #general: everyone
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'charlie', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440001', 'agent-alpha', 'OBSERVER', 'chat-app', CURRENT_TIMESTAMP);
-- #engineering: alice, bob, agent-alpha
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440002', 'agent-alpha', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
-- #design: alice, charlie
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440003', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440003', 'charlie', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
-- #random: everyone
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440004', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440004', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440004', 'charlie', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);

-- =========================================================================
-- Messages: #general — release planning
-- =========================================================================
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (1, '550e8400-e29b-41d4-a716-446655440001', 'alice', 'QUERY', 'Team: v2.0 release is targeted for Friday. Where do we stand?', 'HUMAN', 'v2-release', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '3' HOUR);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (2, '550e8400-e29b-41d4-a716-446655440001', 'bob', 'RESPONSE', 'Backend is feature-complete. All API tests green. Just need the deploy pipeline verified.', 'HUMAN', 'v2-release', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '175' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (3, '550e8400-e29b-41d4-a716-446655440001', 'charlie', 'RESPONSE', 'Design review is done. The nav component changes landed yesterday. One accessibility item still open.', 'HUMAN', 'v2-release', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '170' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (4, '550e8400-e29b-41d4-a716-446655440001', 'alice', 'RESPONSE', 'Good. Charlie, can you get the a11y fix in by tomorrow? Bob, please coordinate the staging deploy with agent-alpha.', 'HUMAN', 'v2-release', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '165' MINUTE);

-- alice assigns a task to charlie (COMMAND → commitment)
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, target, tenancy_id, created_at)
VALUES (5, '550e8400-e29b-41d4-a716-446655440001', 'alice', 'COMMAND', 'Fix the keyboard navigation on the channel-nav dropdown — screen readers cannot reach the channel list.', 'HUMAN', 'v2-release', 'corr-a11y-fix', 'charlie', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '160' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, in_reply_to, tenancy_id, created_at)
VALUES (6, '550e8400-e29b-41d4-a716-446655440001', 'charlie', 'STATUS', 'On it. I will have a fix ready for review by end of day.', 'HUMAN', 'v2-release', 'corr-a11y-fix', 5, 'chat-app', CURRENT_TIMESTAMP - INTERVAL '155' MINUTE);

-- general chatter
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (7, '550e8400-e29b-41d4-a716-446655440001', 'bob', 'RESPONSE', 'Reminder: standup moved to 10:30 tomorrow. Calendar invite updated.', 'HUMAN', 'general', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '120' MINUTE);

-- =========================================================================
-- Messages: #engineering — bug fix and deploy
-- =========================================================================
-- Bug discussion (resolved topic)
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (8, '550e8400-e29b-41d4-a716-446655440002', 'bob', 'QUERY', 'Auth tokens are expiring after 5 minutes instead of 24 hours. Anyone else seeing this?', 'HUMAN', 'bug-auth-timeout', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '150' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (9, '550e8400-e29b-41d4-a716-446655440002', 'alice', 'RESPONSE', 'Confirmed. The JWT expiry was set to 300 seconds in the dev profile. Should be 86400.', 'HUMAN', 'bug-auth-timeout', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '145' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (10, '550e8400-e29b-41d4-a716-446655440002', 'alice', 'RESPONSE', 'Fixed in commit a3f8c21. One-liner in application.properties.', 'HUMAN', 'bug-auth-timeout', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '140' MINUTE);

-- Deploy coordination with agent (COMMAND → DONE chain)
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, target, tenancy_id, created_at)
VALUES (11, '550e8400-e29b-41d4-a716-446655440002', 'bob', 'COMMAND', 'Run the full integration test suite against staging and report results.', 'HUMAN', 'deploy-pipeline', 'corr-staging-tests', 'agent-alpha', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '100' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, in_reply_to, tenancy_id, created_at)
VALUES (12, '550e8400-e29b-41d4-a716-446655440002', 'agent-alpha', 'STATUS', 'Test suite started. Running 47 integration scenarios across 3 service groups. Estimated time: 12 minutes.', 'AGENT', 'deploy-pipeline', 'corr-staging-tests', 11, 'chat-app', CURRENT_TIMESTAMP - INTERVAL '99' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, in_reply_to, tenancy_id, created_at)
VALUES (13, '550e8400-e29b-41d4-a716-446655440002', 'agent-alpha', 'DONE', 'All 47 integration tests passed. Coverage: auth (12/12), channels (18/18), push (9/9), messaging (8/8). No regressions detected. Staging is green.', 'AGENT', 'deploy-pipeline', 'corr-staging-tests', 11, 'chat-app', CURRENT_TIMESTAMP - INTERVAL '87' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (14, '550e8400-e29b-41d4-a716-446655440002', 'bob', 'RESPONSE', 'Staging verified. Ready to promote to production when alice gives the go-ahead.', 'HUMAN', 'deploy-pipeline', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '85' MINUTE);

-- Second command — still open
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, target, tenancy_id, created_at)
VALUES (15, '550e8400-e29b-41d4-a716-446655440002', 'alice', 'COMMAND', 'Monitor error rates for the next 2 hours after we deploy. Alert if 5xx rate exceeds 0.1%.', 'HUMAN', 'deploy-pipeline', 'corr-monitor-deploy', 'agent-alpha', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '60' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, in_reply_to, tenancy_id, created_at)
VALUES (16, '550e8400-e29b-41d4-a716-446655440002', 'agent-alpha', 'STATUS', 'Monitoring active. Current 5xx rate: 0.02%. Will report at 30-minute intervals.', 'AGENT', 'deploy-pipeline', 'corr-monitor-deploy', 15, 'chat-app', CURRENT_TIMESTAMP - INTERVAL '55' MINUTE);

-- General engineering chat
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (17, '550e8400-e29b-41d4-a716-446655440002', 'bob', 'RESPONSE', 'The new push protocol is noticeably faster than the old SSE polling. WebSocket reconnect is seamless.', 'HUMAN', 'general', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '40' MINUTE);

-- =========================================================================
-- Messages: #design — nav redesign discussion
-- =========================================================================
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (18, '550e8400-e29b-41d4-a716-446655440003', 'charlie', 'QUERY', 'Should the channel-nav support drag-and-drop reordering? Users have asked for it.', 'HUMAN', 'nav-redesign', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '130' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (19, '550e8400-e29b-41d4-a716-446655440003', 'alice', 'RESPONSE', 'Not for v2. The space hierarchy handles grouping. Manual reorder can wait for v2.1.', 'HUMAN', 'nav-redesign', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '125' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (20, '550e8400-e29b-41d4-a716-446655440003', 'charlie', 'RESPONSE', 'Makes sense. The collapsible SpaceNode groups cover the main use case. What about the topic bar — should resolved topics be hidden or greyed out?', 'HUMAN', 'nav-redesign', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '120' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (21, '550e8400-e29b-41d4-a716-446655440003', 'alice', 'RESPONSE', 'Greyed out with strikethrough. Users need the context but should not interact accidentally.', 'HUMAN', 'nav-redesign', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '115' MINUTE);

-- Design task still in progress
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, target, tenancy_id, created_at)
VALUES (22, '550e8400-e29b-41d4-a716-446655440003', 'alice', 'COMMAND', 'Create mockups for the space hierarchy nav with collapsible groups and unread count badges.', 'HUMAN', 'nav-redesign', 'corr-nav-mockups', 'charlie', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '110' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, correlation_id, in_reply_to, tenancy_id, created_at)
VALUES (23, '550e8400-e29b-41d4-a716-446655440003', 'charlie', 'STATUS', 'Working on it. First draft will be ready for review in about an hour.', 'HUMAN', 'nav-redesign', 'corr-nav-mockups', 22, 'chat-app', CURRENT_TIMESTAMP - INTERVAL '105' MINUTE);

-- =========================================================================
-- Messages: #random
-- =========================================================================
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (24, '550e8400-e29b-41d4-a716-446655440004', 'charlie', 'QUERY', 'Anyone tried the new coffee place on the corner?', 'HUMAN', 'general', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '90' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (25, '550e8400-e29b-41d4-a716-446655440004', 'bob', 'RESPONSE', 'The flat white is excellent. They do oat milk properly too.', 'HUMAN', 'general', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '85' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (26, '550e8400-e29b-41d4-a716-446655440004', 'alice', 'RESPONSE', 'Good to know. Heading there after standup tomorrow.', 'HUMAN', 'general', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '80' MINUTE);

INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, topic, tenancy_id, created_at)
VALUES (27, '550e8400-e29b-41d4-a716-446655440004', 'charlie', 'RESPONSE', 'Pro tip: ask for the cortado. Not on the menu but they make it perfectly.', 'HUMAN', 'general', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '75' MINUTE);

-- =========================================================================
-- Commitments (created by COMMAND messages)
-- =========================================================================
-- corr-a11y-fix: charlie fixing a11y — acknowledged, in progress
INSERT INTO commitment (id, correlation_id, channel_id, message_type, requester, obligor, state, tenancy_id, created_at, acknowledged_at)
VALUES ('a0000000-0000-0000-0000-000000000001', 'corr-a11y-fix', '550e8400-e29b-41d4-a716-446655440001', 'COMMAND', 'alice', 'charlie', 'ACKNOWLEDGED', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '160' MINUTE, CURRENT_TIMESTAMP - INTERVAL '155' MINUTE);

-- corr-staging-tests: agent ran tests — resolved/done
INSERT INTO commitment (id, correlation_id, channel_id, message_type, requester, obligor, state, tenancy_id, created_at, acknowledged_at, resolved_at)
VALUES ('a0000000-0000-0000-0000-000000000002', 'corr-staging-tests', '550e8400-e29b-41d4-a716-446655440002', 'COMMAND', 'bob', 'agent-alpha', 'FULFILLED', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '100' MINUTE, CURRENT_TIMESTAMP - INTERVAL '99' MINUTE, CURRENT_TIMESTAMP - INTERVAL '87' MINUTE);

-- corr-monitor-deploy: agent monitoring — still open/acknowledged
INSERT INTO commitment (id, correlation_id, channel_id, message_type, requester, obligor, state, tenancy_id, created_at, acknowledged_at)
VALUES ('a0000000-0000-0000-0000-000000000003', 'corr-monitor-deploy', '550e8400-e29b-41d4-a716-446655440002', 'COMMAND', 'alice', 'agent-alpha', 'ACKNOWLEDGED', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '60' MINUTE, CURRENT_TIMESTAMP - INTERVAL '55' MINUTE);

-- corr-nav-mockups: charlie doing mockups — still open/acknowledged
INSERT INTO commitment (id, correlation_id, channel_id, message_type, requester, obligor, state, tenancy_id, created_at, acknowledged_at)
VALUES ('a0000000-0000-0000-0000-000000000004', 'corr-nav-mockups', '550e8400-e29b-41d4-a716-446655440003', 'COMMAND', 'alice', 'charlie', 'ACKNOWLEDGED', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '110' MINUTE, CURRENT_TIMESTAMP - INTERVAL '105' MINUTE);

-- =========================================================================
-- Reactions
-- =========================================================================
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (2, 'thumbsup', 'alice', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '174' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (3, 'thumbsup', 'alice', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '169' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (3, 'thumbsup', 'bob', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '168' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (10, 'white_check_mark', 'bob', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '139' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (13, 'tada', 'bob', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '86' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (13, 'tada', 'alice', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '86' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (13, 'rocket', 'bob', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '85' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (25, 'coffee', 'alice', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '84' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (25, 'coffee', 'charlie', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '83' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (27, 'heart', 'alice', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '74' MINUTE);
INSERT INTO reaction (message_id, emoji, actor_id, tenancy_id, created_at) VALUES (27, 'heart', 'bob', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '73' MINUTE);

-- =========================================================================
-- Space channel memberships
-- =========================================================================
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440011', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440011', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440012', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440012', 'charlie', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440013', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440021', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440021', 'charlie', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440022', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440023', 'bob', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440031', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440032', 'alice', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);
INSERT INTO channel_membership (channel_id, member_id, member_role, tenancy_id, joined_at) VALUES ('550e8400-e29b-41d4-a716-446655440033', 'charlie', 'PARTICIPANT', 'chat-app', CURRENT_TIMESTAMP);

-- =========================================================================
-- Space channel messages (produce non-zero unread counts)
-- =========================================================================
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (28, '550e8400-e29b-41d4-a716-446655440011', 'alice', 'QUERY', 'Alpha case intake: new referral from the Smith family.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '50' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (29, '550e8400-e29b-41d4-a716-446655440011', 'bob', 'RESPONSE', 'Acknowledged. Starting initial assessment this afternoon.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '45' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (30, '550e8400-e29b-41d4-a716-446655440012', 'charlie', 'STATUS', 'Home visit completed. Three risk factors identified — see attached notes.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (31, '550e8400-e29b-41d4-a716-446655440012', 'alice', 'RESPONSE', 'Thanks Charlie. Scheduling multi-agency review for tomorrow.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '25' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (32, '550e8400-e29b-41d4-a716-446655440012', 'charlie', 'RESPONSE', 'Confirmed. I will prepare the chronology for the review panel.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (33, '550e8400-e29b-41d4-a716-446655440021', 'bob', 'QUERY', 'Beta case: follow-up assessment due next week. Any blockers?', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '15' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (34, '550e8400-e29b-41d4-a716-446655440021', 'charlie', 'RESPONSE', 'No blockers. Contact details confirmed with the family.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '10' MINUTE);
INSERT INTO message (id, channel_id, sender, message_type, content, actor_type, tenancy_id, created_at)
VALUES (35, '550e8400-e29b-41d4-a716-446655440031', 'alice', 'QUERY', 'Gamma case: initial screening complete. Proceeding to full assessment.', 'HUMAN', 'chat-app', CURRENT_TIMESTAMP - INTERVAL '5' MINUTE);
