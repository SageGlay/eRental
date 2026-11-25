-- Manual inverse for 20261119184647. Check the pre-deploy backup before execution.
-- Restores the earlier race; close review access until the hardened code is redeployed.
-- Already committed decisions and profile badges are not reversed by this DDL.
-- One statement keeps checks and replacement atomic in both psql and the CLI.
DO $migration$
DECLARE
  review_rpc regprocedure := to_regprocedure('public.review_verification(uuid,text,text)');
  expected_acl aclitem[] := ARRAY['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']::aclitem[];
BEGIN
  IF review_rpc IS NULL THEN
    RAISE EXCEPTION 'Expected verification RPC is missing. Verify the target database.';
  END IF;
  -- CREATE OR REPLACE preserves ownership and grants. Refuse to inherit drift.
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_proc
    WHERE oid = review_rpc AND proowner = 'postgres'::regrole
      AND proacl @> expected_acl AND proacl <@ expected_acl
  ) OR has_function_privilege('anon', review_rpc, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', review_rpc, 'EXECUTE')
    OR NOT has_function_privilege('service_role', review_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Verification RPC privileges differ from the recorded contract.';
  END IF;
  IF encode(sha256(convert_to(pg_get_functiondef(review_rpc), 'UTF8')), 'hex')
     <> 'cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7' THEN
    RAISE EXCEPTION 'Verification RPC definition differs from the expected preimage. Stop and compare the catalog.';
  END IF;

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

  IF encode(sha256(convert_to(pg_get_functiondef(review_rpc), 'UTF8')), 'hex')
     <> '431f69852d5fac7ebf518476792fb8f415775929155ca8e021e4899eb11f1023' THEN
    RAISE EXCEPTION 'Verification RPC replacement failed the expected postimage check.';
  END IF;
END;
$migration$;
