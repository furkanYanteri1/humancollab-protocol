# Paper

**humancollab: A Verifiable Trust Layer Between Humans, Businesses and AI Agents**
Furkan Yanteri ([ORCID 0009-0009-3004-0883](https://orcid.org/0009-0009-3004-0883)) · Preprint, version 1.0, 27 October 2026

- Zenodo: https://doi.org/10.5281/zenodo.23676343 (concept DOI, always resolves to the latest version; please cite this one)
- This version: 10.5281/zenodo.23676344

## License

The PDF in this folder is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
This is different from the rest of the repository: the specification, examples and monitor are CC0.

## Verify

SHA-256 of `humancollab-whitepaper-v1.0.pdf`:

```
a1263a3af44c56b7be51c6b66d347808550a7bf775f750b35abf8d2b08d1f0f7
```

```sh
shasum -a 256 humancollab-whitepaper-v1.0.pdf      # or: sha256sum
pip install opentimestamps-client
ots verify humancollab-whitepaper-v1.0.pdf.ots     # proves the PDF existed when its hash entered Bitcoin
```

The OpenTimestamps receipt was created on 27 October 2026. Until a Bitcoin block confirms it (usually a few
hours), `ots verify` reports it as pending; `ots upgrade humancollab-whitepaper-v1.0.pdf.ots` then completes it, and
the upgraded receipt is committed here.
