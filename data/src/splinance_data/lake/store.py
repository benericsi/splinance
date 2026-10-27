"""Where lake objects live: an S3 bucket, or a local folder holding the same keys.

Pipeline code takes a `Lake` and never knows which one it got, so tests and local runs use a
folder and need no AWS access.
"""

from pathlib import Path
from typing import TYPE_CHECKING, Protocol

import boto3

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class Lake(Protocol):
    def put(self, key: str, data: bytes) -> None:
        """Store `data` under `key`, replacing what was there."""
        ...

    def get(self, key: str) -> bytes: ...

    def keys(self, prefix: str) -> list[str]:
        """All keys starting with `prefix`, sorted."""
        ...


class LocalLake:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write then rename, so a reader never sees half a file (an S3 PUT is atomic too).
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def keys(self, prefix: str) -> list[str]:
        found = (
            path.relative_to(self.root).as_posix()
            for path in self.root.rglob("*")
            if path.is_file()
        )
        return sorted(key for key in found if key.startswith(prefix) and not key.endswith(".tmp"))

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError(f"key escapes the lake folder: {key!r}")
        return path


class S3Lake:
    def __init__(self, bucket: str, client: "S3Client | None" = None) -> None:
        self.bucket = bucket
        # Credentials and region come from the usual chain: `aws login` locally, env vars in
        # Airflow.
        self._client = client or boto3.client("s3")

    def put(self, key: str, data: bytes) -> None:
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def get(self, key: str) -> bytes:
        return self._client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def keys(self, prefix: str) -> list[str]:
        # One response holds at most 1000 keys; the paginator follows continuation tokens.
        pages = self._client.get_paginator("list_objects_v2").paginate(
            Bucket=self.bucket, Prefix=prefix
        )
        return sorted(obj["Key"] for page in pages for obj in page.get("Contents", []))


def open_lake(location: str) -> Lake:
    """`s3://<bucket>` for S3, anything else is a local folder."""
    if location.startswith("s3://"):
        bucket = location.removeprefix("s3://").strip("/")
        if not bucket or "/" in bucket:
            raise ValueError(f"expected s3://<bucket>, got {location!r}")
        return S3Lake(bucket)
    return LocalLake(Path(location))
