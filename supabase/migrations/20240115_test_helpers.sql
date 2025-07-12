-- Create helper functions for testing
-- These functions allow test suites to create isolated schemas

-- Function to create a test schema
CREATE OR REPLACE FUNCTION create_schema(schema_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to drop a test schema
CREATE OR REPLACE FUNCTION drop_schema(schema_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to execute arbitrary SQL (for testing only)
-- This should be restricted to test environments
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS void AS $$
BEGIN
  -- Only allow in test/development environments
  IF current_setting('app.environment', true) NOT IN ('test', 'development', '') THEN
    RAISE EXCEPTION 'exec_sql is not allowed in production';
  END IF;
  
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users (for testing)
GRANT EXECUTE ON FUNCTION create_schema(text) TO authenticated;
GRANT EXECUTE ON FUNCTION drop_schema(text) TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;

-- Add RLS policies for test helper functions
-- These ensure only service role can use these in production
CREATE POLICY "Test functions restricted to service role in production"
  ON pg_proc
  FOR ALL
  USING (
    CASE 
      WHEN current_setting('app.environment', true) IN ('test', 'development', '') THEN true
      ELSE auth.role() = 'service_role'
    END
  );

-- Create a test helper table for tracking test runs
CREATE TABLE IF NOT EXISTS test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cleaned'))
);

-- Index for cleanup queries
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_test_runs_started_at ON test_runs(started_at);

-- Function to register a test run
CREATE OR REPLACE FUNCTION register_test_run(
  p_test_name TEXT,
  p_schema_name TEXT
) RETURNS UUID AS $$
DECLARE
  v_test_id UUID;
BEGIN
  INSERT INTO test_runs (test_name, schema_name, status)
  VALUES (p_test_name, p_schema_name, 'running')
  RETURNING id INTO v_test_id;
  
  RETURN v_test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark test as completed
CREATE OR REPLACE FUNCTION complete_test_run(
  p_test_id UUID,
  p_status TEXT DEFAULT 'completed'
) RETURNS void AS $$
BEGIN
  UPDATE test_runs
  SET 
    completed_at = NOW(),
    status = p_status
  WHERE id = p_test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old test schemas
CREATE OR REPLACE FUNCTION cleanup_old_test_schemas(
  p_older_than INTERVAL DEFAULT '1 hour'
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_schema TEXT;
BEGIN
  -- Find and clean up old test schemas
  FOR v_schema IN
    SELECT schema_name
    FROM test_runs
    WHERE 
      status IN ('completed', 'failed')
      AND completed_at < NOW() - p_older_than
  LOOP
    PERFORM drop_schema(v_schema);
    
    UPDATE test_runs
    SET status = 'cleaned'
    WHERE schema_name = v_schema;
    
    v_count := v_count + 1;
  END LOOP;
  
  -- Also clean up any orphaned test schemas
  FOR v_schema IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE 
      schema_name LIKE 'test_%'
      AND schema_name NOT IN (
        SELECT DISTINCT schema_name 
        FROM test_runs 
        WHERE status IN ('running', 'completed')
      )
  LOOP
    PERFORM drop_schema(v_schema);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON test_runs TO authenticated;
GRANT EXECUTE ON FUNCTION register_test_run(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_test_run(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_test_schemas(INTERVAL) TO authenticated;