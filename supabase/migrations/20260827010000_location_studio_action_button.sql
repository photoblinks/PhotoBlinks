-- Optional call-to-action button shown below "Go to Location" on the public
-- detail page: Book Now / Website (a URL) or Call Now (a phone number).
-- Optional for both locations and studios.

alter table public.locations
  add column action_type text check (action_type in ('book_now', 'website', 'call_now')),
  add column action_value text;

alter table public.studios
  add column action_type text check (action_type in ('book_now', 'website', 'call_now')),
  add column action_value text;
