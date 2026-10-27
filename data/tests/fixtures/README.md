# Test fixtures

Recorded, byte for byte (`.gitattributes` keeps git from changing line endings):

- `ecb_huf_2026-10-22.csv`, `ecb_huf_2026-10-23.csv`: ECB HUF/EUR reference rate responses, public ECB statistics. Re-record with
  `curl -o ecb_huf_<day>.csv "https://data-api.ecb.europa.eu/service/data/EXR/D.HUF.EUR.SP00.A?startPeriod=<day>&endPeriod=<day>&format=csvdata"`

Never put real bank exports or personal data here.
