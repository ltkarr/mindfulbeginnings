-- Forced PIN change. The portal already refuses a new PIN that matches the old
-- one. This is the check that counts: instructor_change_pin is the only way an
-- instructor can replace a PIN, and submitting the current PIN used to clear
-- pin_change_required without changing it.
--
-- Setting the flag itself is data, not schema:
--   update public.instructors
--      set pin_change_required = true
--    where coalesce(is_active, true);

CREATE OR REPLACE FUNCTION public.instructor_change_pin(p_pin text, p_new_pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_instructor_id text;
begin
  select id into v_instructor_id from instructors where pin = p_pin limit 1;
  if v_instructor_id is null then return 'auth'; end if;

  if p_new_pin !~ '^[0-9]{6}$' then return 'invalid'; end if;

  -- The portal asks for this too. Rejecting it here is what stops someone from
  -- clearing pin_change_required by submitting the PIN they already have.
  if p_new_pin = p_pin then return 'same'; end if;

  if p_new_pin ~ '^(.)\1{5}$' then return 'invalid'; end if;
  if position(p_new_pin in '0123456789') > 0
     or position(p_new_pin in '9876543210') > 0 then return 'invalid'; end if;

  if exists (select 1 from instructors
              where pin = p_new_pin and id <> v_instructor_id) then
    return 'taken';
  end if;

  update instructors
     set pin = p_new_pin,
         pin_change_required = false
   where id = v_instructor_id;

  return 'ok';
end;
$function$;

GRANT EXECUTE ON FUNCTION public.instructor_change_pin(text, text) TO anon, authenticated, service_role;
