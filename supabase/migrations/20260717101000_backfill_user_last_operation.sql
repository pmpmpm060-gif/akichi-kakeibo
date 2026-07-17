-- 既存データから、承認画面に表示する最終操作時刻を移行する。

with profile_sources as (
  select
    profile.auth_user_id as user_id,
    transaction.created_at as operated_at,
    '/dashboard'::text as operation_path
  from public.household_profiles profile
  join public.transactions transaction
    on transaction.household_id = profile.household_id
   and transaction.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    transaction.deleted_at,
    '/dashboard'
  from public.household_profiles profile
  join public.transactions transaction
    on transaction.household_id = profile.household_id
   and transaction.user_id = profile.profile_id
  where profile.auth_user_id is not null
    and transaction.deleted_at is not null

  union all

  select
    profile.auth_user_id,
    category.created_at,
    '/categories'
  from public.household_profiles profile
  join public.categories category
    on category.household_id = profile.household_id
   and category.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    category.deleted_at,
    '/categories'
  from public.household_profiles profile
  join public.categories category
    on category.household_id = profile.household_id
   and category.user_id = profile.profile_id
  where profile.auth_user_id is not null
    and category.deleted_at is not null

  union all

  select
    profile.auth_user_id,
    recurring.created_at,
    '/recurring'
  from public.household_profiles profile
  join public.recurring_transactions recurring
    on recurring.household_id = profile.household_id
   and recurring.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    goal.created_at,
    '/savings'
  from public.household_profiles profile
  join public.savings_goals goal
    on goal.household_id = profile.household_id
   and goal.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    contribution.created_at,
    '/savings'
  from public.household_profiles profile
  join public.savings_contributions contribution
    on contribution.household_id = profile.household_id
   and contribution.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    template.created_at,
    '/tools'
  from public.household_profiles profile
  join public.transaction_templates template
    on template.household_id = profile.household_id
   and template.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    review.updated_at,
    '/reports'
  from public.household_profiles profile
  join public.monthly_reviews review
    on review.household_id = profile.household_id
   and review.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    alert.dismissed_at,
    '/'
  from public.household_profiles profile
  join public.dismissed_alerts alert
    on alert.household_id = profile.household_id
   and alert.user_id = profile.profile_id
  where profile.auth_user_id is not null

  union all

  select
    profile.auth_user_id,
    adjustment.updated_at,
    '/reports'
  from public.household_profiles profile
  join public.carryover_adjustments adjustment
    on adjustment.household_id = profile.household_id
   and adjustment.user_id = profile.profile_id
  where profile.auth_user_id is not null
),
actor_sources as (
  select
    history.changed_by as user_id,
    history.changed_at as operated_at,
    '/dashboard'::text as operation_path
  from public.transaction_correction_history history

  union all

  select
    history.changed_by,
    history.changed_at,
    '/reports'
  from public.carryover_adjustment_history history
),
approval_sources as (
  select
    approval.user_id,
    approval.requested_at as operated_at,
    '/approval-pending'::text as operation_path
  from public.user_approvals approval
),
ranked_sources as (
  select
    source.user_id,
    source.operated_at,
    source.operation_path,
    row_number() over (
      partition by source.user_id
      order by source.operated_at desc, source.operation_path
    ) as source_rank
  from (
    select * from profile_sources
    union all
    select * from actor_sources
    union all
    select * from approval_sources
  ) source
  where source.operated_at is not null
)
insert into public.user_operation_activity (user_id, last_operated_at, last_path)
select
  user_id,
  operated_at,
  operation_path
from ranked_sources
where source_rank = 1
on conflict (user_id) do update
  set last_operated_at = greatest(public.user_operation_activity.last_operated_at, excluded.last_operated_at),
      last_path = case
        when excluded.last_operated_at >= public.user_operation_activity.last_operated_at then excluded.last_path
        else public.user_operation_activity.last_path
      end;
