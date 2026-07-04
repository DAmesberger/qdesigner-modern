-- 00025_media_assets_anon_read.sql
--
-- Slice 2.1 (contract D1): the same-origin media streaming proxy
-- `GET /api/media/{id}/content` must serve an asset's bytes to anonymous
-- fillout callers when — and only when — that asset is referenced by a
-- PUBLISHED questionnaire. This mirrors the anonymous-read posture that
-- ADR 0012/0015 established for the by-code endpoint, and specifically
-- mirrors `projects_select_via_published_questionnaire`
-- (00021_fillout_dual_policies.sql): a second, OR-merged SELECT policy
-- admitting a row via the published-questionnaire path, leaving the 00014
-- `media_assets_select` org-member policy untouched.
--
-- Reference chain: media assets are NOT FK-linked to questionnaires. A
-- questionnaire references an asset by embedding the asset's id (as the
-- `mediaId` field, at question-type-specific paths — reaction stimuli,
-- instruction media, etc.) inside the definition `content` JSONB. The
-- by-code fillout read (api/questionnaires.rs get_questionnaire_by_code)
-- returns exactly `questionnaire_definitions.content` as the definition,
-- so that column is the authoritative reference source. The admission
-- predicate therefore tests whether the asset's id appears in the content
-- of any published, non-deleted questionnaire. Media asset ids are random
-- v4 UUIDs, so a substring match on the serialized JSON is collision-safe.
--
-- CRITICAL — org-scoped: the referencing questionnaire MUST belong to the
-- asset's own organization (join through projects.organization_id). Without
-- this scope the predicate is an attacker-controllable confused deputy: any
-- tenant could embed a victim org's asset UUID as a string in a questionnaire
-- they publish and make that asset's bytes world-readable through the
-- anonymous proxy (whose ONLY gate is RLS admission). The org join makes the
-- policy self-scoped, exactly like `projects_select_via_published_questionnaire`
-- links through its ownership FK.
--
-- Threat trade (mirrors the projects policy note in 00021): an asset
-- becomes byte-readable by id (anonymous, GUC-less) precisely once a
-- published questionnaire IN THE ASSET'S OWN ORG references it — exactly the
-- set the fillout runtime must fetch. Unreferenced org media, media referenced
-- only by draft/archived questionnaires, and any cross-org reference stay
-- behind the existing 00014 `media_assets_select` org-member policy.
--
-- Does NOT weaken existing policies. RLS combines permissive policies with
-- OR, so this is purely additive: the 00014 `media_assets_select`,
-- the 00020 `media_assets_{insert,update,delete}_all` mutation policies,
-- and the 00022 FORCE posture are all left in place.

DROP POLICY IF EXISTS media_assets_select_via_published_questionnaire ON public.media_assets;
CREATE POLICY media_assets_select_via_published_questionnaire ON public.media_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.questionnaire_definitions qd
            JOIN public.projects p ON p.id = qd.project_id
            WHERE p.organization_id = media_assets.organization_id
              AND qd.content::text LIKE '%' || media_assets.id::text || '%'
              AND qd.status = 'published'
              AND qd.deleted_at IS NULL
        )
    );
