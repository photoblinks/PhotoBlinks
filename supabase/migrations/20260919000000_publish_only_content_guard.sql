-- Phase 3 security remediation follow-up: close the publish-only UPDATE gap.
--
-- The existing UPDATE policies let any holder of *.edit OR *.publish update a
-- row. protect_*_publish_status guards is_published for non-publishers, but
-- nothing stopped a publish-only user from changing CONTENT columns (name,
-- description, geo, etc.) through a direct API call. These triggers close
-- that gap: a user without *.edit may change ONLY is_published; any other
-- column change is rejected.
--
-- Column-agnostic by design: instead of enumerating the content columns (which
-- would silently break when a future migration adds one), it compares the whole
-- before/after row as JSON and ignores only is_published (the one column a
-- publisher is allowed to touch) and updated_at (stamped later by the
-- *_set_updated_at trigger, which fires after this one alphabetically).
--
-- Legacy admins and *.edit holders pass immediately (has_permission returns
-- true for is_admin(), and editors have the edit permission), so existing
-- content_manager / operations / admin workflows are unchanged.

create function public.protect_location_content_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.has_permission('locations.edit')
     and (to_jsonb(new) - 'is_published' - 'updated_at') is distinct from
         (to_jsonb(old) - 'is_published' - 'updated_at') then
    raise exception 'You do not have permission to edit locations.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger locations_protect_content_fields
  before update on public.locations
  for each row execute function public.protect_location_content_fields();

create function public.protect_studio_content_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.has_permission('studios.edit')
     and (to_jsonb(new) - 'is_published' - 'updated_at') is distinct from
         (to_jsonb(old) - 'is_published' - 'updated_at') then
    raise exception 'You do not have permission to edit studios.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger studios_protect_content_fields
  before update on public.studios
  for each row execute function public.protect_studio_content_fields();
