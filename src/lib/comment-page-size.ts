// Number of approved location comments shown per page. Lives in its own
// module (rather than public-data.ts) so client components like
// location-comments.tsx can import the constant without pulling the
// server-only public-data.ts module (and its service-role Supabase client)
// into the browser bundle.
export const LOCATION_COMMENTS_PAGE_SIZE = 10;
