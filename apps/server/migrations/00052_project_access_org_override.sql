-- 00052_project_access_org_override.sql  (ADR 0032 — ledger L5)
--
-- Realizes divergence-ledger row L5 so the step-2 fold of the six inline
-- `has_project_role(Admin/Owner)` sites into `authorize()` is
-- behavior-preserving. The 00051 definer gate's `'admin'`/`'owner'` tiers
-- reproduced `RbacManager::has_project_role` = **project_members role only**.
-- But those six inline sites gate on **"project admin+ OR org admin+"**
-- (projects.rs add/update/remove_project_member) and **"project owner OR org
-- owner/admin"** (delete_project / transfer_project_ownership) — they OR
-- `has_project_role` with an **org-role override**. Folding them as-is would
-- silently DENY an org admin/owner who holds no `project_members` row.
--
-- This CREATE OR REPLACE adds the org owner/admin override branch to the
-- `'admin'` and `'owner'` arms (Viewer/Editor already had it). The
-- viewer/editor arms are copied byte-for-byte from 00051; only the two upper
-- arms change. All function attributes (LANGUAGE sql STABLE SECURITY DEFINER,
-- `SET search_path = public, pg_temp`) are identical to 00051.
--
-- CREATE OR REPLACE preserves the existing owner (`qdesigner`) and the
-- REVOKE/GRANT ACL from 00051, so the OWNER TO / REVOKE / GRANT hardening
-- statements are intentionally NOT re-run here — replacing a function body
-- does not reset ownership or privileges. (Left as a comment per the ADR 0032
-- acceptance criteria that the owner/grant posture be auditable.)
CREATE OR REPLACE FUNCTION public.user_has_project_access(
    pid uuid, uid uuid, required text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE required
        WHEN 'viewer' THEN EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organizations o ON o.id = p.organization_id
            WHERE p.id = pid AND p.deleted_at IS NULL
              AND (
                EXISTS (
                    SELECT 1 FROM public.organization_members om
                    WHERE om.organization_id = p.organization_id
                      AND om.user_id = uid AND om.status = 'active'
                      AND om.role IN ('owner', 'admin')
                )
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = uid
                )
                OR (
                    COALESCE(o.settings->>'projectVisibility', 'org') = 'org'
                    AND EXISTS (
                        SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = p.organization_id
                          AND om.user_id = uid AND om.status = 'active'
                    )
                )
                OR public.user_has_active_share('project', p.id, uid)
              )
        )
        WHEN 'editor' THEN (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_id = pid AND user_id = uid
                  AND role IN ('owner', 'admin', 'editor')
            )
            OR EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om ON om.organization_id = p.organization_id
                WHERE p.id = pid AND om.user_id = uid AND om.status = 'active'
                  AND om.role IN ('owner', 'admin')
            )
            OR public.user_has_active_edit_share('project', pid, uid)
        )
        -- ── L5: 'admin' gains the org owner/admin override ───────────────
        -- Pre-L5 this arm was project_members(role IN owner,admin) only. The
        -- six inline sites OR that with has_org_role(Admin), so the fold
        -- needs the same override to stay byte-identical.
        WHEN 'admin' THEN (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_id = pid AND user_id = uid
                  AND role IN ('owner', 'admin')
            )
            OR EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om ON om.organization_id = p.organization_id
                WHERE p.id = pid AND om.user_id = uid AND om.status = 'active'
                  AND om.role IN ('owner', 'admin')
            )
        )
        -- ── L5: 'owner' gains the org owner/admin override ───────────────
        -- Pre-L5 this arm was project_members(role = owner) only. The two
        -- owner-tier inline sites (delete / transfer) OR that with
        -- has_org_role(Admin) — an org owner OR admin passes.
        WHEN 'owner' THEN (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_id = pid AND user_id = uid
                  AND role = 'owner'
            )
            OR EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om ON om.organization_id = p.organization_id
                WHERE p.id = pid AND om.user_id = uid AND om.status = 'active'
                  AND om.role IN ('owner', 'admin')
            )
        )
        ELSE false
    END;
$$;
