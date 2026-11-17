import pytest

from app.core.cards import (all_hand_classes, class_combo_count, class_combos, hand_class,
                            has_straight, parse_cards, CardError)
from app.core.ranges import RangeError, combo_count, parse_range, range_percent


def test_169_classes_1326_combos():
    hs = all_hand_classes()
    assert len(hs) == 169 and len(set(hs)) == 169
    assert sum(class_combo_count(h) for h in hs) == 1326
    assert sum(len(class_combos(h)) for h in hs) == 1326


def test_hand_class():
    assert hand_class("Kh", "Ah") == "AKs"
    assert hand_class("Ad", "Kc") == "AKo"
    assert hand_class("7s", "7d") == "77"


def test_parse_cards():
    assert parse_cards("AsKd") == ["As", "Kd"]
    assert parse_cards("10h 9h") == ["Th", "9h"]
    with pytest.raises(CardError):
        parse_cards("AsAs")
    with pytest.raises(CardError):
        parse_cards("Ax")


def test_has_straight_wheel_and_broadway():
    assert has_straight({12, 0, 1, 2, 3})        # A2345
    assert has_straight({8, 9, 10, 11, 12})      # TJQKA
    assert not has_straight({11, 12, 0, 1, 2})   # QKA23 no es escalera


@pytest.mark.parametrize("text,expected", [
    ("77+", {"77", "88", "99", "TT", "JJ", "QQ", "KK", "AA"}),
    ("QQ-TT", {"QQ", "JJ", "TT"}),
    ("A2s+", {f"A{r}s" for r in "23456789TJQK"}),
    ("KTo+", {"KTo", "KJo", "KQo"}),
    ("AK", {"AKs", "AKo"}),
    ("A5s-A2s", {"A5s", "A4s", "A3s", "A2s"}),
    ("T9s-76s", {"T9s", "98s", "87s", "76s"}),
    ("97s+", {"97s", "98s"}),
])
def test_parse_range(text, expected):
    assert set(parse_range(text)) == expected


def test_range_counts():
    r = parse_range("AA, AKs, AKo")
    assert combo_count(r) == 6 + 4 + 12
    assert range_percent(parse_range("22+")) == pytest.approx(100 * 78 / 1326)


@pytest.mark.parametrize("bad", ["KA", "AKx", "QQs", "77-A2s", "A5s-K2s", "Z9", "T9s-75s"])
def test_invalid_ranges(bad):
    with pytest.raises(RangeError):
        parse_range(bad)
