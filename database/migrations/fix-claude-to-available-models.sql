-- Update Claude models to ones actually available to this API key
-- Available models from API: 
--   claude-opus-4-5-20251101, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001
--   claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514
--   claude-3-5-haiku-20241022, claude-3-haiku-20240307

-- Update balanced-council to use Claude Sonnet 4.5
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,1,model}', '"claude-sonnet-4-5-20250929"')
WHERE preset_name = 'balanced-council';

-- Update research-council to use Claude Opus 4.5 (flagship)
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,1,model}', '"claude-opus-4-5-20251101"')
WHERE preset_name = 'research-council';

-- Update coding-council to use Claude Sonnet 4.5
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,0,model}', '"claude-sonnet-4-5-20250929"')
WHERE preset_name = 'coding-council';

-- Update fast-council to use Claude Haiku 4.5
UPDATE council_presets 
SET config_data = jsonb_set(config_data, '{council,members,1,model}', '"claude-haiku-4-5-20251001"')
WHERE preset_name = 'fast-council';

-- Update active council configuration
UPDATE configurations 
SET config_data = jsonb_set(config_data, '{members,1,model}', '"claude-sonnet-4-5-20250929"')
WHERE config_type = 'council' AND active = true;

-- Verify updates
SELECT preset_name, 
       config_data->'council'->'members'->0->>'model' as member_0_model,
       config_data->'council'->'members'->1->>'model' as member_1_model
FROM council_presets;
