-- 00009_project_member_org_constraint.sql
-- Enforce that project members must be active org members of the parent org.

CREATE OR REPLACE FUNCTION public.check_project_member_org_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.projects
    WHERE id = NEW.project_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Project % does not exist', NEW.project_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = v_org_id
          AND user_id = NEW.user_id
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'User % is not an active member of organization %',
            NEW.user_id, v_org_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_members_org_check
    BEFORE INSERT OR UPDATE ON public.project_members
    FOR EACH ROW
    EXECUTE FUNCTION public.check_project_member_org_membership();
