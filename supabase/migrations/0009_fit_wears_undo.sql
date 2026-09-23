-- Story 4.2: Favorite a Fit and Mark It Worn
-- `fit_wears` gets a DELETE policy so a same-day "Wear today" mis-tap can be
-- undone. Story 4.1 deliberately shipped `fit_wears` as insert/select-only
-- ("append-only ... there's no edit/remove-a-wear-entry feature") and
-- explicitly deferred this decision to this story (see `deferred-work.md`).
--
-- Scoped identically to every other `_own` policy in this schema
-- (`fits_update_own`, `fit_items`'s delete policy) -- RLS only ever confines
-- a delete to the caller's own rows. The app itself never lets a user
-- delete anything but *today's* row (see `lib/fits/markFitWorn.ts`); that's
-- a client-side UX guarantee for Story 4.4's streak trustworthiness, not
-- something this policy enforces at the database level.

create policy "fit_wears_delete_own"
  on public.fit_wears
  for delete
  using (user_id = (select auth.uid()));
