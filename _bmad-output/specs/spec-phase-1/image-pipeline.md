# Image pipeline

1. User picks one or more photos from the library, or captures one or more with the camera (see rapid camera mode below).
2. Each photo is resized to a working size (long edge around 1500 px) on device.
3. On-device background removal produces a PNG with transparency.
4. Dominant color is computed from opaque pixels of the cutout.
5. A thumbnail (long edge around 400 px) is generated.
6. The user reviews cutout, category, and color for each item in the batch, and can retake if removal fails, since the physical item is still available.
7. Cutout and thumbnail are uploaded directly to Supabase Storage and the item row is inserted into Postgres. The original photo is discarded at this point; it is never uploaded. There is no local-first save step — a save requires network connectivity (see SPEC.md Open Questions for the failure-handling decision still needed here).

Processing runs off the UI thread where the module allows, and batch items process sequentially with a visible queue, one shared queue and review screen for both library multi-select and rapid camera capture.

### Rapid camera mode

The camera view stays open across shots instead of returning to a review screen after each photo. The user lays out several items and taps the shutter once per item; each capture adds a thumbnail to a filmstrip at the bottom of the viewfinder and the camera stays live for the next shot. Review of category, color, and cutout quality happens once, after the user ends the capture session, using the same queue screen as library multi-select.
