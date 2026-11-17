-- REVIEWABLE MIGRATION PROPOSAL — NOT APPLIED.
-- Source: supabase/contracts/verification.json.
-- Serializes two administrators reviewing the same pending submission.
-- Also rechecks account-type/business-name eligibility under a profile lock.
-- Signature, authorization, actions, notes, profile updates and grants stay unchanged.
-- Kept outside migrations so routine CLI commands do not apply it automatically.
-- Review and test in a designated database before any hosted execution.

CREATE OR REPLACE FUNCTION public.review_verification(p_submission_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); s record; p record; note text := nullif(btrim(p_note), '');
begin
  if not (select public.is_admin()) then raise exception 'Admins only.'; end if;
  select * into s from public.verification_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found.'; end if;
  if s.status <> 'pending' then raise exception 'This submission has already been reviewed.'; end if;
  if p_action = 'approve' then
    -- Serialize with profile edits; their existing trigger clears later changes.
    select account_type, business_name into p from public.profiles where id = s.user_id for update;
    if not found or (s.kind = 'business') <> (p.account_type = 'business') then
      raise exception 'The account type changed. Reject this request and ask for a new submission.';
    end if;
    if s.kind = 'business' and p.business_name is null then
      raise exception 'The applicant must add their business name before approval.';
    end if;
    update public.verification_submissions set status = 'approved', admin_note = note, reviewed_by = uid, reviewed_at = now() where id = s.id;
    update public.profiles set verified_kind = s.kind, verified_at = now() where id = s.user_id;
  elsif p_action = 'reject' then
    if note is null then raise exception 'Please give a reason for rejecting.'; end if;
    update public.verification_submissions set status = 'rejected', admin_note = note, reviewed_by = uid, reviewed_at = now() where id = s.id;
  else
    raise exception 'Unknown action.';
  end if;
end;
$function$
