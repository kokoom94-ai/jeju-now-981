# LITTLE PARK — village 2.1.0

## Delivered UI

The static aerial-image dashboard has been replaced by an original, interactive 2.5D diorama. It projects local 3D coordinates onto Canvas 2D; it is not a surveyed GIS map or a photogrammetric digital twin. No external rendering library, image CDN, font CDN, Ragnarok sprites, or other game assets are required.

Implemented: procedural main building and roof; indoor room cutaway; entry-side car park and cars; downhill-inspired winding race path; separate return path; landscape, benches and trees; decorative people and moving karts; whole-park/indoor/race/parking camera presets; drag and button rotation, zoom, pan, touch pinch, keyboard controls; thirteen selectable zone labels and a filtered zone list; heat and animation toggles; responsive layout; source-mode and stale-connection labels; three-hour model outlook.

## Spatial accuracy

The overall adjacency of parking, entrance/main indoor building, race departure, slope-side course area and return is a stylized interpretation of public park imagery. References: https://www.981park.com/SHUTTLE (official location map) and https://www.981park.com/venue (space guide), with the official Visit Jeju facility record https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_200000000008633.

Building dimensions, indoor room positions/floors, cadastral boundaries and course centerlines have not been verified. The three course labels indicate logical zones on a simplified continuous race illustration, not a survey of three real courses. Indoor attractions are kept within the main indoor building, not moved to invented standalone village buildings. Local model coordinates have no metre or latitude/longitude claim. The view intentionally does not show an unverified north arrow.

## Data limits

This release does NOT connect SKT, modify credentials or claim 80–90% accuracy. It consumes the existing live, stream and forecast endpoints. In estimated mode it says simulation, and the resident/tourist values are labelled assumptions. Characters and parked cars are illustrative, not live detections. Parking-zone headcounts are not vehicle counts or available parking bays. Forecasts are unvalidated time-pattern illustrations, not reliable arrival advice. Without a response the UI leaves counts unknown. A lost connection is flagged; local UI toggles do not reset the feed-receipt timestamp.

The existing server and JTO connection adapters are left unchanged. See JTO_CONNECTION_STATUS.md for the separate data-integration limitation.

## Verification performed before publication

Local Chromium, with controlled mock crowd/forecast responses, passed 20 checks with no JavaScript runtime errors: scene rendering; 13 zones; simulation badge; total rendering; seven forecast bars; rotation; zoom; indoor camera and roof; facility selection; roof closing; outdoor filtering; parking disclaimer; heat/motion controls; reset; keyboard; information dialog; 390px mobile layout without horizontal overflow; mobile rendering; missing-data behavior; no runtime errors. These are UI tests, not measurements of real crowd accuracy or a production end-to-end SKT test. The tests ran by loading the document and assets directly into Chromium; local HTTP navigation was restricted in that environment.

## Assets

- index.html — new primary page; app-version village-2.1.0
- assets/village.css — responsive theme
- assets/village.js — procedural renderer, interactions and existing API client

No new runtime dependency or Render configuration is required. The old aerial PNG remains in the repository for historical/reference use but is no longer loaded by the main screen. The existing Node service serves the new assets.
