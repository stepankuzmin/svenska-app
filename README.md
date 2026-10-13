# Svenska.app

An offline Swedish-Russian dictionary in the browser. Type a Swedish or Russian word and see every sense of the headword with its forms, transcription, and Lexin examples. After one online visit the whole dictionary stays on the device.

Live at <https://svenska-app.stepan-kuzmin.workers.dev/>.

- **Device sync.** Pair devices once through a QR code or link. The local lookup library persists in IndexedDB; a Cloudflare Durable Object stores the shared copy. Offline openings and removals sync after reconnecting.
- **Offline.** 8.9 MB of JSON, cached on the first visit.
- **Bidirectional.** 19,265 Swedish headwords and 15,053 Russian index entries.
- **Inflected forms.** Searching `framgick` opens `framgå`.
- **Source.** Lexin Swedish-Russian edition (2010-07-07), CC BY 4.0.

## Getting started

Requires Node 22.

```sh
git clone git@github.com:stepankuzmin/svenska-app.git
cd svenska-app
npm install
npm run dev
```

## License

Code: MIT. Dictionary data: Lexin, Institutet för språk och folkminnen, CC BY 4.0.

## Device sync

Open **Sync devices** to enable sync, then **Connect another device**. Scan the QR code or open its link on the other device and choose **Connect this device**. An invitation works once and expires after ten minutes. Existing local words join the shared library without reviving words removed elsewhere. Opening a word after observing its removal brings it back.

Keep a recovery code somewhere safe if you want to recover after losing every connected browser session. Anyone with that code can reconnect the library. Generating a new recovery code invalidates the old one. Each connected device can disconnect other devices. Disconnecting preserves a local copy of its words.

Card additions, removals, and ordering sync. Search text and the extended card stay on each device. A suspended app catches up when reopened. Browser storage is subject to quota and user clearing; failed local writes are reported by the sync control.

## Local Worker development

```sh
npm run build
npm run worker:dev
```

The built app and its SQLite-backed sync service run together at `http://127.0.0.1:4173`. Local service data is kept under `.wrangler/local`; it does not use production bindings. For frontend hot reload, also run `npm run dev` in another terminal; Vite proxies `/api` and WebSockets to the local Worker.

`npm run worker:types` generates the runtime and binding declarations from `wrangler.jsonc`. Builds and typechecks run it automatically. `npm run worker:check` validates deployment packaging without publishing.

The browser tests run the built application against local Wrangler. CI deploys each eligible pull request to a separate `svenska-app-pr-N` Worker, giving it a separate Durable Object namespace. These preview URLs are public, as the earlier version previews were. Production keeps the `svenska-app` Worker. Preview Workers retain their data until removed through Cloudflare.

See [the sync design](docs/lookup-library-sync.md) for protocol and recovery behaviour.
