-- Replace the exported November 12 review RPC only after comparing hosted metadata.
-- This migration requires the existing verification schema and its restricted roles.
-- One statement keeps checks and replacement atomic in both psql and the CLI.
DO $migration$
DECLARE
  review_rpc regprocedure := to_regprocedure('public.review_verification(uuid,text,text)');
  expected_acl aclitem[] := ARRAY['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']::aclitem[];
  admin_probe regprocedure := to_regprocedure('public.is_admin()');
  client_role text;
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
     <> '431f69852d5fac7ebf518476792fb8f415775929155ca8e021e4899eb11f1023' THEN
    RAISE EXCEPTION 'Verification RPC definition differs from the expected preimage. Stop and compare the catalog.';
  END IF;

  -- The recorded role probe reads only admin_users for auth.uid().
  IF admin_probe IS NULL OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_proc
    WHERE oid = admin_probe AND proowner = 'postgres'::regrole
      AND proacl @> expected_acl AND proacl <@ expected_acl
      AND encode(sha256(convert_to(pg_get_functiondef(oid), 'UTF8')), 'hex')
          = 'f7e4cb344b922be64505ecee1e1694b0d11eb37440dc18083c0e154e00d83b5d'
  ) OR has_function_privilege('anon', admin_probe, 'EXECUTE')
    OR NOT EXISTS (
      SELECT FROM pg_catalog.pg_class
      WHERE oid = 'public.admin_users'::regclass AND relrowsecurity
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_policy WHERE polrelid = 'public.admin_users'::regclass
    ) THEN
    RAISE EXCEPTION 'Administrator membership contract differs. Inspect role checks and table policies.';
  END IF;

  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(client_role, 'public.admin_users', 'SELECT, INSERT, UPDATE')
       OR has_table_privilege(client_role, 'public.admin_users', 'DELETE, TRUNCATE, TRIGGER') THEN
      RAISE EXCEPTION 'Administrator membership contract differs. Inspect effective grants.';
    END IF;
    IF has_any_column_privilege(client_role, 'public.verification_submissions', 'UPDATE')
       OR has_table_privilege(client_role, 'public.verification_submissions', 'DELETE, TRUNCATE, TRIGGER')
       OR has_column_privilege(client_role, 'public.verification_submissions', 'status', 'INSERT')
       OR has_column_privilege(client_role, 'public.verification_submissions', 'admin_note', 'INSERT')
       OR has_column_privilege(client_role, 'public.verification_submissions', 'reviewed_at', 'INSERT')
       OR has_column_privilege(client_role, 'public.verification_submissions', 'reviewed_by', 'INSERT')
       OR has_column_privilege(client_role, 'public.profiles', 'verified_kind', 'INSERT, UPDATE')
       OR has_column_privilege(client_role, 'public.profiles', 'verified_at', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION 'Protected verification column privileges differ. Inspect effective grants.';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT FROM pg_catalog.pg_class WHERE oid IN (
      'public.profiles'::regclass, 'public.verification_submissions'::regclass
    ) AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Verification table RLS differs from the recorded contract.';
  END IF;
  -- Row-level BEFORE UPDATE, enabled for ordinary writes, without a WHEN
  -- predicate or a column filter that could skip a protected identity edit.
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_clear_verification'
      AND tgfoid = to_regprocedure('public.clear_verification_on_change()')
      AND tgenabled IN ('O','A') AND tgtype = 19 AND tgnargs = 0
      AND tgattr = ''::int2vector AND tgqual IS NULL
      AND encode(sha256(convert_to(pg_get_functiondef(tgfoid), 'UTF8')), 'hex')
          = 'a86cfe88673740267f78ec9ebc31bc48e7e14e6bbf38f32044c55583f4bbf2fa'
  ) THEN
    RAISE EXCEPTION 'Verification profile trigger differs. Inspect badge invalidation before deployment.';
  END IF;

CREATE OR REPLACE FUNCTION public.review_verification(p_submission_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor uuid := (SELECT auth.uid());
  request public.verification_submissions%ROWTYPE;
  applicant public.profiles%ROWTYPE;
  decision text;
  note text := nullif(btrim(p_note), '');
  -- Unicode White_Space plus BOM, including nonbreaking spaces in pasted names.
  whitespace CONSTANT text := U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  IF actor IS NULL OR (SELECT public.is_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  -- A waiting reviewer reads the committed version before checking status.
  SELECT * INTO request FROM public.verification_submissions
    WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.';
  END IF;
  IF request.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This submission has already been reviewed.';
  END IF;

  IF p_action = 'approve' THEN
    -- Serialize identity edits; remain compatible with reviewed_by FK key-share locks.
    SELECT * INTO applicant FROM public.profiles
      WHERE id = request.user_id FOR NO KEY UPDATE;
    IF NOT FOUND OR (
      (request.kind = 'identity' AND applicant.account_type = 'individual') OR
      (request.kind = 'business' AND applicant.account_type = 'business')
    ) IS NOT TRUE THEN
      RAISE EXCEPTION 'The account type changed. Reject this request and ask for a new submission.';
    END IF;
    IF request.kind = 'business' AND nullif(btrim(applicant.business_name, whitespace), '') IS NULL THEN
      RAISE EXCEPTION 'The applicant must add their business name before approval.';
    END IF;
    decision := 'approved';
  ELSIF p_action = 'reject' THEN
    IF nullif(btrim(note, whitespace), '') IS NULL THEN
      RAISE EXCEPTION 'Please give a reason for rejecting.';
    END IF;
    decision := 'rejected';
  ELSE
    RAISE EXCEPTION 'Unknown action.';
  END IF;

  UPDATE public.verification_submissions
    SET status = decision, admin_note = note, reviewed_by = actor, reviewed_at = now()
    WHERE id = request.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The review could not be recorded.';
  END IF;
  IF decision = 'approved' THEN
    UPDATE public.profiles SET verified_kind = request.kind, verified_at = now()
      WHERE id = request.user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The profile could not be verified.';
    END IF;
  END IF;
END;
$function$;

  IF encode(sha256(convert_to(pg_get_functiondef(review_rpc), 'UTF8')), 'hex')
     <> 'cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7' THEN
    RAISE EXCEPTION 'Verification RPC replacement failed the expected postimage check.';
  END IF;
END;
$migration$;
