create unique index if not exists line_work_entries_employee_day_unique
on public.line_work_entries(employee_id,work_date);
