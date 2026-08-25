-- Atomic replace for the homepage banner gallery. The admin settings form
-- previously did a separate delete() then insert() from the client, which
-- isn't atomic: a failure (or dropped connection) between the two calls
-- could leave the gallery empty until the next successful save. Wrapping
-- both statements in a single plpgsql function makes Postgres run them in
-- one implicit transaction — either the whole replacement lands, or
-- nothing changes.
--
-- security invoker (the default) is intentional: this must keep respecting
-- the caller's own RLS, exactly like the delete()/insert() calls it
-- replaces — a non-admin authenticated user calling this still gets
-- blocked by the existing site_banner_images_admin_all policy.

create or replace function public.replace_site_banner_images(image_urls text[])
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.site_banner_images where true;

  if array_length(image_urls, 1) > 0 then
    insert into public.site_banner_images (image_url, sort_order)
    select url, (ord - 1)::int
    from unnest(image_urls) with ordinality as t(url, ord);
  end if;
end;
$$;

grant execute on function public.replace_site_banner_images(text[]) to authenticated;
