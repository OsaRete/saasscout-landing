-- Remove duplicate Discover actions while preserving the oldest row
-- for each user/discovery/problem/action combination.

with ranked_actions as (
  select
    id,
    row_number() over (
      partition by user_id, discovery_id, problem_id, action_type
      order by created_at asc nulls last, id asc
    ) as duplicate_rank
  from public.discovery_actions
)
delete from public.discovery_actions
where id in (
  select id
  from ranked_actions
  where duplicate_rank > 1
);

-- Required by the server-side idempotent upsert used by Prepare Deep Scan.
alter table public.discovery_actions
add constraint discovery_actions_user_discovery_problem_action_unique
unique (user_id, discovery_id, problem_id, action_type);
