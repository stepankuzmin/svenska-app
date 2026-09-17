# Svenska.app

An offline Swedish-Russian dictionary in the browser. Type a Swedish or Russian word and see every sense of the headword with its forms, transcription, and Lexin examples. After one online visit the whole dictionary stays on the device.

Live at <https://svenska-app.stepan-kuzmin.workers.dev/>.

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
