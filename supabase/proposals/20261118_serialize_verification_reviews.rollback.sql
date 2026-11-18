-- Restore the recorded pre-hardening definition only after comparing it
-- with the definition backed up immediately before the approved deployment.
-- This restores function code and its original race. It does not undo decisions.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.review_verification(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected verification RPC is missing. Verify the target database.';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.review_verification(p_submission_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); s record; note text := nullif(btrim(p_note), '');
begin
  if not (select public.is_admin()) then raise exception 'Admins only.'; end if;
  select * into s from public.verification_submissions where id = p_submission_id;
  if not found then raise exception 'Submission not found.'; end if;
  if s.status <> 'pending' then raise exception 'This submission has already been reviewed.'; end if;
  if p_action = 'approve' then
    update public.verification_submissions set status = 'approved', admin_note = note, reviewed_by = uid, reviewed_at = now() where id = s.id;
    update public.profiles set verified_kind = s.kind, verified_at = now() where id = s.user_id;
  elsif p_action = 'reject' then
    if note is null then raise exception 'Please give a reason for rejecting.'; end if;
    update public.verification_submissions set status = 'rejected', admin_note = note, reviewed_by = uid, reviewed_at = now() where id = s.id;
  else
    raise exception 'Unknown action.';
  end if;
end;
$function$;

COMMIT;
