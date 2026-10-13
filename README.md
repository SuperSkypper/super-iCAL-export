# Super iCAL Export

[![Release](https://img.shields.io/github/v/release/SuperSkypper/super-ical-export)](https://github.com/SuperSkypper/super-iCAL-export/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Min App Version](https://img.shields.io/badge/obsidian-1.4.10%2B-7c3aed)](https://obsidian.md)

Super iCAL Export generates one or more `.ics` calendar files from frontmatter date properties in your vault.

It is designed for workflows where notes represent media releases, shows, deadlines, or events, and each selected date property should become an iCalendar feed that can be published elsewhere — for example a GitHub Gist — and subscribed to from Google Calendar, Apple Calendar, or Outlook.

> This project is a fork of the [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin),
> which provided the project scaffolding, build tooling and CI. All features listed below
> are specific to Super iCAL Export.

## Features

- Create multiple calendar tabs, each exporting a separate `.ics` file.
- Pick a frontmatter date property with autocomplete.
- Pick an output folder with folder autocomplete.
- Choose the output file name per calendar.
- Export manually with **Update now**.
- Optionally schedule automatic updates per calendar.
- Preserve stable event identity with `iCAL-Event-ID` in note frontmatter.
- Optionally hide `iCAL-Event-ID` from Obsidian's properties UI.
- Add `obsidian://open` links so calendar entries jump straight to the note.
- Show update progress in the status bar.
- Works on desktop and mobile.

## Installation

### Manual

1. Download `manifest.json`, `main.js` and `styles.css` from the
   [latest release](https://github.com/SuperSkypper/super-iCAL-export/releases/latest).
2. Create the folder `<Vault>/.obsidian/plugins/super-ical-export/`.
3. Copy the three files into that folder.
4. Restart Obsidian and enable **Super iCAL Export** under
   *Settings → Community plugins*.

Requires Obsidian **1.4.10** or later.

## How it works

Each calendar tab has its own settings:

- **Calendar name**
- **Choose date property**
- **Choose folder location**
- **Choose file name**
- **Update interval**
- **Update now**

When a calendar updates, Super iCAL Export scans the Markdown notes in your vault. Notes with a valid value in the selected date property become calendar events.

If a note does not have an `iCAL-Event-ID`, the plugin creates one:

```yaml
iCAL-Event-ID: 7ffnbq06j8g9bt78lr0jgidiq8
```

That ID is used as the event `UID`, so repeated exports update the same event instead of creating duplicates.

If two exported notes share the same `iCAL-Event-ID`, the older note keeps it and the newer note receives a fresh one on the next update.

## Date values

Date-only values become all-day events:

```yaml
Release Date: 2026-05-31
```

Date/time values become timed events with a default duration of one hour:

```yaml
Release Date: 2026-05-31T14:00:00
```

Empty or invalid dates are skipped. An existing `iCAL-Event-ID` is kept so the same event identity can be reused if the date is filled in later.

## Publishing the feed

One simple publishing flow is:

1. Generate the `.ics` file with Super iCAL Export.
2. Put the generated file in a public GitHub Gist.
3. Copy the raw Gist URL.
4. In your calendar app, add a calendar **From URL**.

For stable syncing, keep the same Gist file and raw URL, and replace the file contents whenever the plugin regenerates the `.ics`.

Any static host works the same way, for example Cloudflare Pages, Netlify, or a raw GitHub URL.

## Development

```bash
npm install
npm run build
npm run lint
```

### Manual testing

Copy the release artifacts to:

```text
<Vault>/.obsidian/plugins/super-ical-export/
```

Then reload Obsidian and enable **Super iCAL Export**.

### Releasing

Releases are created automatically when a version tag is pushed. Keep
`versions.json` in sync with the `manifest.json` version, add a
`# Changelog - vX.Y.Z` section to `CHANGELOG.md`, then push the tag:

```bash
git push origin 0.0.1
```

The tag has to match the `manifest.json` version exactly, with no `v` prefix.

## Support

Report issues and feature requests at
[github.com/SuperSkypper/super-iCAL-export/issues](https://github.com/SuperSkypper/super-iCAL-export/issues).

## License

[MIT](LICENSE)