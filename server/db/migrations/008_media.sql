-- 008_media.sql
-- Media assets, collections, usage tracking, and permissions

-- =============================================================================
-- Media assets
-- =============================================================================

CREATE TABLE public.media_assets (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    uploaded_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    filename          varchar(500) NOT NULL,
    original_filename varchar(500) NOT NULL,
    mime_type         varchar(255) NOT NULL,
    size_bytes        bigint      NOT NULL,
    storage_path      text        NOT NULL,
    width             integer,
    height            integer,
    duration_seconds  float,
    thumbnail_path    text,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    access_level      varchar(50) NOT NULL DEFAULT 'organization'
                                  CHECK (access_level IN ('private', 'organization', 'project', 'public')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_assets_org_id ON public.media_assets (organization_id);
CREATE INDEX idx_media_assets_uploaded_by ON public.media_assets (uploaded_by);
CREATE INDEX idx_media_assets_mime_type ON public.media_assets (mime_type);

CREATE TRIGGER trg_media_assets_updated_at
    BEFORE UPDATE ON public.media_assets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Media collections
-- =============================================================================

CREATE TABLE public.media_collections (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            varchar(255) NOT NULL,
    description     text,
    created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_collections_org_id ON public.media_collections (organization_id);

-- =============================================================================
-- Media collection items (many-to-many)
-- =============================================================================

CREATE TABLE public.media_collection_items (
    media_id      uuid        NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    collection_id uuid        NOT NULL REFERENCES public.media_collections(id) ON DELETE CASCADE,
    added_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    added_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (media_id, collection_id)
);

-- =============================================================================
-- Media usage tracking (where media is used in questionnaires)
-- =============================================================================

CREATE TABLE public.media_usage (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id         uuid        NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    questionnaire_id uuid        NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    question_id      varchar(255),
    usage_type       varchar(50) NOT NULL,
    usage_context    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (media_id, questionnaire_id, question_id, usage_type)
);

CREATE INDEX idx_media_usage_media_id ON public.media_usage (media_id);
CREATE INDEX idx_media_usage_questionnaire_id ON public.media_usage (questionnaire_id);

-- =============================================================================
-- Media permissions (fine-grained per-asset access)
-- =============================================================================

CREATE TABLE public.media_permissions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id    uuid        NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    user_id     uuid        REFERENCES public.users(id) ON DELETE CASCADE,
    role_id     varchar(50),
    permission  varchar(50) NOT NULL CHECK (permission IN ('view', 'edit', 'delete', 'share')),
    granted_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_permissions_media_id ON public.media_permissions (media_id);
CREATE INDEX idx_media_permissions_user_id ON public.media_permissions (user_id);
