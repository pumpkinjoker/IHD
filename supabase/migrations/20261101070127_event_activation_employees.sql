-- Employee records are maintained in the private database, not in source code.
alter table public.ihd_employee_directory add column if not exists english_name text;
