-- Score objects remain authoritative participant values. Numeric filters and
-- the designer's score.<scale>.<field> keys read their index projections.
UPDATE public.session_variable_index
SET numeric_value = (raw_value->>'value')::double precision,
    updated_at = NOW()
WHERE jsonb_typeof(raw_value) = 'object'
  AND jsonb_typeof(raw_value->'value') = 'number';

INSERT INTO public.session_variable_index (
    session_id, questionnaire_id,
    questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch,
    variable_name, value_type, source_kind, numeric_value, text_value, boolean_value, raw_value
)
SELECT
    root.session_id, root.questionnaire_id,
    root.questionnaire_version_major, root.questionnaire_version_minor, root.questionnaire_version_patch,
    root.variable_name || '.' || field.key,
    CASE jsonb_typeof(field.value)
        WHEN 'number' THEN 'number' WHEN 'string' THEN 'string'
        WHEN 'boolean' THEN 'boolean' ELSE 'json' END,
    root.source_kind,
    CASE WHEN jsonb_typeof(field.value) = 'number' THEN (field.value #>> '{}')::double precision END,
    CASE WHEN jsonb_typeof(field.value) = 'string' THEN field.value #>> '{}' END,
    CASE WHEN jsonb_typeof(field.value) = 'boolean' THEN (field.value #>> '{}')::boolean END,
    field.value
FROM public.session_variable_index root
CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(root.raw_value) = 'object' THEN root.raw_value ELSE '{}'::jsonb END
) field
WHERE root.variable_name LIKE 'score.%'
  AND field.key IN ('value', 'z', 'tScore', 'stanine', 'percentile', 'itemsAnswered', 'itemsExpected', 'band')
  AND NOT EXISTS (
      SELECT 1 FROM public.session_variables explicit
      WHERE explicit.session_id = root.session_id
        AND explicit.variable_name = root.variable_name || '.' || field.key
  )
ON CONFLICT (session_id, variable_name) DO UPDATE SET
    value_type = EXCLUDED.value_type,
    source_kind = EXCLUDED.source_kind,
    numeric_value = EXCLUDED.numeric_value,
    text_value = EXCLUDED.text_value,
    boolean_value = EXCLUDED.boolean_value,
    raw_value = EXCLUDED.raw_value,
    updated_at = NOW();
