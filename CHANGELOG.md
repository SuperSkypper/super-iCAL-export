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
- Bundled `super-iCAL-export.zip` for manual installation into `.obsidian/plugins/super-ical-export/`.
