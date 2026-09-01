alter table animals
  add column stage text check (stage in ('starter', 'grower', 'finisher'));
