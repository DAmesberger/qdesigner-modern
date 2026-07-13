-- 00057_project_invitation_project_fn.sql
--
-- ADR 0033 (Unit 3) support: the public accept-page lookup
-- `GET /api/project-invitations/{token}` runs UNAUTHENTICATED (no
-- `app.user_id`), mirroring the org `GET /api/invitations/{token}`. The org
-- flow can join `organizations` because that table is RLS-exempt; `projects`
-- is RLS-bound, so an anonymous join to it returns zero rows and the invite
-- would 404 even though it exists.
--
-- This RLS-immune helper returns just the invited project's display fields
-- (name + code) so the accept page can render "You're invited to <project>"
-- without exposing anything RLS otherwise protects — the analogue of the org
-- flow surfacing org name/slug to a token holder. STABLE SECURITY DEFINER,
-- owned by the `qdesigner` migration role (SUPERUSER + BYPASSRLS), with a
-- pinned search_path, matching the estate's definer-helper convention
-- (00033/00051/00054). Soft-deleted projects yield no row (→ the handler's
-- inner LATERAL join drops the invite → 404, matching org get's deleted-org
-- behaviour).

CREATE OR REPLACE FUNCTION public.project_invitation_project(pid uuid)
RETURNS TABLE(name text, code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.name::text, p.code::text
    FROM projects p
    WHERE p.id = pid AND p.deleted_at IS NULL
$$;

ALTER FUNCTION public.project_invitation_project(uuid) OWNER TO qdesigner;

REVOKE ALL ON FUNCTION public.project_invitation_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_invitation_project(uuid) TO qdesigner_app;
