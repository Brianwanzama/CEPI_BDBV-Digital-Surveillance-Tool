# Official boundary files

Put the province and health-zone boundary files here (shapefile with its `.shx`, `.dbf`, `.prj` and `.cpg`, a `.zip` of them, or GeoJSON), then run:

```bash
node tools/import_boundaries.js --zones data/boundaries/<zones file> --provinces data/boundaries/<provinces file>
```

Add a line below saying where each file came from (organisation, version, date) so the map's source can be cited.

| File | Source | Version / date |
|---|---|---|
| | | |

See `docs/11_backend_and_deployment.md` §11.9 for details.
