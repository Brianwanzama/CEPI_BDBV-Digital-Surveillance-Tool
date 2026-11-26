# Official boundary files

Put the province and health-zone boundary files here (shapefile with its `.shx`, `.dbf`, `.prj` and `.cpg`, a `.zip` of them, or GeoJSON), then run:

```bash
node tools/import_boundaries.js --zones data/boundaries/<zones file> --provinces data/boundaries/<provinces file>
```

Add a line below saying where each file came from (organisation, version, date) so the map's source can be cited.

| File | Source | Version / date |
|---|---|---|
| `DRC_admin_boundaries_ADM1_ADM2_ADM3.gpkg` | OCHA, Humanitarian Data Exchange (HDX): *Democratic Republic of the Congo - Subnational Administrative Boundaries* (COD-AB), https://data.humdata.org/dataset/cod-ab-cod; source credited on HDX: Référentiel Géographique Commun (RGC) | Valid from 2019-09-11 (field `VALID_ON`) |

See `docs/11_backend_and_deployment.md` §11.9 for details.

Spelling: the supplied list's "Banzow Moke" is "Banjow Moke" (CD330201, Maï-Ndombe) in this file. The project confirmed on 26 November 2026 that they are the same health zone, so the import uses `--alias "Banjow Moke=Banzow Moke"`.

Licence: check the terms shown on the HDX dataset page before redistributing the file outside the project; the page could not be opened from the build environment.
