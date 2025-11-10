#!/usr/bin/env python3

"""
Recursively crawl an Apache directory listing and download all PDF files.

Example:
    python scripts/download_pdfs.py --dest /path/to/downloads
"""

from __future__ import annotations

import argparse
import os
import pathlib
import shutil
import sys
from html.parser import HTMLParser
from typing import Iterable, List, Optional
from urllib import error, parse, request


DEFAULT_BASE_URL = "https://wiki.red-fans.com/images/"
USER_AGENT = "Mozilla/5.0 (compatible; pdf-downloader/1.0)"


class DirectoryListingParser(HTMLParser):
    """Lightweight HTML parser that extracts href values from anchor tags."""

    def __init__(self) -> None:
        super().__init__()
        self.links: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple[str, str]]) -> None:
        if tag.lower() != "a":
            return
        attr_dict = dict(attrs)
        href = attr_dict.get("href")
        if href:
            self.links.append(href)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download all PDF files from an Apache directory listing."
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Root URL to crawl (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--dest",
        required=True,
        help="Local directory where PDF files will be saved.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List the files that would be downloaded without saving them.",
    )
    return parser.parse_args(argv)


def fetch_links(url: str) -> List[str]:
    """Fetch the links contained within an Apache directory listing page."""
    req = request.Request(url, headers={"User-Agent": USER_AGENT})
    with request.urlopen(req) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        content = resp.read().decode(charset, errors="replace")

    parser = DirectoryListingParser()
    parser.feed(content)
    return parser.links


def normalize_directory_url(url: str) -> str:
    stripped, _ = parse.urldefrag(url)
    if not stripped.endswith("/"):
        stripped += "/"
    return stripped


def is_same_origin(url: str, base: str) -> bool:
    parsed_url = parse.urlparse(url)
    parsed_base = parse.urlparse(base)
    return parsed_url.scheme == parsed_base.scheme and parsed_url.netloc == parsed_base.netloc


def is_within_base_path(url: str, base: str) -> bool:
    url_path = parse.urlparse(url).path
    base_path = parse.urlparse(base).path
    if not base_path.endswith("/"):
        base_path += "/"
    return url_path.startswith(base_path)


def should_skip_link(href: str) -> bool:
    href_lower = href.lower()
    return href_lower.startswith("?") or href_lower.startswith("#") or href_lower.startswith("javascript:") or href_lower.startswith("mailto:")


def classify_link(href: str) -> str:
    decoded = parse.unquote(href).strip()
    if decoded in ("", ".", "..") or decoded.startswith("../"):
        return "skip"
    if decoded.lower().endswith(".pdf"):
        return "pdf"
    if decoded.endswith("/"):
        return "dir"
    # Some Apache listings emit directory names like "folder/" but encode characters;
    # fall back to treating entries without a dot as directories.
    if "." not in decoded.split("/")[-1]:
        return "dir"
    return "other"


def get_remote_file_size(url: str) -> Optional[int]:
    """Return the remote file size in bytes if the server provides it."""
    try:
        req = request.Request(url, headers={"User-Agent": USER_AGENT}, method="HEAD")
        with request.urlopen(req) as resp:
            length = resp.headers.get("Content-Length")
            if length is not None:
                return int(length)
    except (error.HTTPError, error.URLError, ValueError) as exc:
        print(f"[INFO] Unable to determine size for {url}: {exc}")
    return None


def download_file(
    url: str,
    destination: pathlib.Path,
    dry_run: bool = False,
    expected_size: Optional[int] = None,
) -> None:
    if destination.exists():
        local_size = destination.stat().st_size
        if expected_size is not None and local_size == expected_size:
            print(f"[SKIP] {destination} already exists ({local_size} bytes).")
            return
        if expected_size is None:
            print(
                f"[INFO] {destination} exists ({local_size} bytes) but remote size unknown; redownloading."
            )
        else:
            print(
                f"[INFO] {destination} exists ({local_size} bytes) but expected {expected_size} bytes; redownloading."
            )

    if dry_run:
        size_msg = f" ({expected_size} bytes)" if expected_size is not None else ""
        print(f"[DRY-RUN] {url} -> {destination}{size_msg}")
        return

    destination.parent.mkdir(parents=True, exist_ok=True)

    req = request.Request(url, headers={"User-Agent": USER_AGENT})
    with request.urlopen(req) as resp, destination.open("wb") as fh:
        shutil.copyfileobj(resp, fh)

    downloaded_size = destination.stat().st_size
    if expected_size is not None and downloaded_size != expected_size:
        print(
            f"[WARN] Downloaded size mismatch for {destination}: "
            f"expected {expected_size} bytes, got {downloaded_size} bytes."
        )
    else:
        print(f"[DOWNLOADED] {url} -> {destination} ({downloaded_size} bytes)")


def build_local_path(url: str, base: str, dest_root: pathlib.Path) -> pathlib.Path:
    parsed_url = parse.urlparse(url)
    parsed_base = parse.urlparse(base)
    base_path = parsed_base.path
    if not base_path.endswith("/"):
        base_path += "/"
    rel_path = parsed_url.path
    if rel_path.startswith(base_path):
        rel_path = rel_path[len(base_path) :]
    rel_path = rel_path.lstrip("/")
    if not rel_path:
        rel_path = pathlib.PurePosixPath(parsed_url.path).name
    return dest_root.joinpath(*pathlib.PurePosixPath(rel_path).parts)


def crawl(base_url: str, dest_root: pathlib.Path, dry_run: bool = False) -> None:
    base_url = normalize_directory_url(base_url)
    queue = [base_url]
    visited = set()

    while queue:
        current = queue.pop()
        normalized = normalize_directory_url(current)
        if normalized in visited:
            continue
        visited.add(normalized)

        print(f"[CRAWL] Visiting {normalized}")

        try:
            links = fetch_links(current)
        except error.URLError as exc:
            print(f"[WARN] Failed to fetch {current}: {exc}")
            continue

        for href in links:
            if should_skip_link(href):
                continue
            absolute = parse.urljoin(current, href)
            absolute, _ = parse.urldefrag(absolute)

            if not is_same_origin(absolute, base_url) or not is_within_base_path(absolute, base_url):
                continue

            classification = classify_link(href)
            if classification == "dir":
                print(f"[QUEUE] Found directory: {absolute}")
                queue.append(absolute)
            elif classification == "pdf":
                local_path = build_local_path(absolute, base_url, dest_root)
                remote_size = get_remote_file_size(absolute)
                if remote_size is not None:
                    print(f"[FILE] {absolute} ({remote_size} bytes)")
                else:
                    print(f"[FILE] {absolute} (size unknown)")
                try:
                    download_file(
                        absolute,
                        local_path,
                        dry_run=dry_run,
                        expected_size=remote_size,
                    )
                except error.URLError as exc:
                    print(f"[WARN] Failed to download {absolute}: {exc}")


def main(argv: Iterable[str]) -> None:
    args = parse_args(argv)
    dest_root = pathlib.Path(os.path.abspath(args.dest))
    dest_root.mkdir(parents=True, exist_ok=True)
    print(f"Starting crawl from {args.base_url}")
    print(f"Saving PDFs to {dest_root}")
    if args.dry_run:
        print("Running in dry-run mode; no files will be saved.")
    crawl(args.base_url, dest_root, dry_run=args.dry_run)


if __name__ == "__main__":
    main(sys.argv[1:])

