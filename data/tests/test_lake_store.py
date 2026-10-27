import io
from pathlib import Path

import boto3
import pytest
from botocore import UNSIGNED
from botocore.config import Config
from botocore.response import StreamingBody
from botocore.stub import Stubber

from splinance_data.lake.store import LocalLake, S3Lake, open_lake


def test_local_lake_round_trip_and_overwrite(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    lake.put("raw/source=ecb/date=2026-10-23/data.csv", b"first")
    lake.put("raw/source=ecb/date=2026-10-23/data.csv", b"second")

    assert lake.get("raw/source=ecb/date=2026-10-23/data.csv") == b"second"
    assert not list(tmp_path.rglob("*.tmp"))


def test_local_lake_keys_filters_by_prefix_and_sorts(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    for key in ["raw/s=1/b.csv", "raw/s=1/a.csv", "raw/s=2/c.csv", "clean/x.parquet"]:
        lake.put(key, b"")

    # Files only: the folders raw/s=1 and raw/s=2 match the prefix too.
    assert lake.keys("raw/") == ["raw/s=1/a.csv", "raw/s=1/b.csv", "raw/s=2/c.csv"]
    assert lake.keys("raw/s=1/") == ["raw/s=1/a.csv", "raw/s=1/b.csv"]
    assert lake.keys("nothing/") == []


def test_local_lake_refuses_keys_outside_its_folder(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="escapes"):
        LocalLake(tmp_path / "lake").put("../outside.txt", b"x")


def test_s3_lake_put_get_and_paginated_keys() -> None:
    # Unsigned: the Stubber answers every call, so no credentials are needed.
    client = boto3.client(
        "s3", region_name="eu-central-1", config=Config(signature_version=UNSIGNED)
    )
    lake = S3Lake("bucket", client)

    with Stubber(client) as stub:
        stub.add_response("put_object", {}, {"Bucket": "bucket", "Key": "raw/a", "Body": b"x"})
        stub.add_response(
            "get_object",
            {"Body": StreamingBody(io.BytesIO(b"x"), 1)},
            {"Bucket": "bucket", "Key": "raw/a"},
        )
        # Two pages: the second is requested with the first page's continuation token.
        stub.add_response(
            "list_objects_v2",
            {"Contents": [{"Key": "raw/b"}], "IsTruncated": True, "NextContinuationToken": "t"},
            {"Bucket": "bucket", "Prefix": "raw/"},
        )
        stub.add_response(
            "list_objects_v2",
            {"Contents": [{"Key": "raw/a"}], "IsTruncated": False},
            {"Bucket": "bucket", "Prefix": "raw/", "ContinuationToken": "t"},
        )

        lake.put("raw/a", b"x")
        assert lake.get("raw/a") == b"x"
        assert lake.keys("raw/") == ["raw/a", "raw/b"]
        stub.assert_no_pending_responses()


def test_open_lake(tmp_path: Path) -> None:
    assert isinstance(open_lake(str(tmp_path)), LocalLake)
    with pytest.raises(ValueError, match="s3://"):
        open_lake("s3://bucket/prefix")
