-- Fix Claude model to use Haiku which has broader availability
-- Claude 3 Opus returns 404 - likely not available with this API key

-- Update balanced-council preset
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,1,model}', '"claude-3-haiku-20240307"')
WHERE preset_name = 'balanced-council';

-- Update research-council preset  
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,1,model}', '"claude-3-haiku-20240307"')
WHERE preset_name = 'research-council';

-- Update coding-council preset
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,0,model}', '"claude-3-haiku-20240307"')
WHERE preset_name = 'coding-council';

-- Update active council configuration
UPDATE configurations 
SET config_data = jsonb_set(config_data, '{members,1,model}', '"claude-3-haiku-20240307"')
WHERE config_type = 'council' AND active = true;

