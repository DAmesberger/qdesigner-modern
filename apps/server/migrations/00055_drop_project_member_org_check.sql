-- 00055_drop_project_member_org_check.sql  (ADR 0033, rollout step 2)
--
-- Enable cross-org project membership at the schema layer. Until now the
-- 00009 `trg_project_members_org_check` trigger rejected any `project_members`
-- INSERT/UPDATE whose user was not an active member of the project's parent
-- org — the single thing stopping `project_members` from serving external
-- collaborators. ADR 0033 makes external collaboration cross-org project
-- membership, so a project member need not be an org member.
--
-- Dropping the trigger is ADDITIVE: every existing project_members row already
-- satisfied the org-membership predicate, so no existing row or behaviour
-- changes; the drop only *admits* new rows the trigger would previously have
-- rejected. The handler-layer precondition removed in the same unit
-- (`add_project_member`'s verify_org_membership) is the matching gate; the
-- caller's own authorization (authorize(Scope::Project, ProjectManageMembers))
-- is untouched.
--
-- A cross-org project member is a member of THAT ONE project only — invisible
-- at org scope (org membership stays its own concept). Tenant isolation is
-- unchanged: the study-data RLS branches (00054) scope such a member to
-- exactly that project's rows.

DROP TRIGGER IF EXISTS trg_project_members_org_check ON public.project_members;
DROP FUNCTION IF EXISTS public.check_project_member_org_membership();
