-- ============================================================================
--  Mindful Beginnings — GSFA-261112 end time
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Session GSFA-261112 (Girl Scouts First Aid Badge Workshop,
--    Thursday, November 12, 2026) was stored as 7:00 PM to 8:30 AM.
--    The form submitted start 19:00 and end 08:30. 8:30 PM is 20:30.
--    The host's arrival note says the meeting is 90 minutes and the room
--    is booked until 9pm, so the end is 8:30 PM.
--
--    This sets the session time to "7:00 to 8:30 PM", the request's end
--    input to 20:30, and the stored confirmation draft's time and price
--    lines. It does not send email.
--
--  SAFE TO RE-RUN: yes. Each update matches only the old value.
-- ============================================================================

update public.sessions
set time = '7:00 to 8:30 PM'
where code = 'GSFA-261112'
  and id = '9ab437fd-5e14-404a-8f15-ceca2871ec6f'
  and time = '7:00 PM to 8:30 AM';

update public.class_requests
set
  payload = jsonb_set(payload, '{days,0,end}', '"20:30"'::jsonb, false),
  draft_body = replace(
    replace(
      draft_body,
      'Time: 7:00 PM to 8:30 AM',
      'Time: 7:00 to 8:30 PM'
    ),
    'Payment: your organization is covering the full cost ($45 per participant). Participants register on this private link at no charge, and I will invoice the organization after the course.',
    E'Price: $45 per participant. Estimated total for 11 participants: $495, final invoice based on attendance\nPayment: your organization is covering the full cost. Participants register on this private link at no charge, and I will invoice the organization after the course.'
  )
where session_code = 'GSFA-261112'
  and id = '8a32e9a1-182a-4b58-abad-16ab5b917f60'
  and payload->'days'->0->>'end' = '08:30';
