alter table events drop constraint events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in (
    'feeding','vaccination','weight','health_check','breeding','death',
    'planting','harvest','expense','sale','input_application'
  ));
