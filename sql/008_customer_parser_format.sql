-- Phase 5.1 — a customer declares which file format its order uploads use, so a
-- parser is chosen by format (not by hardcoding the customer name). Backfills the
-- existing customers. Idempotent.

alter table customer add column if not exists parser_format text;

update customer set parser_format = 'avon-grid'      where display_name = 'AVON';
update customer set parser_format = 'hgi-forms'      where display_name in ('HGI', 'HLA');
update customer set parser_format = 'elcrest-triplet' where display_name = 'ELCREST';
update customer set parser_format = 'heirs-sheets'   where display_name = 'HEIRS';
