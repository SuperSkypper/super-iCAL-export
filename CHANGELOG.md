# Changelog - v0.0.3

## Fixes
- Restored the settings layout that version 0.0.2 broke on Obsidian 1.13.0 and later. The declarative settings added in 0.0.2 rendered the calendar and general sections inside a single settings row, which squeezed the fields into narrow columns and wrapped every label. The tab renders its sections the same way on every Obsidian version again.

# Changelog - v0.0.2

## Technical updates
- Added `getSettingDefinitions()` to the settings tab so the settings appear in the Obsidian 1.13+ settings search.
- Kept `display()` as the fallback for older Obsidian versions, and shared the row builders between both paths so the UI stays identical everywhere and `minAppVersion` remains `1.4.10`.

# Changelog - v0.0.1

## New features & improvements
- First public release of Super iCAL Export.
- Create multiple calendar tabs, each exporting a separate `.ics` file with its own date property, output folder, file name and update interval.
- Autocomplete for frontmatter date properties and for vault folders.
- Export manually with **Update now**, or schedule automatic updates per calendar.
- Stable event identity through `iCAL-Event-ID` in note frontmatter, so repeated exports update the same event instead of creating duplicates.
- Automatic de-duplication when two notes share the same `iCAL-Event-ID`: the older note keeps it and the newer one receives a fresh ID.
- Option to hide `iCAL-Event-ID` from Obsidian's properties UI.
- `obsidian://open` links so calendar entries open the source note.
- Export progress shown in the status bar.
- Date-only values become all-day events; date/time values become one-hour timed events.
