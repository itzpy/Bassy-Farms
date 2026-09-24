alter table animals add column deleted_at timestamptz;
alter table plots add column deleted_at timestamptz;
alter table batches add column deleted_at timestamptz;
alter table events add column deleted_at timestamptz;
