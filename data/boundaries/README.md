# Official boundary files

Put the province and health-zone boundary files here (shapefile with its `.shx`, `.dbf`, `.prj` and `.cpg`, a `.zip` of them, or GeoJSON), then run:

```bash
node tools/import_boundaries.js --zones data/boundaries/<zones file> --provinces data/boundaries/<provinces file>
```

Add a line below saying where each file came from (organisation, version, date) so the map's source can be cited.

| File | Source | Version / date |
|---|---|---|
| `DRC_admin_boundaries_ADM1_ADM2_ADM3.gpkg` | Supplied by the project; publisher to be recorded | Valid from 2019-09-11 (field `VALID_ON`) |

See `docs/11_backend_and_deployment.md` §11.9 for details.

Spelling: the supplied list's "Banzow Moke" is "Banjow Moke" (CD330201, Maï-Ndombe) in this file. The project confirmed on 26 November 2026 that they are the same health zone, so the import uses `--alias "Banjow Moke=Banzow Moke"`.
