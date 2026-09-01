-- The batches feature (0003_add_batches.sql) started writing events with
-- entity_type = 'batch', but never updated this check constraint from
-- 0001_init.sql to allow it — every batch event has been silently failing
-- to sync to Supabase (pushTable logs the error and leaves the record
-- unsynced forever; nothing surfaces it to the user beyond the unsynced
-- count staying stuck).
alter table events drop constraint events_entity_type_check;
alter table events add constraint events_entity_type_check
  check (entity_type in ('animal', 'plot', 'farm', 'batch'));
