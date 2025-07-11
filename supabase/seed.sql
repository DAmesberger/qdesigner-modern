-- Seed data for development environment

-- Create a test organization
INSERT INTO organizations (id, name, slug, settings) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Test Organization', 'test-org', '{"theme": "blue"}');

-- Create test users (assuming auth.users will be created by Supabase Auth)
-- For development, we'll create a test user in the users table
-- In production, this would be created after auth.users signup

-- Note: In a real dev environment, you'd create auth.users through Supabase Auth
-- For now, we'll just insert into our users table with a fake ID
INSERT INTO users (id, organization_id, email, full_name, role) VALUES
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin@test.com', 'Test Admin', 'admin'),
    ('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'designer@test.com', 'Test Designer', 'designer');

-- Create a sample questionnaire
INSERT INTO questionnaires (id, organization_id, created_by, name, description, status) VALUES
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', 'Sample Questionnaire', 'A sample questionnaire for testing', 'draft');

-- Create sample pages
INSERT INTO pages (id, questionnaire_id, order_position, title) VALUES
    ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 'Welcome Page'),
    ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 2, 'Questions Page');

-- Create sample questions
INSERT INTO questions (id, questionnaire_id, page_id, order_position, type, question_text, settings) VALUES
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 1, 'text', 'Welcome to our questionnaire!', '{"isInstruction": true}'),
    ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 1, 'choice', 'How satisfied are you with our service?', '{"options": ["Very satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very dissatisfied"]}');

-- Create sample variables
INSERT INTO variables (id, questionnaire_id, name, type, initial_value) VALUES
    ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'totalScore', 'number', '0'),
    ('88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', 'startTime', 'timestamp', 'null');