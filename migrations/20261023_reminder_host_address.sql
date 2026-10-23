-- Day-before instructor reminders: location_text includes the street address
-- and skips a generic "Host home" label when a street is on file.
-- CREATE OR REPLACE keeps the existing service_role grant. Do not re-grant anon.
-- This does not send email and does not invoke the cron.

create or replace function public.get_tomorrow_reminders()
returns table (
  session_id      text,
  instructor_name text,
  instructor_email text,
  course          text,
  class_date      text,
  class_time      text,
  location_text   text,
  student_count   bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id::text,
         i.name,
         i.email,
         s.course,
         s.date::text,
         s.time,
         case
           when coalesce(s.is_virtual, false) then 'Virtual (Zoom)'
           else trim(both ', ' from concat_ws(', ',
             case
               when btrim(coalesce(s.location, '')) = '' then null
               when lower(regexp_replace(replace(replace(btrim(s.location), '''', ''), '’', ''), '\s+', ' ', 'g'))
                    in ('host home', 'hosts home', 'host house', 'private home', 'private host', 'home host')
                 then null
               when btrim(coalesce(s.host_address, '')) <> ''
                    and lower(btrim(s.location)) = lower(btrim(coalesce(s.city, '')))
                 then null
               else btrim(s.location)
             end,
             nullif(btrim(coalesce(s.host_address, '')), ''),
             nullif(trim(both ' ' from concat_ws(' ',
               nullif(trim(both ' ' from concat_ws(', ',
                 nullif(btrim(coalesce(s.city, '')), ''),
                 nullif(btrim(coalesce(s.state, '')), '')
               )), ''),
               nullif(btrim(coalesce(s.zip, '')), '')
             )), '')
           ))
         end,
         (select count(*)
          from registrations r
          where r.session_id::text = s.id::text
            and r.pay_status not in ('waitlist','cancelled'))
  from sessions s
  join job_data j on j.session_id::text = s.id::text
  join instructors i on i.id::text = j.instructor_id::text
  where s.date::date = (current_date + interval '1 day')::date
    and coalesce(s.is_cancelled, false) = false
    and coalesce(s.is_hold, false) = false
    and i.email is not null
    and btrim(i.email) <> ''
    and not exists (
      select 1 from reminder_log l
      where l.session_id = s.id::text
        and l.sent_at::date = current_date
    );
end;
$$;
