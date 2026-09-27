# Epic 5 Device Checklist

Epic 5 retro action item 2 (`epic-5-retro-item-2-device-checks`). This merges the seven stories' manual and device-only checks into one pass through the app, organized by screen. Tick each box. For anything wrong, write what you saw on the line under it. The source column shows which spec asked for the check.

**Setup:** a physical iPhone running a dev build against Supabase, with migrations 0012 and 0013 applied. Have a few Fits, plans spread over this week, next week and last month, and at least one Fit worn on 3+ days with photos. Do sections A–E once in light mode, then repeat the visual checks (marked 🌓) in dark mode.

## A. Planner: week view

| ✓ | Check | Spec |
|---|---|---|
| [ ] | 🌓 The week rows match the P4Planner board. A planned day shows the Fit's collage, and an empty day reads "Nothing planned". | 5.1 |
| [ ] | Plan a day, replace it with another Fit, then remove it. Each change shows at once and survives leaving and returning to the tab. | 5.1 |
| [ ] | Page to next week and back. Plans stay on the right days. | 5.1 |
| [ ] | Delete a planned Fit from Fit detail and come back: its day reads empty. | 5.1 |
| [ ] | A worn day with a photo shows the photo in its row. | 5.4 |

## B. Planner: month view

| ✓ | Check | Spec |
|---|---|---|
| [ ] | 🌓 Switch to Month. It matches P4Month/P4MonthDark, and briefly P4MonthLoading on first load. | 5.3 |
| [ ] | Page several months back and forward. Plans show on the right days. | 5.3 |
| [ ] | Plan, replace and remove a day from the grid. Switch to Week and open Home: both reflect it. | 5.3 |
| [ ] | Worn days carry the check badge, told apart by fill and not color. | 5.3 |
| [ ] | Open the same month twice. Supabase logs show no second download of the photo tiles. | 5.4 |

## C. Planner: day sheet

| ✓ | Check | Spec |
|---|---|---|
| [ ] | 🌓 A planned day's sheet leads with the Fit (collage, name, status), then "View Fit", then the "Change Fit" grid, in the P5 sheet's style. | 5.6 |
| [ ] | An empty day's sheet opens straight on the grid. | 5.6 |
| [ ] | Past and future days show no Mark worn. | 5.6 |
| [ ] | Today: tap Mark worn. Home, the streak and the month tile all update. Tap Worn today to undo, once without a photo and once with one (a confirmation shows first). | 5.6 |
| [ ] | Is "Worn today" (solid, with a check) clearly different from "Mark worn" (outlined)? | 6811ac9 |
| [ ] | View Fit opens Fit detail, and back returns to the sheet. | 5.6 |
| [ ] | Photo on a worn day: add from the camera, add from the library, replace, remove. | 5.4 |
| [ ] | Deny camera or photo permission. You get a clear message and nothing breaks. | 5.4 |
| [ ] | Turn on airplane mode mid-save. You get the "No connection" notice and nothing half-saved. | 5.4 |
| [ ] | In Supabase Storage, the uploaded file is 1080px WebP with no EXIF (no location). | 5.4 |
| [ ] | Largest Dynamic Type on an SE-width screen: the header buttons wrap rather than clip. | 5.6 |

## D. Home

| ✓ | Check | Spec |
|---|---|---|
| [ ] | 🌓 Plan today in the Planner, then open Home. It matches P4Home, showing the Fit's cover, name and the streak line. | 5.2 |
| [ ] | Mark worn, then undo. The streak and the Planner's "Worn" follow each time. | 5.2 |
| [ ] | With nothing planned, Home matches P4HomeEmpty, and "Plan today's Fit" opens today's sheet. | 5.2 |
| [ ] | 🌓 Add a photo from Home. The tile leads with the photo, with two round markers, matching the P6 artboards. | 5.7 |
| [ ] | Swipe to the collage and back; the markers follow. Tapping the photo opens today's sheet, and tapping the collage opens Fit detail. | 5.7 |
| [ ] | Leave Home and come back. It opens on the photo again. | 5.7 |
| [ ] | The photo is sharp on the big tile, not a blurry thumbnail. | 5.7 |
| [ ] | Undo a wear that has a photo. The tile goes back to the collage alone, with no markers. | 5.7 |
| [ ] | Largest Dynamic Type on an SE-width screen: the tile and markers keep their size, and nothing clips. | 5.7 |
| [ ] | VoiceOver: each page of the tile reads its label and "1 of 2" / "2 of 2". | 5.7 |

## E. Fit detail: Worn strip

| ✓ | Check | Spec |
|---|---|---|
| [ ] | 🌓 A Fit with several photos shows the "Worn" strip, newest first, matching the P7 artboards. | 5.5 |
| [ ] | Scroll the strip and tap an old photo. The Planner opens on that day's sheet. | 5.5 |
| [ ] | Mark the Fit worn from Fit detail. The dashed Add tile appears, and adding a photo turns it into the photo. Then undo: today's tile drops. | 5.5 |
| [ ] | Remove a photo in the Planner and come back. The strip no longer shows it. | 5.5 |
| [ ] | A Fit that was never worn shows no Worn section (a brief placeholder flash while loading is expected). | 5.5 |
| [ ] | Largest Dynamic Type: the tiles keep their size, and the date captions don't clip (they may wrap). | 5.5 |
| [ ] | VoiceOver: a photo reads "Your photo from Saturday, Sep 19. Open that day in the Planner", Add reads "Add a photo of what you wore today", and saving reads "Saving your photo". | 5.5 |

## F. Open questions from the retro

| ✓ | Check | Retro finding |
|---|---|---|
| [ ] | On a past day that was worn with a photo, plan a *different* Fit. Can you still see and manage that wear's photo in the Planner? | 5 |
| [ ] | Leave the Planner and Home open for more than an hour, then come back. Do the photos still load, or do tiles stay blank? | 8 |
| [ ] | **Known bug (action 1):** leave the app on the Planner overnight, then reopen it the next morning. Today's sheet may still say "Worn today" for yesterday's Fit. Note what you see; the fix will re-test this. | 1 |

## Results

Date run: ______  Device / iOS: ______

Issues found:
-
