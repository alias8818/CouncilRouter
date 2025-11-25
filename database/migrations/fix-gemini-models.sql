-- Fix Gemini models - gemini-1.5-pro returns 404 on v1beta API
-- Update to gemini-2.0-flash which is available

-- Update research-council
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,2,model}', '"gemini-2.0-flash"')
WHERE preset_name = 'research-council';

-- Update coding-council
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,2,model}', '"gemini-2.0-flash"')
WHERE preset_name = 'coding-council';

-- Verify
SELECT preset_name, config_data->'council'->'members'->2->>'model' as gemini_model 
FROM council_presets 
WHERE preset_name IN ('research-council', 'coding-council', 'balanced-council');

