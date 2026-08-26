#!/usr/bin/env python3
"""Quicksort in Python — a list-based and an in-place variant, plus a demo."""

from __future__ import annotations

import random
import time


def quicksort(values: list[int]) -> list[int]:
    """Return a new sorted list using divide-and-conquer quicksort.

    Splits around a pivot into less/equal/greater buckets and recurses on the
    two non-empty sides. Not stable; expected O(n log n), worst O(n^2).
    """
    if len(values) <= 1:
        return values
    pivot = values[len(values) // 2]  # middle pivot dodges the sorted-input worst case
    less = [v for v in values if v < pivot]
    equal = [v for v in values if v == pivot]
    greater = [v for v in values if v > pivot]
    return quicksort(less) + equal + quicksort(greater)


def quicksort_inplace(values: list[int], lo: int = 0, hi: int | None = None) -> None:
    """Sort values in place using the Lomuto partition scheme."""
    if hi is None:
        hi = len(values) - 1
    if lo >= hi:
        return
    pivot = _partition(values, lo, hi)
    quicksort_inplace(values, lo, pivot - 1)
    quicksort_inplace(values, pivot + 1, hi)


def _partition(values: list[int], lo: int, hi: int) -> int:
    """Partition values[lo..hi] around a median-of-three pivot; return its index."""
    mid = (lo + hi) // 2
    if values[lo] > values[mid]:
        values[lo], values[mid] = values[mid], values[lo]
    if values[lo] > values[hi]:
        values[lo], values[hi] = values[hi], values[lo]
    if values[mid] > values[hi]:
        values[mid], values[hi] = values[hi], values[mid]
    # Park the pivot just before hi so the Lomuto scan leaves it in place.
    values[mid], values[hi - 1] = values[hi - 1], values[mid]
    pivot = values[hi - 1]
    i = lo
    for j in range(lo, hi - 1):
        if values[j] <= pivot:
            values[i], values[j] = values[j], values[i]
            i += 1
    values[i], values[hi - 1] = values[hi - 1], values[i]
    return i


def main() -> None:
    sample = [5, 2, 9, 1, 7, 3, 8, 0, 4, 6]
    print("input   :", sample)
    print("list    :", quicksort(sample))

    data = list(sample)
    quicksort_inplace(data)
    print("inplace :", data)

    # Correctness: both variants must agree with the standard library.
    rng = random.Random(42)
    for _ in range(200):
        arr = [rng.randint(-50, 50) for _ in range(rng.randint(0, 60))]
        assert quicksort(arr) == sorted(arr)
        inplace = list(arr)
        quicksort_inplace(inplace)
        assert inplace == sorted(arr)
    print("checks  : 200 random cases match sorted()")

    # Timing on 100k random ints (reference: C-implemented sorted()).
    big = [rng.randint(0, 1_000_000) for _ in range(100_000)]
    t0 = time.perf_counter()
    quicksort(big)
    t1 = time.perf_counter()
    inplace = list(big)
    t2 = time.perf_counter()
    quicksort_inplace(inplace)
    t3 = time.perf_counter()
    sorted(big)
    t4 = time.perf_counter()
    print(f"timing  : list {100_000} → {(t1 - t0) * 1000:6.1f} ms")
    print(f"          inplace  → {(t3 - t2) * 1000:6.1f} ms")
    print(f"          sorted() → {(t4 - t3) * 1000:6.1f} ms (C, for reference)")


if __name__ == "__main__":
    main()
