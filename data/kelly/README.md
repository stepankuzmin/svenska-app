# Swedish Kelly frequency data

Derived from [Kelly](https://spraakbanken.gu.se/en/resources/kelly), by Elena Volodina and Sofie Johansson Kokkinakis, University of Gothenburg. CC BY 4.0.

Source: https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/kelly/kelly.xml, downloaded 2026-11-01.
Source SHA-256: `e1fc52d0879956f396916997f130ec64d1d18bca23136effbfd369168e712282`.

`frequencies.json` keeps positive corpus counts by normalized citation form and Lexin word type. The importer combines counts when Kelly types map to the same Lexin type. Noun articles distinguish `en val` from `ett val`. Manually added words without corpus counts stay unranked.

To regenerate:

1. Download the source.

   ```sh
   curl -fsSL https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/kelly/kelly.xml -o /tmp/svenska-kelly.xml
   ```

2. Import its frequency counts.

   ```sh
   npx tsx scripts/import-kelly.ts /tmp/svenska-kelly.xml
   ```
