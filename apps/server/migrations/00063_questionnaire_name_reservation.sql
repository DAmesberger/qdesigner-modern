-- A questionnaire's optimistic revision is not its identity. Including it in
-- name uniqueness let a duplicate be created after the original's first save,
-- then caused unrelated saves to collide when the revisions caught up.
ALTER TABLE public.questionnaire_definitions
    DROP CONSTRAINT questionnaire_definitions_project_id_name_version_key;

CREATE INDEX questionnaire_definitions_project_name_idx
    ON public.questionnaire_definitions (project_id, name);

-- Preserve existing rows, including any duplicates admitted by the old index.
-- Their content/revision updates remain possible; new names must be available.
-- A transaction-scoped name lock also serializes native create and QDef import.
CREATE FUNCTION public.reserve_questionnaire_name() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.project_id = NEW.project_id AND OLD.name = NEW.name THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        json_build_array('questionnaire-name', NEW.project_id, NEW.name)::text, 0
    ));

    IF EXISTS (
        SELECT 1 FROM public.questionnaire_definitions
        WHERE project_id = NEW.project_id AND name = NEW.name AND id <> NEW.id
    ) THEN
        RAISE unique_violation USING
            MESSAGE = 'A questionnaire with this name already exists in this project.',
            CONSTRAINT = 'questionnaire_definitions_project_name_key';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER questionnaire_name_reservation
    BEFORE INSERT OR UPDATE OF project_id, name ON public.questionnaire_definitions
    FOR EACH ROW EXECUTE FUNCTION public.reserve_questionnaire_name();
