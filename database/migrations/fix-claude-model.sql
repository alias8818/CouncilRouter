-- Fix Claude model name from claude-3-5-sonnet-20241022 to claude-3-opus-20240229
-- This model returned 404 from Anthropic API

UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,1,model}', '"claude-3-opus-20240229"')
WHERE preset_name = 'balanced-council';

UPDATE configurations 
SET config_data = jsonb_set(config_data, '{members,1,model}', '"claude-3-opus-20240229"')
WHERE config_type = 'council' AND active = true;

