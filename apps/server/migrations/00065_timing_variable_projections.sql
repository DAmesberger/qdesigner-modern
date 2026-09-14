-- VariableEngine's `time` values are elapsed numeric timings, not calendar
-- timestamps. Repair only projections whose versioned declaration proves that
-- type; authoritative participant values and date/timestamp variables stay intact.
UPDATE public.session_variable_index index_row
SET value_type = 'number',
    numeric_value = (index_row.raw_value #>> '{}')::double precision,
    timestamp_value = NULL,
    text_value = NULL,
    boolean_value = NULL,
    updated_at = NOW()
FROM public.questionnaire_variable_definitions declaration
WHERE declaration.questionnaire_id = index_row.questionnaire_id
  AND declaration.variable_name = index_row.variable_name
  AND declaration.version_major = COALESCE(index_row.questionnaire_version_major, 1)
  AND declaration.version_minor = COALESCE(index_row.questionnaire_version_minor, 0)
  AND declaration.version_patch = COALESCE(index_row.questionnaire_version_patch, 0)
  AND lower(trim(declaration.declared_type)) = 'time'
  AND jsonb_typeof(index_row.raw_value) = 'number';
