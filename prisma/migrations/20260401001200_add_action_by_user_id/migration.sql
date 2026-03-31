-- Add action_by_user_id to track which user initiated a state change
ALTER TABLE t_entity_state_history
ADD COLUMN action_by_user_id UUID;
